import { type ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type {
  Analysis,
  Clause,
  Fact,
  Rule,
  StoredFinding,
  StoredScenario,
  Trap,
} from '@repo/api-types';
import { i18n } from '@repo/i18n';
import { TrapView } from './trap-view';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    hash,
    children,
  }: {
    to: string;
    hash?: string;
    children: ReactNode;
  }) => <a href={hash ? `${to}#${hash}` : to}>{children}</a>,
}));

const fact = (key: string, unit: string | null, description: string): Fact => ({
  key,
  type: 'number',
  values: null,
  unit,
  description,
  neutral: 0,
});
const factSchema = [
  fact('daysSinceStart', 'days', 'Days since the policy started'),
  fact('claimAmount', 'IDR', 'Amount claimed'),
];
const analysis: Analysis = {
  ownerUid: 'alice',
  status: 'done',
  meta: null,
  factSchema,
};
const rules: Rule[] = [
  {
    id: 'r-001',
    kind: 'exclusion',
    summary: 'No hospital stay is paid in the first 30 days.',
    clauseIds: ['c-004'],
    when: { fact: 'daysSinceStart', op: 'lt', value: 30 },
    effect: { type: 'deny', amount: null, percent: null },
    touches: ['daysSinceStart'],
  },
  {
    id: 'r-002',
    kind: 'benefit',
    summary: 'A hospital stay is paid.',
    clauseIds: ['c-002'],
    when: { fact: 'claimAmount', op: 'gt', value: 0 },
    effect: { type: 'grant', amount: null, percent: null },
    touches: ['claimAmount'],
  },
];
const clauses: Clause[] = [
  {
    id: 'c-002',
    number: '2.1',
    heading: 'Pertanggungan',
    text: 'Penanggung membayar biaya rawat inap.',
    gloss: 'The insurer pays for a hospital stay.',
    page: 2,
  },
  {
    id: 'c-004',
    number: '4.1',
    heading: 'Masa tunggu',
    text: 'Tidak ada manfaat dalam 30 hari pertama.',
    gloss: 'No benefit in the first 30 days.',
    page: 3,
  },
];
const scenarios: StoredScenario[] = [
  {
    id: 's-001',
    story: 'Budi is admitted to hospital in his second week.',
    strategy: 'boundary',
    frequency: 'common',
    targetRuleIds: ['r-001'],
    stake: 5_000_000,
    facts: { daysSinceStart: 10, claimAmount: 5_000_000 },
    outcome: {
      scenarioId: 's-001',
      result: 'bad',
      stake: 5_000_000,
      loss: 5_000_000,
      decidingRuleId: 'r-001',
      trace: [
        { ruleId: 'r-002', fact: null, note: '' },
        { ruleId: 'r-001', fact: 'daysSinceStart', note: '' },
      ],
    },
    expectation: { result: 'fine', reason: 'A hospital stay is covered.' },
  },
];
const trap: Trap = {
  id: 'trap-r-001',
  ruleId: 'r-001',
  scenarioIds: ['s-001'],
  severity: 'high',
  title: 'A stay in the first 30 days is not paid',
  action: 'Ask whether the waiting period applies to emergencies.',
};

const show = (changes: Partial<Trap> = {}, shown = analysis) =>
  render(
    <TrapView
      id="analysis-1"
      analysis={shown}
      trap={{ ...trap, ...changes }}
      rules={rules}
      scenarios={scenarios}
      clauses={clauses}
    />,
  );

test('the trap shows its title, its severity and what you can do', () => {
  show();

  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    trap.title,
  );
  expect(screen.getByText('High')).toBeTruthy();
  expect(screen.getByText(/waiting period applies/)).toBeTruthy();
});

test('without a note there is no empty "what you can do"', () => {
  show({ action: null });

  expect(screen.queryByText('What you can do')).toBeNull();
});

test('an example shows the outcome in money, and what you would expect', () => {
  show();

  const example = screen.getByRole('article');
  expect(example.textContent).toMatch(/second week/);
  expect(example.textContent).toMatch(/What the document givesBad/);
  expect(example.textContent).toMatch(/You lose.*IDR/);
  expect(example.textContent).toMatch(
    /What you would expectFine\. A hospital stay is covered\./,
  );
});

test('without a currency the amounts are plain numbers', () => {
  show({}, { ...analysis, factSchema: [factSchema[0]!] });

  expect(screen.getByText('You lose').nextSibling?.textContent).toBe(
    '5,000,000',
  );
});

test('each step of the trace names its rule and fact and links to its clause', () => {
  show();

  const steps = within(
    screen.getByRole('heading', { name: 'How the rules decided it' })
      .parentElement!,
  ).getAllByRole('listitem');
  expect(
    steps.map((step) => step.querySelector('a')?.getAttribute('href')),
  ).toEqual(['/analyses/$id/rules#c-002', '/analyses/$id/rules#c-004']);
  expect(steps[1]!.textContent).toMatch(
    /Because of: Days since the policy started/,
  );
});

