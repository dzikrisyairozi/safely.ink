import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Analysis } from '@repo/api-types';
import { Route } from '../../routes/_authenticated/analyses/$id/index';
import { useAnalysis } from './use-analysis';
import { useSubcollection } from './use-subcollection';

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: object) => ({
    options,
    useParams: () => ({ id: 'analysis-1' }),
  }),
}));
vi.mock('../../components/layout/app-header', () => ({
  AppHeader: () => null,
}));
vi.mock('./use-analysis');
vi.mock('./use-subcollection');
vi.mock('./analysis-view', () => ({
  AnalysisView: ({ findings }: { findings: unknown }) => (
    <p>findings: {JSON.stringify(findings)}</p>
  ),
}));
vi.mock('../errors/general-error', () => ({
  GeneralError: () => <p>general error</p>,
}));

const Page = (Route as unknown as { options: { component: () => JSX.Element } })
  .options.component;

test('a findings listener that fails costs the law, not the report', () => {
  vi.mocked(useAnalysis).mockReturnValue({
    analysis: { status: 'done' } as Analysis,
    failed: false,
  });
  vi.mocked(useSubcollection).mockImplementation((_, name) =>
    name === 'findings' ? null : [],
  );

  render(<Page />);

  expect(screen.queryByText('general error')).toBeNull();
  expect(screen.getByText('findings:')).toBeTruthy();
});
