// Runs one real document through the whole pipeline and writes a report for
// the human check (TSD 9). Uses the project in .env with Application Default
// Credentials, and the same routes the dashboard calls, as --owner.
//
//   pnpm --filter api eval <file...> --type loan --country ID --role Borrower --owner <uid>
//
// Without --role it stops after the reading and prints the parties to pick
// from; the analysis can then also be confirmed in the dashboard.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Hono } from 'hono';
import {
  Analysis,
  AnalysisStatus,
  Clause,
  DocType,
  Jurisdiction,
  Rule,
  Trap,
} from '@repo/api-types';
import { bucket, db } from '../src/firebase';
import { analyses } from '../src/routes/analyses';
import { evalReport } from './eval-report';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    type: { type: 'string' },
    country: { type: 'string' },
    role: { type: 'string' },
    owner: { type: 'string' },
  },
});
const owner = values.owner;
if (positionals.length === 0 || !owner) {
  console.error(
    'Usage: pnpm --filter api eval <file...> --type <type> --country <code> [--role <role>] --owner <uid>',
  );
  process.exit(1);
}
const docType = DocType.parse(values.type);
const jurisdiction = Jurisdiction.parse(values.country?.toUpperCase());

// pnpm runs the script in apps/api; paths are meant from where it was typed.
const paths = positionals.map((path) =>
  resolve(process.env.INIT_CWD ?? process.cwd(), path),
);
const names = paths.map((path) => basename(path));
const analysisId = `eval-${randomUUID()}`;
const analysis = db.doc(`analyses/${analysisId}`);

const app = new Hono<{ Variables: { uid: string } }>();
app.use(async (c, next) => {
  c.set('uid', owner);
  await next();
});
app.route('/', analyses);

async function post(path: string, body: unknown) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  // Text first: an error the route does not catch comes back as plain text.
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} answered ${res.status}: ${text}`);
  return JSON.parse(text) as { status: AnalysisStatus };
}

const times: { status: AnalysisStatus; at: number }[] = [];
const stopListening = analysis.onSnapshot((snapshot) => {
  const status = AnalysisStatus.safeParse(snapshot.get('status'));
  if (status.success && times.at(-1)?.status !== status.data) {
    times.push({ status: status.data, at: Date.now() });
    console.log(`${new Date().toISOString()} ${status.data}`);
  }
});

try {
  for (const [i, path] of paths.entries()) {
    await bucket()
      .file(`uploads/${owner}/${analysisId}/${names[i]}`)
      .save(await readFile(path));
  }

  let { status } = await post('/', {
    analysisId,
    files: names,
    docType,
    jurisdiction,
  });

  if (status === 'awaiting_confirmation') {
    const roles = Analysis.parse((await analysis.get()).data()).meta!.parties;
    if (!values.role) {
      console.log(
        `Parties: ${JSON.stringify(roles)}. Run again with --role, or confirm ${analysisId} in the dashboard.`,
      );
    } else {
      ({ status } = await post(`/${analysisId}/confirm`, {
        docType,
        jurisdiction,
        userRole: values.role,
      }));
    }
  }

  const sub = async (name: string) =>
    (await analysis.collection(name).orderBy('__name__').get()).docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }),
    );
  const report = evalReport({
    analysisId,
    file: names.join(', '),
    analysis: Analysis.parse((await analysis.get()).data()),
    clauses: (await sub('clauses')).map((clause) => Clause.parse(clause)),
    rules: (await sub('rules')).map((rule) => Rule.parse(rule)),
    traps: (await sub('traps')).map((trap) => Trap.parse(trap)),
    times,
  });

  const out = resolve('eval-out', `${analysisId}.json`);
  await mkdir('eval-out', { recursive: true });
  await writeFile(out, JSON.stringify(report, null, 2));
  console.log(
    `${status}: ${report.counts.rules ?? 0} rules, ${report.counts.scenarios ?? 0} scenarios, ` +
      `${report.counts.traps ?? 0} traps, grade ${report.grade ?? '-'}, ${report.totalSeconds} s\n${out}`,
  );
} finally {
  stopListening();
  await db.terminate();
}
