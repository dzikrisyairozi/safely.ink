import { beforeEach, expect, test, vi } from 'vitest';
import type { AnalysisStatus } from '@repo/api-types';

const google = vi.hoisted(() => ({
  request: vi.fn(),
  verify: vi.fn(),
}));
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() {
      return { request: google.request };
    }
  },
  OAuth2Client: class {
    verifyIdToken = google.verify;
  },
}));

const queue = vi.hoisted(() => ({
  TASKS_QUEUE: 'projects/safely-ink/locations/asia-southeast2/queues/stages',
  WORKER_URL: 'https://worker.example.com',
  TASKS_SERVICE_ACCOUNT: 'tasks@safely-ink.iam.gserviceaccount.com',
}));
const setup = vi.hoisted(() => ({ queued: true }));
vi.mock('./config', async (original) => {
  const { config } = await original<typeof import('./config')>();
  return {
    config: new Proxy(config, {
      get: (target, key: string) =>
        key in queue
          ? setup.queued
            ? queue[key as keyof typeof queue]
            : undefined
          : target[key as keyof typeof target],
    }),
  };
});

vi.mock('./pipeline', async (original) => ({
  ...(await original<typeof import('./pipeline')>()),
  runStage: vi.fn(),
  runPipeline: vi.fn(async () => 'done'),
  abandonRun: vi.fn(async () => true),
}));

vi.mock('./budget', () => ({ isPaused: vi.fn(async () => true) }));

const { isPaused } = await import('./budget');
const { abandonRun, runPipeline, runStage } = await import('./pipeline');
const { enqueue, fromTaskQueue, startRun, work } = await import('./tasks');
const { app } = await import('./app');

const runId = '6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const task = (stage: AnalysisStatus) => ({
  analysisId: 'analysis-1',
  runId,
  stage,
});
const bodyOf = (call: number) =>
  JSON.parse(
    Buffer.from(
      google.request.mock.calls[call]![0].data.task.httpRequest.body,
      'base64',
    ).toString(),
  );

const signedBy = (email: string, verified = true) => ({
  getPayload: () => ({ email, email_verified: verified }),
});

