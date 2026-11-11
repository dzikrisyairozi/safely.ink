import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { ReaderOutput } from '@repo/api-types';
import { Manifest } from './smoke-cases';
import {
  compareBaseline,
  renderPdf,
  runSmoke,
  type Dependencies,
  type Hashes,
} from './smoke';

const hashes: Hashes = {
  'base.md': 'base',
  'cases.json': 'cases',
  'smoke-check.ts': 'check',
  'extract.ts': 'extract',
};
const manifest = Manifest.parse({
  assertions: [{ clause: 'Late fee', kind: 'charge', amount: 100 }],
  probes: [
    {
      id: 'late',
      facts: { userPaidOnTime: false },
      stake: 1000,
      expect: { result: 'partly_bad', loss: 100 },
    },
  ],
  cases: [
    {
      id: 'address',
      note: 'Irrelevant edit',
      edits: [{ find: 'Address A', replace: 'Address B' }],
    },
  ],
});
const input = { base: 'Late fee\nAddress A', manifest, runs: 3, hashes };
const reader: ReaderOutput = {
  isPolicyOrContract: true,
  docType: 'loan',
  title: 'Loan',
  parties: [],
  jurisdiction: 'ID',
  language: 'id',
  unreadablePages: [],
  clauses: [
    { text: 'Late fee', number: '1', heading: null, gloss: null, page: 1 },
  ],
};
function fake(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    readDocument: async (files, pages) => {
      expect(files[0]!.bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pages).toBeGreaterThan(0);
      return structuredClone(reader);
    },
    proposeFacts: async (_clauses, _pack, meta) => {
      expect(meta.userRole).toBe('Debitur');
      return [];
    },
    rulesFor: async (clauses, schema, meta) => {
      expect(schema.some((f) => f.key === 'userPaidOnTime')).toBe(true);
      expect(meta.docType).toBe('loan');
      return {
        rules: [
          {
            id: 'r',
            kind: 'charge',
            summary: '',
            clauseIds: [clauses[0]!.id],
            touches: ['userPaidOnTime'],
            when: { fact: 'userPaidOnTime', op: 'eq', value: false },
            effect: { type: 'charge', amount: 100, percent: null },
          },
        ],
        diagnostics: { repairError: null, demoted: [] },
      };
    },
    ...overrides,
  };
}

test('the injected runner passes with real reading, fact checks, assertions, and engine probes', async () => {
  const report = await runSmoke(input, fake());
  expect(report).toMatchObject({
    gate: 'extraction smoke gate',
    partial: false,
    result: 'passed',
    runs: 3,
    hashes,
  });
  expect(report.cases.map((c) => c.passingRuns)).toEqual([3, 3]);
  expect(report.cases[0]!.attempts[0]).toMatchObject({
    reader,
    probes: [{ id: 'late', outcome: { result: 'partly_bad', loss: 100 } }],
    failures: [],
  });
  expect(report.versions.models).toBeDefined();
});

test('an assertion failure fails the case and a failed base yields base_failed', async () => {
  const report = await runSmoke(
    {
      ...input,
      manifest: Manifest.parse({
        ...manifest,
        cases: [
          {
            ...manifest.cases[0],
            assertions: [{ clause: 'Late fee', amount: 200 }],
          },
        ],
      }),
    },
    fake(),
  );
  expect(report.result).toBe('failed');
  expect(report.cases[1]!.attempts[0]!.failures.join('\n')).toContain(
    'No rule',
  );
  const failedBase = await runSmoke(
    input,
    fake({
      rulesFor: async () => ({
        rules: [],
        diagnostics: { repairError: null, demoted: [] },
      }),
    }),
  );
  expect(failedBase.result).toBe('base_failed');
  expect(failedBase.cases).toHaveLength(2);
});

test('a thrown model error is recorded and subsequent attempts and cases continue', async () => {
  let calls = 0;
  const dependencies = fake({
    readDocument: async () => {
      if (++calls === 1) throw new Error('model failed');
      return reader;
    },
  });
  const report = await runSmoke(input, dependencies);
  expect(calls).toBe(6);
  expect(report.cases[0]!.attempts[0]!.failures).toEqual([
    'Error: model failed',
  ]);
  expect(report.cases.map((c) => c.passingRuns)).toEqual([2, 3]);
  expect(report.result).toBe('passed');
});

