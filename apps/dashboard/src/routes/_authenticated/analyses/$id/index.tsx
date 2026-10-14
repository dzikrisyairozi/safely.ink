import { createFileRoute } from '@tanstack/react-router';
import { Clause, Rule, StoredScenario, Trap } from '@repo/api-types';
import { AppHeader } from '../../../../components/layout/app-header';
import { Main } from '../../../../components/layout/main';
import { AnalysisView } from '../../../../features/analysis/analysis-view';
import { useAnalysis } from '../../../../features/analysis/use-analysis';
import { useSubcollection } from '../../../../features/analysis/use-subcollection';
import { GeneralError } from '../../../../features/errors/general-error';
import { NotFoundError } from '../../../../features/errors/not-found-error';
import { api } from '../../../../lib/api';

export const Route = createFileRoute('/_authenticated/analyses/$id/')({
  component: AnalysisPage,
});

function AnalysisPage() {
  const { id } = Route.useParams();
  const { analysis, failed } = useAnalysis(id);
  const traps = useSubcollection(id, 'traps', Trap);
  const rules = useSubcollection(id, 'rules', Rule);
  const scenarios = useSubcollection(id, 'scenarios', StoredScenario);
  const clauses = useSubcollection(id, 'clauses', Clause);

  if (failed) return <GeneralError />;
  // Missing, or someone else's.
  if (analysis === null) return <NotFoundError />;

  return (
    <>
      <AppHeader />
      <Main>
        {analysis && (
          <AnalysisView
            id={id}
            analysis={analysis}
            traps={traps ?? []}
            rules={rules ?? []}
            scenarios={scenarios ?? []}
            clauses={clauses ?? []}
            onConfirm={async (details) => {
              await api(`/v1/analyses/${id}/confirm`, {
                method: 'POST',
                body: JSON.stringify(details),
              });
            }}
            onRetry={async () => {
              await api(`/v1/analyses/${id}/retry`, { method: 'POST' });
            }}
          />
        )}
      </Main>
    </>
  );
}
