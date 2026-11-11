import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';
import { z } from 'zod';
import type { FactSchema, Outcome, ReaderOutput, Rule } from '@repo/api-types';
import type { readDocument } from '../src/agents/reader';
import type { proposeFacts } from '../src/agents/rule-extractor';
import { packFor } from '../src/packs';
import type { rulesFor } from '../src/pipeline/extract';
import { checkReading } from '../src/pipeline/reader-check';
import { checkFacts } from '../src/pipeline/rule-check';
import { inStage, type Usage } from '../src/telemetry';
import { versions } from '../src/versions';
import { Manifest, variants, type Variant } from './smoke-cases';
import { judgeRun, runProbe, type Extraction } from './smoke-check';

export type Dependencies = {
  readDocument: typeof readDocument;
  proposeFacts: typeof proposeFacts;
  rulesFor: typeof rulesFor;
};
export type Attempt = {
  reader: ReaderOutput | null;
  factSchema: FactSchema | null;
  rules: Rule[] | null;
  diagnostics: Awaited<ReturnType<typeof rulesFor>>['diagnostics'] | null;
  probes: { id: string; outcome?: Outcome; error?: string }[];
  failures: string[];
  usage: Record<string, Usage>;
};
const Hashes = z.strictObject({
  'base.md': z.string(),
  'cases.json': z.string(),
  'smoke-check.ts': z.string(),
  'extract.ts': z.string(),
});
export type Hashes = z.infer<typeof Hashes>;
export type Report = {
  gate: 'extraction smoke gate';
  createdAt: string;
  partial: boolean;
  runs: number;
  result: 'passed' | 'failed' | 'base_failed';
  hashes: Hashes;
  versions: typeof versions;
  cases: {
    id: string;
    note: string;
    passingRuns: number;
    passed: boolean;
    attempts: Attempt[];
  }[];
};

// Text wrapping is measured with the embedded font, so each line fits the PDF.
export async function renderPdf(text: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  for (const paragraph of text.split('\n')) {
    const lines: string[] = [];
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, 10) > 510 && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
    for (const value of lines) {
      if (y < 42) {
        page = pdf.addPage([595, 842]);
        y = 800;
      }
      page.drawText(value, { x: 42, y, size: 10, font });
      y -= 14;
    }
  }
  const bytes = await pdf.save();
  const document = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const extracted = (await extractText(document, { mergePages: true })).text;
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
    if (!normalize(extracted).includes(normalize(text)))
      throw new Error('Rendered PDF does not contain the variant text');
  } finally {
    await document.loadingTask.destroy();
  }
  return { bytes: Buffer.from(bytes), pageCount: pdf.getPageCount() };
}

