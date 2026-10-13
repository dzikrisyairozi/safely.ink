import { createFileRoute } from '@tanstack/react-router';
import { FileSearch } from 'lucide-react';
import { useTranslation } from '@repo/i18n';
import { AppHeader } from '../../components/layout/app-header';
import { Main } from '../../components/layout/main';

export const Route = createFileRoute('/_authenticated/')({
  component: NewAnalysis,
});

function NewAnalysis() {
  const { t } = useTranslation('dashboard');

  return (
    <>
      <AppHeader />
      <Main>
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-24 text-center">
          <FileSearch className="size-10 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('newAnalysis.title')}
          </h1>
          <p className="text-muted-foreground">{t('newAnalysis.subtitle')}</p>
          <p className="text-sm text-muted-foreground">
            {t('newAnalysis.comingSoon')}
          </p>
        </div>
      </Main>
    </>
  );
}
