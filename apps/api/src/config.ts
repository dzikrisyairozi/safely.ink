import { z } from 'zod';
import {
  GRADE_FORMULA,
  UPLOAD_LIMITS,
  type LawJurisdiction,
} from '@repo/api-types';
import type { ScoreWeights } from './engine/score';

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  // The dashboard URL; the only origin CORS allows.
  ALLOWED_ORIGIN: z.url().default('http://localhost:5174'),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  // Optional until the first stage that calls a model.
  GEMINI_API_KEY: z.string().optional(),
});

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
      // batches side by side, then the wording. A fuzzer call may take what
      // is left of confirmSeconds once the judge and the wording have theirs,
      // between fuzz and fuzzMost: the earlier calls seldom use their whole
      // limit, and at 90 s the baseline call did not answer in 1 run of 3.
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
        // The law lookup runs beside the judge. Seen in the spike of
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
    } satisfies ScoreWeights,
  });
}

export const config = loadConfig(process.env);
