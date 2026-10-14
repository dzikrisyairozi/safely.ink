import { createFileRoute } from '@tanstack/react-router';
import { AppHeader } from '../../components/layout/app-header';
import { Main } from '../../components/layout/main';
import { GeneralError } from '../../features/errors/general-error';
import { HistoryView } from '../../features/history/history-view';
import { useHistory } from '../../features/history/use-history';

export const Route = createFileRoute('/_authenticated/history')({
  component: HistoryPage,
});

function HistoryPage() {
  const entries = useHistory();

  // Also what a missing index in production looks like.
  if (entries === null) return <GeneralError />;

  return (
    <>
      <AppHeader />
      <Main>{entries && <HistoryView entries={entries} />}</Main>
    </>
  );
}
