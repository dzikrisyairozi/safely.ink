import { z } from 'zod';
import { Outcome, Rule } from '@repo/api-types';
import { BASE_FACTS } from '../src/pipeline/rule-check';

const anchor = z.string().min(1);
export const Assertion = z
  .strictObject({
    clause: anchor,
    kind: Rule.shape.kind.optional(),
    effectType: z.enum(['grant', 'deny', 'cap', 'deduct', 'charge']).optional(),
    amount: z.number().nonnegative().optional(),
    percent: z.number().nonnegative().optional(),
    numberInCondition: z.number().optional(),
    baseFact: z
      .string()
      .refine(
        (key) => BASE_FACTS.some((fact) => fact.key === key),
        'Must name a base fact',
      )
      .optional(),
  })
  .refine(
    (a) => a.amount === undefined || a.percent === undefined,
    'Use only amount or percent',
  );
export type Assertion = z.infer<typeof Assertion>;
export const Probe = z
  .strictObject({
    id: anchor,
    facts: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])),
    stake: z.number().nonnegative().nullable(),
    // Anchor of the benefit clause the probe is about. Its benefit rules are
    // the scenario's targets, so a benefit that does not apply is `bad`.
    target: anchor.optional(),
    expect: z.strictObject({
      result: Outcome.shape.result,
      loss: z.number().optional(),
    }),
  })
  .superRefine((probe, ctx) => {
    for (const [key, value] of Object.entries(probe.facts)) {
      const fact = BASE_FACTS.find((entry) => entry.key === key);
      if (!fact || typeof value !== typeof fact.neutral)
        ctx.addIssue({
          code: 'custom',
          path: ['facts', key],
          message: 'Must be a base fact with its declared type',
        });
    }
  });
export type Probe = z.infer<typeof Probe>;
export const Case = z.strictObject({
  id: anchor.refine((id) => id !== 'base', 'Reserved case ID'),
  note: anchor,
  edits: z.array(z.strictObject({ find: anchor, replace: z.string() })),
  replaces: z
    .strictObject({
      assertions: z.array(anchor).optional(),
      probes: z.array(anchor).optional(),
    })
    .optional(),
  absent: z.array(anchor).optional(),
  assertions: z.array(Assertion).optional(),
  probes: z.array(Probe).optional(),
});
export type Case = z.infer<typeof Case>;
export const Manifest = z
  .strictObject({
    assertions: z.array(Assertion),
    probes: z.array(Probe),
    cases: z.array(Case),
  })
  .superRefine((manifest, ctx) => {
    const unique = (values: string[], label: string) => {
      if (new Set(values).size !== values.length)
        ctx.addIssue({ code: 'custom', message: `Duplicate ${label}` });
    };
    unique(
      manifest.cases.map((c) => c.id),
      'case ID',
    );
    unique(
      manifest.assertions.map((a) => a.clause),
      'base assertion anchor',
    );
    unique(
      manifest.probes.map((p) => p.id),
      'base probe ID',
    );
    for (const c of manifest.cases) {
      for (const name of c.replaces?.assertions ?? []) {
        if (!manifest.assertions.some((a) => a.clause === name))
          ctx.addIssue({
            code: 'custom',
            message: `Unknown replaced assertion: ${name}`,
          });
      }
      for (const id of c.replaces?.probes ?? []) {
        if (!manifest.probes.some((p) => p.id === id))
          ctx.addIssue({
            code: 'custom',
            message: `Unknown replaced probe: ${id}`,
          });
      }
      unique(
        [
          ...manifest.probes.filter((p) => !c.replaces?.probes?.includes(p.id)),
          ...(c.probes ?? []),
        ].map((p) => p.id),
        `probe ID in ${c.id}`,
      );
    }
  });
export type Manifest = z.infer<typeof Manifest>;
export type Variant = {
  id: string;
  note: string;
  text: string;
  assertions: Assertion[];
  probes: Probe[];
  absent: string[];
};

export function applyEdits(base: string, edits: Case['edits']): string {
  for (const { find } of edits) {
    if (base.split(find).length !== 2)
      throw new Error(`Edit must match exactly once: ${find}`);
  }
  let text = base;
  for (const { find, replace } of edits) {
    if (text.split(find).length !== 2)
      throw new Error(`Edit no longer matches exactly once: ${find}`);
    text = text.replace(find, () => replace);
  }
  return text;
}

export function variants(base: string, manifest: Manifest): Variant[] {
  return [
    {
      id: 'base',
      note: 'Synthetic base agreement',
      text: base,
      assertions: manifest.assertions,
      probes: manifest.probes,
      absent: [],
    },
    ...manifest.cases.map((c) => ({
      id: c.id,
      note: c.note,
      text: applyEdits(base, c.edits),
      absent: c.absent ?? [],
      assertions: [
        ...manifest.assertions.filter(
          (a) => !c.replaces?.assertions?.includes(a.clause),
        ),
        ...(c.assertions ?? []),
      ],
      probes: [
        ...manifest.probes.filter((p) => !c.replaces?.probes?.includes(p.id)),
        ...(c.probes ?? []),
      ],
    })),
  ];
}
