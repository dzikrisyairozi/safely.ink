import { createFileRoute } from '@tanstack/react-router';
import { Clause, Rule } from '@repo/api-types';
import { AppHeader } from '../../../../components/layout/app-header';
import { Main } from '../../../../components/layout/main';
import { useAnalysis } from '../../../../features/analysis/use-analysis';
import { useSubcollection } from '../../../../features/analysis/use-subcollection';
import { GeneralError } from '../../../../features/errors/general-error';
import { NotFoundError } from '../../../../features/errors/not-found-error';
import { RulesView } from '../../../../features/rules/rules-view';

export const Route = createFileRoute('/_authenticated/analyses/$id/rules')({
  component: RulesPage,
});

function RulesPage() {
  const { id } = Route.useParams();
  const { analysis, failed } = useAnalysis(id);
  const rules = useSubcollection(id, 'rules', Rule);
  const clauses = useSubcollection(id, 'clauses', Clause);

  if (failed) return <GeneralError />;
  // Missing, or someone else's.
  if (analysis === null) return <NotFoundError />;
  if (rules === null || clauses === null) return <GeneralError />;

  return (
    <>
      <AppHeader />
      <Main>
        {analysis && rules && clauses && (
          <RulesView
            id={id}
            analysis={analysis}
            rules={rules}
            clauses={clauses}
          />
        )}
      </Main>
    </>
  );
}