test('the deciding clause is quoted with its page and gloss', () => {
  show();

  const quoted = screen.getByRole('heading', {
    name: 'What the document says',
  }).parentElement!;
  expect(quoted.textContent).toMatch(/Clause 4\.1, page 3/);
  expect(quoted.textContent).toMatch(/Tidak ada manfaat dalam 30 hari pertama/);
  expect(quoted.textContent).toMatch(/No benefit in the first 30 days/);
});

const lawChecked: Analysis = {
  ...analysis,
  meta: {
    docType: 'insurance',
    title: 'Polis',
    parties: [],
    userRole: 'insured',
    jurisdiction: 'ID',
    lawChecked: true,
    detected: { docType: 'insurance', jurisdiction: 'ID' },
    language: 'id',
    pageCount: 3,
    unreadablePages: [],
  },
};
const finding: StoredFinding = {
  ruleId: 'r-001',
  status: 'conflicts',
  reasoning: 'The law forbids a clause that moves the insurer’s duty to you.',
  citations: [
    {
      instrument: 'Undang-Undang Nomor 8 Tahun 1999',
      section: 'Pasal 18 ayat (1)',
      quote: 'a. menyatakan pengalihan tanggung jawab pelaku usaha;',
      url: 'https://peraturan.bpk.go.id/Details/45288/uu-no-8-tahun-1999',
    },
  ],
  error: null,
};
const showLaw = (shown: StoredFinding | undefined, on = lawChecked) =>
  render(
    <TrapView
      id="analysis-1"
      analysis={on}
      trap={trap}
      rules={rules}
      scenarios={scenarios}
      clauses={clauses}
      finding={shown}
    />,
  );
const lawSection = () =>
  screen.getByRole('heading', { name: 'What the law says' }).parentElement!;

test('the legal finding shows what the law says, its quote and a link to the official page', () => {
  showLaw(finding);

  const law = lawSection();
  expect(law.textContent).toMatch(/The law does not allow this\./);
  expect(law.textContent).toMatch(/moves the insurer’s duty/);
  expect(law.textContent).toMatch(
    /Undang-Undang Nomor 8 Tahun 1999 · Pasal 18 ayat \(1\)/,
  );
  expect(law.textContent).toMatch(/pengalihan tanggung jawab/);
  const link = within(law).getByRole('link', {
    name: 'Open the official source',
  });
  expect(link.getAttribute('href')).toBe(finding.citations[0]!.url);
  expect(link.getAttribute('target')).toBe('_blank');
});

test('a rule the law says nothing about says so, without citations', () => {
  showLaw({ ...finding, status: 'no_finding', reasoning: '', citations: [] });

  expect(lawSection().textContent).toMatch(/We found no law that settles this/);
  expect(within(lawSection()).queryByRole('link')).toBeNull();
});

test('a lookup that was unavailable says to try again', () => {
  showLaw({
    ...finding,
    status: 'no_finding',
    citations: [],
    error: 'lookup_unavailable',
  });

  expect(lawSection().textContent).toMatch(/Law lookup unavailable/);
});

test('a report without a law check, or with no finding yet, has no law section', () => {
  showLaw(finding, analysis);
  expect(screen.queryByText('What the law says')).toBeNull();
});

test('a trap whose rule was not looked up has no law section', () => {
  showLaw(undefined);
  expect(screen.queryByText('What the law says')).toBeNull();
});

const helpSection = () =>
  screen.queryByRole('heading', { name: 'Where to get help' });

test('a high trap on a law-checked report says where to get help', () => {
  showLaw(finding);

  const links = within(helpSection()!.parentElement!).getAllByRole('link');
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    'https://kontak157.ojk.go.id',
    'https://lapssjk.id',
  ]);
  expect(links[1]!.textContent).toBe('LAPS SJK (financial services disputes)');
});

test('the name of a body stays as it is, and what it does is translated', async () => {
  await i18n.changeLanguage('id');
  try {
    showLaw(finding);
    expect(screen.getByRole('link', { name: /^LAPS SJK/ }).textContent).toBe(
      'LAPS SJK (sengketa jasa keuangan)',
    );
  } finally {
    await i18n.changeLanguage('en');
  }
});

test('a medium trap, or a report without a law check, has no help list', () => {
  render(
    <TrapView
      id="analysis-1"
      analysis={lawChecked}
      trap={{ ...trap, severity: 'medium' }}
      rules={rules}
      scenarios={scenarios}
      clauses={clauses}
    />,
  );
  expect(helpSection()).toBeNull();
  cleanup();

  show();
  expect(helpSection()).toBeNull();
});