async function attempt(
  variant: Variant,
  dependencies: Dependencies,
): Promise<Attempt> {
  const result: Attempt = {
    reader: null,
    factSchema: null,
    rules: null,
    diagnostics: null,
    probes: [],
    failures: [],
    usage: {},
  };
  await inStage(
    {
      analysisId: `smoke-${variant.id}`,
      stage: 'extraction smoke gate',
      save: async (model, used) => {
        const previous = result.usage[model];
        result.usage[model] = previous
          ? (Object.fromEntries(
              Object.entries(used).map(([key, value]) => [
                key,
                value + previous[key as keyof Usage],
              ]),
            ) as Usage)
          : used;
      },
    },
    async () => {
      try {
        const { bytes, pageCount } = await renderPdf(variant.text);
        result.reader = await dependencies.readDocument(
          [{ name: `${variant.id}.pdf`, mimeType: 'application/pdf', bytes }],
          pageCount,
        );
        if (result.reader.unreadablePages.length > 0)
          result.failures.push(
            `Reader reported unreadable pages: ${result.reader.unreadablePages.join(', ')}`,
          );
        const reading = checkReading(result.reader, pageCount, {
          docType: 'loan',
          jurisdiction: 'ID',
        });
        if (reading.status !== 'awaiting_confirmation') {
          result.failures.push(`Reading ${reading.status}`);
          return;
        }
        // Production confirms one of the parties the Reader found, so the
        // borrower is picked from them, never named here.
        const borrowers = reading.meta.parties.filter((party) =>
          /borrower|debtor|debitur|debitor|peminjam/i.test(party.role),
        );
        if (borrowers.length !== 1) {
          result.failures.push(
            `Expected one borrower among the parties, found ${borrowers.length}`,
          );
          return;
        }
        const meta = { ...reading.meta, userRole: borrowers[0]!.role };
        result.factSchema = checkFacts(
          await dependencies.proposeFacts(
            reading.clauses,
            packFor(meta.docType),
            meta,
          ),
        );
        const extracted = await dependencies.rulesFor(
          reading.clauses,
          result.factSchema,
          meta,
        );
        result.rules = extracted.rules;
        result.diagnostics = extracted.diagnostics;
        if (extracted.diagnostics.repairError !== null)
          result.failures.push(
            `Rule repair failed: ${extracted.diagnostics.repairError}`,
          );
        const extraction: Extraction = {
          clauses: reading.clauses,
          factSchema: result.factSchema,
          rules: result.rules,
        };
        result.failures.push(...judgeRun(variant, extraction));
        result.probes = variant.probes.map((probe) => {
          try {
            return { id: probe.id, outcome: runProbe(probe, extraction) };
          } catch (err) {
            return { id: probe.id, error: String(err) };
          }
        });
      } catch (err) {
        result.failures.push(String(err));
      }
    },
  );
  return result;
}

export async function runSmoke(
  input: {
    base: string;
    manifest: Manifest;
    runs: number;
    hashes: Hashes;
    caseId?: string;
  },
  dependencies: Dependencies,
): Promise<Report> {
  if (!Number.isSafeInteger(input.runs) || input.runs < 1)
    throw new Error('--runs must be a positive integer');
  let selected = variants(input.base, input.manifest);
  if (input.caseId !== undefined) {
    if (!selected.some((variant) => variant.id === input.caseId))
      throw new Error(`Unknown case: ${input.caseId}`);
    selected = selected.filter((v) => v.id === 'base' || v.id === input.caseId);
  }
  const report: Report = {
    gate: 'extraction smoke gate',
    createdAt: new Date().toISOString(),
    partial: input.caseId !== undefined,
    runs: input.runs,
    hashes: input.hashes,
    versions,
    result: 'passed',
    cases: [],
  };
  for (const variant of selected) {
    const attempts: Attempt[] = [];
    for (let i = 0; i < input.runs; i++)
      attempts.push(await attempt(variant, dependencies));
    const passingRuns = attempts.filter(
      (run) => run.failures.length === 0,
    ).length;
    report.cases.push({
      id: variant.id,
      note: variant.note,
      passingRuns,
      passed: passingRuns >= Math.ceil((2 * input.runs) / 3),
      attempts,
    });
  }
  report.result = !report.cases[0]!.passed
    ? 'base_failed'
    : report.cases.some((c) => !c.passed)
      ? 'failed'
      : 'passed';
  return report;
}

