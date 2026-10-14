import { beforeEach, expect, test, vi } from 'vitest';
import type { AnalysisMeta, Rule } from '@repo/api-types';
import {
  assessLaw,
  readLawPage,
  searchInput,
  searchLaw,
} from './legal-researcher';

// Only the model is replaced: it answers with what a test gives it, and
// what it was asked is kept.
const model = vi.hoisted(() => ({
  answer: '',
  grounding: [] as { web: { uri: string } }[],
  agent: {} as {
    model: unknown;
    instruction: string;
    tools?: unknown[];
    outputSchema?: unknown;
  },
  message: '',
  page: {} as Record<string, unknown>,
  pageRequest: {} as { contents: string; config: { tools: unknown[] } },
}));
vi.mock('@google/adk', () => ({
  GOOGLE_SEARCH: { name: 'google_search' },
  Gemini: class {
    constructor(public options: { model: string }) {}
  },
  LlmAgent: class {
    constructor(options: typeof model.agent) {
      model.agent = options;
    }
  },
  InMemoryRunner: class {
    async *runEphemeral(run: { newMessage: { parts: { text: string }[] } }) {
      model.message = run.newMessage.parts[0]!.text;
      yield { groundingMetadata: { groundingChunks: model.grounding } };
    }
  },
  isFinalResponse: () => true,
  stringifyContent: () => model.answer,
}));
vi.mock('@google/genai', async (original) => ({
  ...(await original<typeof import('@google/genai')>()),
  GoogleGenAI: class {
    models = {
      generateContent: async (request: typeof model.pageRequest) => {
        model.pageRequest = request;
        return model.page;
      },
    };
  },
}));
vi.mock('../config', async (original) => {
  const { config } = await original<typeof import('../config')>();
  return { config: { ...config, GEMINI_API_KEY: 'test-key' } };
});

// Everything the search must not see says SECRET.
const meta: AnalysisMeta & { jurisdiction: 'SG' } = {
  docType: 'insurance',
  title: 'SECRET title',
  parties: [{ name: 'SECRET party', role: 'SECRET role' }],
  userRole: 'insured',
  jurisdiction: 'SG',
  lawChecked: true,
  detected: { docType: 'insurance', jurisdiction: 'SG' },
  language: 'en',
  pageCount: 3,
  unreadablePages: [],
};
const rule: Rule = {
  id: 'r-002',
  kind: 'exclusion',
  summary: 'A condition you did not know about is not covered.',
  clauseIds: ['SECRET-clause'],
  when: { fact: 'SECRETfact', op: 'eq', value: true },
  effect: { type: 'deny', amount: null, percent: null },
  touches: ['SECRETfact'],
};

beforeEach(() => {
  model.answer = 'The Insurance Act 1966, section 23, applies.';
  model.grounding = [];
  model.message = '';
});

test('the law search is given the rule in plain words and the kind of document, nothing else', () => {
  expect(searchInput(rule, meta)).toEqual({
    term: rule.summary,
    kind: 'exclusion',
    document: 'an insurance policy',
    userRole: 'insured',
    country: 'Singapore',
  });
});

test('the search is told the official sites and grounds on Google Search, without a schema', async () => {
  model.grounding = [
    {
      web: {
        uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a',
      },
    },
    {
      web: {
        uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/b',
      },
    },
  ];

  const uris = await searchLaw(rule, meta, ['sso.agc.gov.sg', 'mas.gov.sg']);

  expect(uris).toEqual(model.grounding.map(({ web }) => web.uri));
  expect(model.message).toContain(rule.summary);
  expect(model.message).toContain('site:sso.agc.gov.sg OR site:mas.gov.sg');
  expect(model.message).not.toContain('SECRET');
  expect(model.agent.tools).toEqual([{ name: 'google_search' }]);
  expect(model.agent.outputSchema).toBeUndefined();
});

test('a search with an empty answer failed; it did not find nothing', async () => {
  model.answer = '';

  await expect(searchLaw(rule, meta, ['sso.agc.gov.sg'])).rejects.toThrow(
    /empty answer/,
  );
});

test('the assessment has a schema and no tools, and reads the pages', async () => {
  model.answer = JSON.stringify({
    status: 'conflicts',
    reasoning: 'r',
    citations: [],
  });
  const pages = [
    { url: 'https://sso.agc.gov.sg/Act/IA1966', text: 'Law text' },
  ];

  expect(await assessLaw(rule, meta, pages)).toMatchObject({
    status: 'conflicts',
  });
  expect(model.agent.tools).toBeUndefined();
  expect(model.agent.outputSchema).toBeDefined();
  expect(JSON.parse(model.message)).toEqual({
    ...searchInput(rule, meta),
    pages,
  });
});

const read = (status: string, finishReason: string, text = 'The Act.') => ({
  candidates: [
    {
      finishReason,
      urlContextMetadata: { urlMetadata: [{ urlRetrievalStatus: status }] },
    },
  ],
  text,
});

test('a page the model opened and copied is its text', async () => {
  model.page = read('URL_RETRIEVAL_STATUS_SUCCESS', 'STOP');

  expect(await readLawPage('https://www.mom.gov.sg/a.pdf')).toBe('The Act.');
  expect(model.pageRequest.contents).toContain('https://www.mom.gov.sg/a.pdf');
  expect(model.pageRequest.config.tools).toEqual([{ urlContext: {} }]);
});

test('an apology for a page the model could not open is not its text', async () => {
  model.page = read(
    'URL_RETRIEVAL_STATUS_ERROR',
    'STOP',
    'I am unable to access the document, but it is about consumer protection.',
  );

  expect(await readLawPage('https://ojk.go.id/a.pdf')).toBeNull();
});

test('a page the model would not copy gives nothing', async () => {
  model.page = read('URL_RETRIEVAL_STATUS_SUCCESS', 'RECITATION', '');

  expect(await readLawPage('https://peraturan.bpk.go.id/a.pdf')).toBeNull();
});

test('the pages of one assessment are cut to one budget, in the order found', async () => {
  model.answer = JSON.stringify({
    status: 'no_finding',
    reasoning: 'r',
    citations: [],
  });
  const page = (n: number) => ({
    url: `https://www.legislation.gov.au/${n}`,
    text: 'x'.repeat(1_000_000),
  });

  await assessLaw(rule, meta, [page(1), page(2), page(3)]);

  const sent = JSON.parse(model.message).pages as {
    url: string;
    text: string;
  }[];
  expect(sent.map(({ text }) => text.length)).toEqual([1_000_000, 500_000]);
});
