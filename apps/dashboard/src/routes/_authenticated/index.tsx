import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AppHeader } from '../../components/layout/app-header';
import { Main } from '../../components/layout/main';
import { UploadForm } from '../../features/upload/upload-form';

export const Route = createFileRoute('/_authenticated/')({
  component: NewAnalysis,
});

function NewAnalysis() {
  const navigate = useNavigate();

  return (
    <>
      <AppHeader />
      <Main>
        <UploadForm
          onRead={(id) => navigate({ to: '/analyses/$id', params: { id } })}
        />
      </Main>
    </>
  );
}
