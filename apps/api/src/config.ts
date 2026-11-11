import { z } from 'zod';
import {
  GRADE_FORMULA,
  UPLOAD_LIMITS,
  type LawJurisdiction,
} from '@repo/api-types';
import type { ScoreWeights } from './engine/score';
import type { PriceList } from './telemetry';

const Env = z
  .object({
    PORT: z.coerce.number().int().positive().default(3001),
    // The dashboard URL; the only origin CORS allows.
    ALLOWED_ORIGIN: z.url().default('http://localhost:5174'),
    GOOGLE_CLOUD_PROJECT: z.string().optional(),
    STORAGE_BUCKET: z.string().optional(),
    // Optional until the first stage that calls a model.
    GEMINI_API_KEY: z.string().optional(),
    // The three together run each stage as a Cloud Task on the worker; without
    // them the stages run in the request that started them.
    // "projects/{project}/locations/{region}/queues/{queue}"
    TASKS_QUEUE: z
      .string()
      .regex(/^projects\/[^/]+\/locations\/[^/]+\/queues\/[^/]+$/)
      .optional(),
    WORKER_URL: z.url().optional(), // the worker service, also the token audience
    TASKS_SERVICE_ACCOUNT: z.email().optional(), // the account tasks sign as
    BUDGET_PUSH_AUDIENCE: z.url().optional(),
    BUDGET_PUSH_SERVICE_ACCOUNT: z.email().optional(),
  })
  .refine(
    (env) =>
      [env.TASKS_QUEUE, env.WORKER_URL, env.TASKS_SERVICE_ACCOUNT].every(
        (value) => value === undefined,
      ) ||
      [env.TASKS_QUEUE, env.WORKER_URL, env.TASKS_SERVICE_ACCOUNT].every(
        (value) => value !== undefined,
      ),
    {
      message:
        'Set TASKS_QUEUE, WORKER_URL and TASKS_SERVICE_ACCOUNT together, or none of them.',
    },
  )
  .refine(
    (env) =>
      (env.BUDGET_PUSH_AUDIENCE === undefined) ===
      (env.BUDGET_PUSH_SERVICE_ACCOUNT === undefined),
    {
      message:
        'Set BUDGET_PUSH_AUDIENCE and BUDGET_PUSH_SERVICE_ACCOUNT together, or none of them.',
    },
  );

export function loadConfig(env: NodeJS.ProcessEnv) {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }

  return Object.freeze({
    ...parsed.data,

    // Checked against the Gemini model list on 2026-10-13. There is no
    // generally available Pro model for new keys, only this preview.
    models: {
      pro: 'gemini-3.1-pro-preview',
      flash: 'gemini-3.8-flash',
    },

    // Standard paid prices in US dollars per 1M tokens, from
    // https://ai.google.dev/gemini-api/docs/pricing, read on 2026-10-18.
    // Thinking tokens are paid as output. Add a dated entry when a price
    // changes, so older analyses keep the price of their day.
    prices: {
      models: {
        'gemini-3.1-pro-preview': [
          {
            from: '2026-01-01',
            input: 2,
            cached: 0.2,
            output: 12,
            over: { tokens: 200_000, input: 4, cached: 0.4, output: 18 },
          },
        ],
        'gemini-3.8-flash': [
          { from: '2026-01-01', input: 0.75, cached: 0.075, output: 3.75 },
          { from: '2027-01-01', input: 1.5, cached: 0.15, output: 7.5 },
        ],
      } satisfies PriceList,
    },

    limits: {
      uploadMaxBytes: UPLOAD_LIMITS.maxBytes,
      uploadMaxPages: UPLOAD_LIMITS.maxPages,
      scenariosPerAnalysis: 40,
      analysesPerUserPerDay: 10,
      // Counts the runs whose slot was given back too, so those have a limit.
      attemptsPerUserPerDay: 30,
      // How long one call to a model may take. Cloud Run ends a request after
      // 900 s. The Reader's calls run side by side in one request. In the
      // confirm request the facts, the rules and the repair run one after
      // the other, then the fuzzer's calls side by side, then the judge's
      // batches side by side, then the law lookup, then the wording. A fuzzer
      // call may take what is left of confirmSeconds once the judge, the law
      // and the wording have theirs, between fuzz and fuzzMost: the earlier
      // calls seldom use their whole limit, and at 90 s the baseline call did
      // not answer in 1 run of 3.
      // Measured on the demo policy, whose 21 numbered clauses the Reader gives
      // as 24 (2026-10-13): facts 66 to 78 s, rules 112 s to over 150 s, a
      // fuzzer call 55 to 60 s. A repair of two rules did not answer in 60 s.
      modelCallSeconds: {
        read: 540,
        facts: 100,
        rules: 240,
        repair: 120,
        fuzz: 90,
        fuzzMost: 240,
        judge: 90,
        wording: 60,
        // The law is looked up after the judge. Seen in the spike of
        // 2026-10-14: a search 15 to 21 s with thinking low, an assessment
        // of a 151,000-character Act 18 s, URL context 4 to 76 s.
        lawSearch: 60,
        lawPage: 60,
        lawAssess: 90,
      },
      // In which the stages of the confirm request must end.
      confirmSeconds: 850,
      law: {
        atOnce: 4, // rules looked up side by side
        pagesPerRule: 3, // also bounds the size of an assessment
        // A consolidated Australian Act is about 1.4 MB of HTML (ADR 4).
        pageBytes: 5 * 1024 * 1024,
        // sso.agc.gov.sg pages of 650 KB did not arrive in 10 s while three
        // analyses ran (2026-10-14).
        pageSeconds: 20,
        pageDays: 30, // a stored page older than this is fetched again
      },
    },

    // Official legal sources per jurisdiction. `*` stands for one host label.
    legalSources: {
      ID: [
        'peraturan.go.id',
        'peraturan.bpk.go.id',
        'jdih.*.go.id',
        'ojk.go.id',
      ],
      SG: ['sso.agc.gov.sg', 'mas.gov.sg', 'mom.gov.sg'],
      AU: ['legislation.gov.au', 'asic.gov.au', 'fairwork.gov.au'],
    } satisfies Record<LawJurisdiction, string[]>,

    // Severity, grade and confidence numbers of TSD 5.7. A first guess, kept
    // here so they can be tuned against real documents.
    scoring: {
      lossBands: [
        { from: 0.8, value: 3 },
        { from: 0.3, value: 2 },
        { from: 0, value: 1 },
      ],
      lossWithoutStake: 3,
      frequency: { common: 2, occasional: 1, rare: 0 },
      law: { conflicts: 3, restricted: 2, permitted: 0, no_finding: 0 },
      severityBands: [
        { from: 6, value: 'critical' },
        { from: 4, value: 'high' },
        { from: 2, value: 'medium' },
        { from: 0, value: 'low' },
      ],
      ...GRADE_FORMULA,
      undeterminedShare: { high: 0.1, medium: 0.25 },
      coverage: { branches: 0.75, rules: 0.75 },
    } satisfies ScoreWeights,
  });
}

export const config = loadConfig(process.env);