const Baseline = z.object({
  gate: z.literal('extraction smoke gate'),
  partial: z.boolean(),
  runs: z.number().int().positive(),
  hashes: Hashes,
  cases: z.array(
    z.object({ id: z.string(), passingRuns: z.number().int().nonnegative() }),
  ),
});
export function compareBaseline(
  report: Pick<Report, 'gate' | 'partial' | 'runs' | 'hashes' | 'cases'>,
  baseline: unknown,
): string[] {
  const previous = Baseline.parse(baseline);
  if (report.partial || previous.partial)
    throw new Error(
      'Partial extraction smoke gate runs cannot be compared or used as a baseline',
    );
  if (report.runs !== previous.runs) throw new Error('Baseline --runs differs');
  for (const key of Object.keys(report.hashes) as (keyof Hashes)[]) {
    if (report.hashes[key] !== previous.hashes[key])
      throw new Error(`Baseline hash differs: ${key}`);
  }
  const oldIds = previous.cases.map((c) => c.id).sort();
  const newIds = report.cases.map((c) => c.id).sort();
  if (JSON.stringify(oldIds) !== JSON.stringify(newIds))
    throw new Error('Baseline case set differs');
  return report.cases.flatMap((c) => {
    const before = previous.cases.find((old) => old.id === c.id)!;
    return c.passingRuns < before.passingRuns
      ? [
          `${c.id}: passing runs fell from ${before.passingRuns} to ${c.passingRuns}`,
        ]
      : [];
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      runs: { type: 'string', default: '3' },
      case: { type: 'string' },
      baseline: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const typedIn = process.env.INIT_CWD ?? process.cwd();
  const base = await readFile(
    new URL('../test/fixtures/smoke/base.md', import.meta.url),
    'utf8',
  );
  const cases = await readFile(
    new URL('../test/fixtures/smoke/cases.json', import.meta.url),
    'utf8',
  );
  const manifest = Manifest.parse(JSON.parse(cases));
  const hashes: Hashes = {
    'base.md': createHash('sha256').update(base).digest('hex'),
    'cases.json': createHash('sha256').update(cases).digest('hex'),
    'smoke-check.ts': createHash('sha256')
      .update(await readFile(new URL('./smoke-check.ts', import.meta.url)))
      .digest('hex'),
    'extract.ts': createHash('sha256')
      .update(
        await readFile(new URL('../src/pipeline/extract.ts', import.meta.url)),
      )
      .digest('hex'),
  };
  const runs = Number(values.runs);
  if (!Number.isSafeInteger(runs) || runs < 1)
    throw new Error('--runs must be a positive integer');
  const baseline: unknown = values.baseline
    ? JSON.parse(await readFile(resolve(typedIn, values.baseline), 'utf8'))
    : undefined;
  if (baseline !== undefined)
    compareBaseline(
      {
        gate: 'extraction smoke gate',
        partial: values.case !== undefined,
        runs,
        hashes,
        cases: variants(base, manifest).map((v) => ({
          id: v.id,
          note: v.note,
          passingRuns: 0,
          passed: false,
          attempts: [],
        })),
      },
      baseline,
    );
  if (!process.env.GEMINI_API_KEY)
    throw new Error('GEMINI_API_KEY is not set.');
  const [{ readDocument }, { proposeFacts }, { rulesFor }] = await Promise.all([
    import('../src/agents/reader'),
    import('../src/agents/rule-extractor'),
    import('../src/pipeline/extract'),
  ]);
  const report = await runSmoke(
    { base, manifest, runs, hashes, caseId: values.case },
    { readDocument, proposeFacts, rulesFor },
  );
  const out = resolve(typedIn, values.out ?? 'eval-out');
  await mkdir(out, { recursive: true });
  const file = resolve(
    out,
    `smoke-${report.createdAt.replace(/[:.]/g, '-')}.json`,
  );
  await writeFile(file, JSON.stringify(report, null, 2));
  console.log(`Extraction smoke gate: ${report.result}`);
  console.table(
    report.cases.map((c) => ({
      case: c.id,
      passing: `${c.passingRuns}/${runs}`,
      result: c.passed ? 'passed' : 'failed',
    })),
  );
  if (report.partial)
    console.log(
      'Partial run: this extraction smoke gate cannot approve a model change.',
    );
  if (baseline !== undefined)
    for (const line of compareBaseline(report, baseline)) console.log(line);
  console.log(file);
  if (report.result !== 'passed') process.exitCode = 1;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((err) => {
    console.error(`Extraction smoke gate: ${String(err)}`);
    process.exitCode = 1;
  });
}
