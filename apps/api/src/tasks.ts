import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { AnalysisId, AnalysisStatus } from '@repo/api-types';
import { config } from './config';
import { abandonRun, isStage, runPipeline, runStage } from './pipeline';
import { log } from './telemetry';

// The body of a task: which analysis, which run of it, and the stage the
// task was made for. A task of another run, or for a stage the run is past,
// does nothing.
export const StageTask = z.object({
  analysisId: AnalysisId,
  runId: z.uuid(),
  stage: AnalysisStatus,
});
export type StageTask = z.infer<typeof StageTask>;

export const WORKER_PATH = '/internal/stages';

// Cloud Tasks allows an HTTP task 30 minutes at most. A stage has
// confirmSeconds, and the worker's Cloud Run timeout is set above that.
const DISPATCH_DEADLINE = '1800s';

const queued = () =>
  config.TASKS_QUEUE && config.WORKER_URL && config.TASKS_SERVICE_ACCOUNT
    ? {
        queue: config.TASKS_QUEUE,
        worker: config.WORKER_URL,
        account: config.TASKS_SERVICE_ACCOUNT,
      }
    : null;

let googleAuth: GoogleAuth | undefined;

/**
 * Puts one stage on the queue as an HTTP task to the worker, signed with an
 * OIDC token of the tasks service account. Through the REST API, so the
 * service needs no gRPC client. The task is named by analysis, run and stage,
 * so the queue holds one task per stage of a run: queuing it again, after a
 * crash or a lost answer, finds the first and is not an error.
 */
export async function enqueue(task: StageTask) {
  const setup = queued();
  if (!setup) throw new Error('No task queue is set up.');
  googleAuth ??= new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await googleAuth.getClient();
  const name = `${setup.queue}/tasks/${task.analysisId}-${task.runId}-${task.stage}`;
  try {
    await client.request({
      url: `https://cloudtasks.googleapis.com/v2/${setup.queue}/tasks`,
      method: 'POST',
      data: {
        task: {
          name,
          dispatchDeadline: DISPATCH_DEADLINE,
          httpRequest: {
            httpMethod: 'POST',
            url: `${setup.worker}${WORKER_PATH}`,
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.from(JSON.stringify(task)).toString('base64'),
            oidcToken: {
              serviceAccountEmail: setup.account,
              audience: setup.worker,
            },
          },
        },
      },
    });
  } catch (err) {
    // ALREADY_EXISTS: this stage of this run is queued.
    if ((err as { status?: number }).status === 409) return;
    throw err;
  }
}

/**
 * Starts a run of an analysis at `stage`. With a queue the stage becomes a
 * task and this returns at once with that stage; a stage that cannot be
 * queued ends the run as failed, unless it started after all. Without a
 * queue the stages run here and this returns where the analysis ended.
 */
export async function startRun(
  analysisId: string,
  runId: string,
  stage: AnalysisStatus,
): Promise<AnalysisStatus> {
  if (!queued()) return runPipeline(analysisId);
  try {
    await enqueue({ analysisId, runId, stage });
    return stage;
  } catch (err) {
    log('ERROR', 'first stage not queued', {
      analysisId,
      stage,
      error: String(err),
    });
    return (await abandonRun(analysisId, runId, stage)) ? 'failed' : stage;
  }
}

const verifier = new OAuth2Client();

/**
 * True when the bearer token is a Google-signed OIDC token for the worker,
 * issued to the tasks service account. Cloud Run IAM also checks the token
 * on the worker service, but the API runs the same image with public access,
 * so the app checks it too.
 */
export async function fromTaskQueue(header: string | undefined) {
  const setup = queued();
  const token = header?.match(/^Bearer (.+)$/)?.[1];
  if (!setup || !token) return false;
  try {
    const ticket = await verifier.verifyIdToken({
      idToken: token,
      audience: setup.worker,
    });
    const payload = ticket.getPayload();
    return payload?.email === setup.account && payload.email_verified === true;
  } catch {
    return false;
  }
}

/**
 * What the worker does with one task: runs its stage and puts the next one
 * on the queue. Returns the HTTP status for Cloud Tasks, which tries a task
 * again until it gets a 2xx: 503 while another attempt holds the lease, so a
 * stage whose worker died runs again once its lease runs out, and an error
 * (500) when the next stage could not be queued. A task for a stage its run
 * is past queues the run's current stage, which the task name makes a no-op
 * when it is queued already, so a crash between finishing a stage and
 * queuing the next does not leave the run without a task.
 */
export async function work(task: StageTask): Promise<200 | 503> {
  const result = await runStage(task.analysisId, {
    runId: task.runId,
    expected: task.stage,
  });
  if ('busy' in result) return 503;
  if ('stale' in result || !isStage(result.status)) return 200;
  await enqueue({ ...task, stage: result.status });
  return 200;
}