test.each([
  [1, 1, true],
  [2, 1, false],
  [3, 2, true],
  [3, 1, false],
  [4, 2, false],
  [4, 3, true],
])(
  'the provisional two-thirds rule for %i runs with %i passes is %s',
  async (runs, passes, passed) => {
    let calls = 0;
    const report = await runSmoke(
      { ...input, runs, manifest: { ...manifest, cases: [] } },
      fake({
        readDocument: async () => {
          if (++calls > passes) throw new Error('failed');
          return reader;
        },
      }),
    );
    expect(report.cases[0]!.passed).toBe(passed);
  },
);

test.each(['rejected', 'failed', 'unreadable', 'repair'] as const)(
  '%s makes an attempt fail',
  async (failure) => {
    const dependencies = fake({
      readDocument: async () => ({
        ...reader,
        ...(failure === 'rejected'
          ? { isPolicyOrContract: false }
          : failure === 'failed'
            ? { clauses: [] }
            : failure === 'unreadable'
              ? { unreadablePages: [1] }
              : {}),
      }),
    });
    if (failure === 'repair') {
      const original = dependencies.rulesFor;
      dependencies.rulesFor = async (...args) => ({
        ...(await original(...args)),
        diagnostics: { repairError: 'repair timed out', demoted: [] },
      });
    }
    const report = await runSmoke({ ...input, runs: 1 }, dependencies);
    expect(report.result).toBe('base_failed');
    expect(report.cases[0]!.attempts[0]!.failures.join('\n')).toMatch(
      /rejected|failed|unreadable|repair timed out/,
    );
  },
);

test('baseline comparison reports each drop and refuses each changed hash or run count', async () => {
  const baseline = await runSmoke(input, fake());
  const report = {
    ...baseline,
    cases: baseline.cases.map((c) => ({ ...c, passingRuns: 2 })),
  };
  expect(compareBaseline(report, baseline)).toEqual([
    'base: passing runs fell from 3 to 2',
    'address: passing runs fell from 3 to 2',
  ]);
  expect(compareBaseline(baseline, baseline)).toEqual([]);
  for (const key of Object.keys(hashes))
    expect(() =>
      compareBaseline(
        { ...report, hashes: { ...hashes, [key]: 'changed' } },
        baseline,
      ),
    ).toThrow(`hash differs: ${key}`);
  expect(() => compareBaseline({ ...report, runs: 4 }, baseline)).toThrow(
    '--runs differs',
  );
});

test('case selection keeps the base, marks partial, and refuses baseline use in both directions', async () => {
  const partial = await runSmoke({ ...input, caseId: 'address' }, fake());
  expect(partial.partial).toBe(true);
  expect(partial.cases.map((c) => c.id)).toEqual(['base', 'address']);
  const baseOnly = await runSmoke({ ...input, caseId: 'base' }, fake());
  expect(baseOnly.partial).toBe(true);
  expect(baseOnly.cases.map((c) => c.id)).toEqual(['base']);
  const full = { ...partial, partial: false };
  expect(() => compareBaseline(full, partial)).toThrow('Partial');
  expect(() => compareBaseline(partial, full)).toThrow('Partial');
  await expect(
    runSmoke({ ...input, caseId: 'unknown' }, fake()),
  ).rejects.toThrow('Unknown case');
  await expect(runSmoke({ ...input, runs: 0 }, fake())).rejects.toThrow(
    'positive integer',
  );
});

test('every shipped variant survives PDF rendering and unpdf text verification', async () => {
  const base = readFileSync(
    new URL('../test/fixtures/smoke/base.md', import.meta.url),
    'utf8',
  );
  const shipped = Manifest.parse(
    JSON.parse(
      readFileSync(
        new URL('../test/fixtures/smoke/cases.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  const { variants } = await import('./smoke-cases');
  for (const variant of variants(base, shipped)) {
    const pdf = await renderPdf(variant.text);
    expect(pdf.pageCount).toBeGreaterThan(0);
  }
});
