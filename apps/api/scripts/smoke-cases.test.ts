import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { applyEdits, Manifest, variants } from './smoke-cases';

const base = readFileSync(
  new URL('../test/fixtures/smoke/base.md', import.meta.url),
  'utf8',
);
const shipped: unknown = JSON.parse(
  readFileSync(
    new URL('../test/fixtures/smoke/cases.json', import.meta.url),
    'utf8',
  ),
);

test('the shipped manifest parses, every find occurs once, and every edit applies', () => {
  const manifest = Manifest.parse(shipped);
  expect(manifest.cases).toHaveLength(8);
  for (const c of manifest.cases) {
    for (const edit of c.edits) expect(base.split(edit.find)).toHaveLength(2);
    const variant = variants(base, manifest).find((v) => v.id === c.id)!;
    expect(variant.text).toBe(applyEdits(base, c.edits));
    expect(variant.text).not.toBe(base);
    for (const edit of c.edits) {
      if (edit.replace) expect(variant.text).toContain(edit.replace);
      if (!edit.replace.includes(edit.find))
        expect(variant.text).not.toContain(edit.find);
    }
  }
});

test('each effective assertion anchor appears once and absent anchors disappear in its variant', () => {
  for (const variant of variants(base, Manifest.parse(shipped))) {
    for (const assertion of variant.assertions)
      expect(
        variant.text.split(assertion.clause),
        `${variant.id}: ${assertion.clause}`,
      ).toHaveLength(2);
    for (const anchor of variant.absent)
      expect(variant.text).not.toContain(anchor);
  }
});

test('case replacements remove only the named base checks', () => {
  const manifest = Manifest.parse(shipped);
  for (const c of manifest.cases) {
    const variant = variants(base, manifest).find((v) => v.id === c.id)!;
    expect(variant.assertions).toEqual([
      ...manifest.assertions.filter(
        (a) => !c.replaces?.assertions?.includes(a.clause),
      ),
      ...(c.assertions ?? []),
    ]);
    expect(variant.probes).toEqual([
      ...manifest.probes.filter((p) => !c.replaces?.probes?.includes(p.id)),
      ...(c.probes ?? []),
    ]);
  }
});

test('ambiguous edits and invalid or mistyped base facts are refused', () => {
  expect(() =>
    applyEdits('same same', [{ find: 'same', replace: '' }]),
  ).toThrow('exactly once');
  expect(() => applyEdits('same', [{ find: 'missing', replace: '' }])).toThrow(
    'exactly once',
  );
  for (const facts of [{ extra: true }, { userPaidOnTime: 'yes' }]) {
    expect(
      Manifest.safeParse({
        assertions: [],
        cases: [],
        probes: [{ id: 'p', facts, stake: null, expect: { result: 'fine' } }],
      }).success,
    ).toBe(false);
  }
  const manifest = Manifest.parse(shipped);
  expect(
    Manifest.safeParse({
      ...manifest,
      cases: [...manifest.cases, manifest.cases[0]],
    }).success,
  ).toBe(false);
  expect(
    Manifest.safeParse({
      ...manifest,
      cases: [{ ...manifest.cases[0], replaces: { probes: ['missing'] } }],
    }).success,
  ).toBe(false);
});

test('the shipped manifest probes both sides of every day boundary', () => {
  const manifest = Manifest.parse(
    JSON.parse(
      readFileSync(
        new URL('../test/fixtures/smoke/cases.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  const ids = (probes: { id: string }[]) => probes.map((probe) => probe.id);
  const short = manifest.cases.find((c) => c.id === 'short-notice')!;

  expect(ids(manifest.probes)).toEqual(
    expect.arrayContaining([
      'notice-on-time',
      'notice-late',
      'waiting',
      'waiting-ended',
      'charge-last-day',
      'charge-ended',
    ]),
  );
  expect(ids(short.probes ?? [])).toEqual(
    expect.arrayContaining(['notice-day-10', 'notice-day-11']),
  );
});
