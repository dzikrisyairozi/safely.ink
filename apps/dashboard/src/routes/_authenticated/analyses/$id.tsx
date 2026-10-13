import { createFileRoute } from '@tanstack/react-router';
import { AppHeader } from '../../../components/layout/app-header';
import { Main } from '../../../components/layout/main';
import { AnalysisView } from '../../../features/analysis/analysis-view';
import { useAnalysis } from '../../../features/analysis/use-analysis';
import { GeneralError } from '../../../features/errors/general-error';
import { NotFoundError } from '../../../features/errors/not-found-error';
import { api } from '../../../lib/api';

export const Route = createFileRoute('/_authenticated/analyses/$id')({
  component: AnalysisPage,
});

function AnalysisPage() {
  const { id } = Route.useParams();
  const { analysis, failed } = useAnalysis(id);

  if (failed) return <GeneralError />;
  // Missing, or someone else's.
  if (analysis === null) return <NotFoundError />;

  return (
    <>
      <AppHeader />
      <Main>
        {analysis && (
          <AnalysisView
            analysis={analysis}
            onConfirm={async (details) => {
              await api(`/v1/analyses/${id}/confirm`, {
                method: 'POST',
                body: JSON.stringify(details),
              });
            }}
          />
        )}
      </Main>
    </>
  );
}