beforeEach(() => {
  vi.clearAllMocks();
  setup.queued = true;
  google.request.mockResolvedValue({});
  google.verify.mockResolvedValue(signedBy(queue.TASKS_SERVICE_ACCOUNT));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

test('a stage is queued as an HTTP task to the worker, signed for it', async () => {
  await enqueue(task('fuzzing'));

  const [{ url, method, data }] = google.request.mock.calls[0]!;
  expect([url, method]).toEqual([
    'https://cloudtasks.googleapis.com/v2/projects/safely-ink/locations/asia-southeast2/queues/stages/tasks',
    'POST',
  ]);
  expect(data.task).toMatchObject({
    name: `${queue.TASKS_QUEUE}/tasks/analysis-1-${runId}-fuzzing`,
    dispatchDeadline: '1800s',
    httpRequest: {
      httpMethod: 'POST',
      url: 'https://worker.example.com/internal/stages',
      oidcToken: {
        serviceAccountEmail: queue.TASKS_SERVICE_ACCOUNT,
        audience: queue.WORKER_URL,
      },
    },
  });
  expect(bodyOf(0)).toEqual(task('fuzzing'));
});

test('a stage of a run that is queued already is not an error', async () => {
  google.request.mockRejectedValue(
    Object.assign(new Error('ALREADY_EXISTS'), { status: 409 }),
  );

  await expect(enqueue(task('fuzzing'))).resolves.toBeUndefined();
});

test('a first stage that cannot be queued ends the run as failed', async () => {
  google.request.mockRejectedValue(new Error('PERMISSION_DENIED'));

  expect(await startRun('analysis-1', runId, 'extracting_rules')).toBe(
    'failed',
  );

  expect(abandonRun).toHaveBeenCalledWith(
    'analysis-1',
    runId,
    'extracting_rules',
  );
});

test('with a queue a run starts as a task and returns at once', async () => {
  expect(await startRun('analysis-1', runId, 'extracting_rules')).toBe(
    'extracting_rules',
  );

  expect(google.request).toHaveBeenCalledTimes(1);
  expect(runPipeline).not.toHaveBeenCalled();
});

test('without a queue the run happens in the request', async () => {
  setup.queued = false;

  expect(await startRun('analysis-1', runId, 'extracting_rules')).toBe('done');

  expect(runPipeline).toHaveBeenCalledWith('analysis-1');
  expect(google.request).not.toHaveBeenCalled();
});

test.each([
  ['the tasks account', signedBy(queue.TASKS_SERVICE_ACCOUNT), true],
  ['another account', signedBy('someone@example.com'), false],
  ['an unverified email', signedBy(queue.TASKS_SERVICE_ACCOUNT, false), false],
])('a token signed for %s is from the queue: %s', async (_, ticket, ok) => {
  google.verify.mockResolvedValue(ticket);

  expect(await fromTaskQueue('Bearer token')).toBe(ok);
  expect(google.verify).toHaveBeenCalledWith({
    idToken: 'token',
    audience: queue.WORKER_URL,
  });
});

test('a bad token, no token or no queue is never from the queue', async () => {
  google.verify.mockRejectedValue(new Error('Wrong recipient'));
  expect(await fromTaskQueue('Bearer token')).toBe(false);
  expect(await fromTaskQueue(undefined)).toBe(false);

  setup.queued = false;
  google.verify.mockResolvedValue(signedBy(queue.TASKS_SERVICE_ACCOUNT));
  expect(await fromTaskQueue('Bearer token')).toBe(false);
});

test('a finished stage queues the next one', async () => {
  vi.mocked(runStage).mockResolvedValue({ status: 'fuzzing', moved: true });

  expect(await work(task('extracting_rules'))).toBe(200);

  expect(runStage).toHaveBeenCalledWith('analysis-1', {
    runId,
    expected: 'extracting_rules',
  });
  expect(bodyOf(0)).toEqual(task('fuzzing'));
});

test('a task for a stage its run is past queues the current stage', async () => {
  // The worker finished extracting_rules and died before queuing fuzzing.
  vi.mocked(runStage).mockResolvedValue({ status: 'fuzzing' });

  expect(await work(task('extracting_rules'))).toBe(200);

  expect(bodyOf(0)).toEqual(task('fuzzing'));
});

test.each([
  ['the last stage is done', { status: 'done', moved: true } as const],
  ['the stage failed', { status: 'failed' } as const],
  ['the task is of another run', { stale: true } as const],
])('nothing is queued when %s', async (_, result) => {
  vi.mocked(runStage).mockResolvedValue(result);

  expect(await work(task('comparing'))).toBe(200);

  expect(google.request).not.toHaveBeenCalled();
});

test('a busy stage answers 503, so Cloud Tasks tries the task again', async () => {
  vi.mocked(runStage).mockResolvedValue({ busy: true });

  expect(await work(task('running'))).toBe(503);
});

test('a next stage that cannot be queued is an error, so the task is tried again', async () => {
  vi.mocked(runStage).mockResolvedValue({ status: 'running', moved: true });
  google.request.mockRejectedValue(new Error('UNAVAILABLE'));

  await expect(work(task('fuzzing'))).rejects.toThrow('UNAVAILABLE');
});

const post = (body: unknown, token?: string) =>
  app.request('/internal/stages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });

test('the worker route runs a task from the queue', async () => {
  vi.mocked(runStage).mockResolvedValue({ busy: true });

  const res = await post(task('running'), 't');

  expect(res.status).toBe(503);
  expect(runStage).toHaveBeenCalledTimes(1);
});

test('the worker route is not there for anyone but the queue', async () => {
  google.verify.mockResolvedValue(signedBy('someone@example.com'));

  const res = await post(task('running'), 't');

  expect(res.status).toBe(404);
  expect(runStage).not.toHaveBeenCalled();
});

test('a malformed task is answered 200, so it is not tried again', async () => {
  const res = await post({ ...task('running'), analysisId: '../x' }, 't');

  expect(res.status).toBe(200);
  expect(runStage).not.toHaveBeenCalled();
});

test('a budget pause does not block a worker stage or its next task', async () => {
  vi.mocked(runStage).mockResolvedValue({ status: 'fuzzing', moved: true });

  const res = await post(task('extracting_rules'), 't');

  expect(res.status).toBe(200);
  expect(runStage).toHaveBeenCalledOnce();
  expect(bodyOf(0)).toEqual(task('fuzzing'));
  expect(isPaused).not.toHaveBeenCalled();
});
