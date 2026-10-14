import { type ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { Analysis, Rule, Trap } from '@repo/api-types';
import { RunTracker, type RunningStatus } from './run-tracker';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

const analysis: Analysis = {
  ownerUid: 'alice',
  status: 'comparing',
  meta: null,
  counts: { clauses: 40, rules: 17, scenarios: 31, traps: 2 },
};
const rule = (id: string, summary: string): Rule => ({
  id,
  kind: 'exclusion',
  summary,
  clauseIds: ['c-001'],
  when: { fact: 'daysSinceStart', op: 'lt', value: 30 },
  effect: null,
  touches: ['daysSinceStart'],
});
const trap = (changes: Partial<Trap>): Trap => ({
  id: 'trap-r-001',
  ruleId: 'r-001',
  scenarioIds: ['s-001'],
  severity: 'low',
  title: null,
  action: null,
  ...changes,
});

const show = (traps: Trap[], status: RunningStatus = 'comparing') =>
  render(
    <RunTracker
      id="analysis-1"
      analysis={{ ...analysis, status }}
      status={status}
      traps={traps}
      rules={[rule('r-001', 'No claims in the first 30 days.')]}
    />,
  );

test('the current stage is marked and the earlier ones are done', () => {
  show([]);

  const stages = within(
    screen.getByRole('list', { name: 'Stages of the run' }),
  ).getAllByRole('listitem');
  expect(stages.map((stage) => stage.textContent)).toEqual([
    'Read',
    'Rules',
    'Situations',
    'Run',
    'Compare',
  ]);
  expect(stages[4]!.getAttribute('aria-current')).toBe('step');
  expect(
    stages.filter((stage) => stage.hasAttribute('aria-current')),
  ).toHaveLength(1);
});

test('the counts so far are shown', () => {
  show([]);

  expect(screen.getByText('Clauses').nextSibling?.textContent).toBe('40');
  expect(
    screen.getByText('Situations', { selector: 'dt' }).nextSibling?.textContent,
  ).toBe('31');
});

test('traps show as they are written, worst first, by title or rule', () => {
  show([
    trap({}),
    trap({
      id: 'trap-r-002',
      ruleId: 'r-002',
      severity: 'high',
      title: 'A late notice loses the whole claim',
    }),
  ]);

  const rows = within(
    screen.getByRole('heading', { name: 'Traps found so far' }).parentElement!,
  ).getAllByRole('listitem');
  expect(rows.map((row) => row.textContent)).toEqual([
    'HighA late notice loses the whole claim',
    'LowNo claims in the first 30 days.',
  ]);
});

test('while the rules are worked out there is nothing to link to yet', () => {
  show([], 'extracting_rules');

  expect(screen.queryByRole('link')).toBeNull();
});
