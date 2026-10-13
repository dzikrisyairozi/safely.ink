import { z } from 'zod';

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
      uploadMaxBytes: 30 * 1024 * 1024,
      uploadMaxPages: 100,
      scenariosPerAnalysis: 40,
      analysesPerUserPerDay: 10,
    },

    // Official legal sources per jurisdiction. `*` stands for one host label.
    legalSources: {
      ID: [
        'peraturan.go.id',
        'peraturan.bpk.go.id',
        'jdih.*.go.id',
        'ojk.go.id',
        'pasal.id',
      ],
      SG: ['sso.agc.gov.sg', 'mas.gov.sg', 'mom.gov.sg'],
      AU: ['legislation.gov.au', 'asic.gov.au', 'fairwork.gov.au'],
    },
  });
}

export const config = loadConfig(process.env);
