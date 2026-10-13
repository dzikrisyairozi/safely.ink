import { useState } from 'react';
import { ArrowDown, ArrowUp, FileText, Upload, X } from 'lucide-react';
import { useTranslation } from '@repo/i18n';
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert';
import { Button } from '@repo/ui/components/ui/button';
import { ApiError } from '../../lib/api';
import { startAnalysis } from './start-analysis';
import { validateFiles } from './validate-files';

// Codes the API can answer with that have their own message.
const API_ERRORS = [
  'unsupported_type',
  'mixed_input',
  'too_large',
  'too_many_pages',
  'file_missing',
];

const megabytes = (bytes: number) =>
  (bytes / (1024 * 1024)).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });

export function UploadForm({ onRead }: { onRead: (id: string) => void }) {
  const { t } = useTranslation('dashboard');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const add = (added: File[]) => {
    if (added.length === 0) return;
    const next = [...files, ...added];
    const problem = validateFiles(next);
    setError(problem && t(`upload.errors.${problem}`));
    if (!problem) setFiles(next);
  };

  const move = (from: number, to: number) => {
    const next = [...files];
    next.splice(to, 0, ...next.splice(from, 1));
    setFiles(next);
  };

  const start = async () => {
    setError(null);
    setIsReading(true);
    try {
      onRead((await startAnalysis(files)).analysisId);
    } catch (err) {
      setIsReading(false);
      if (err instanceof ApiError && err.code === 'daily_limit') {
        const resetAt = new Date(err.resetAt ?? '').toLocaleTimeString(
          undefined,
          { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' },
        );
        setError(t('upload.errors.daily_limit', { resetAt }));
      } else if (err instanceof ApiError && API_ERRORS.includes(err.code)) {
        setError(t(`upload.errors.${err.code}`));
      } else {
        setError(t('upload.errors.failed'));
      }
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl tracking-tight">{t('newAnalysis.title')}</h1>
        <p className="text-muted-foreground">{t('newAnalysis.subtitle')}</p>
      </header>

      <label
        className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-foreground/30 bg-card px-6 py-10 text-center transition-colors focus-within:border-foreground hover:border-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50"
        aria-disabled={isReading}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          add([...event.dataTransfer.files]);
        }}
      >
        <Upload className="size-6 text-muted-foreground" aria-hidden />
        <span className="font-medium">{t('upload.choose')}</span>
        <span className="text-sm text-muted-foreground">
          {t('upload.limits')}
        </span>
        <input
          type="file"
          multiple
          className="sr-only"
          accept="application/pdf,image/jpeg,image/png,image/webp,.heic,.heif"
          disabled={isReading}
          onChange={(event) => {
            add([...(event.target.files ?? [])]);
            // So that picking the same file again fires a change.
            event.target.value = '';
          }}
        />
      </label>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {files.length > 0 && (
        <ol
          className="divide-y rounded-md border bg-card"
          aria-label={t('upload.pages')}
        >
          {files.map((file, n) => (
            // Two photos can share a name, so the position is part of the key.
            <li
              key={`${n}-${file.name}`}
              className="flex items-center gap-3 px-3 py-2"
            >
              <span className="w-6 text-right font-mono text-sm text-muted-foreground">
                {n + 1}
              </span>
              <FileText
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate" data-page-name>
                {file.name}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {megabytes(file.size)} MB
              </span>
              {files.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={n === 0 || isReading}
                    aria-label={t('upload.moveUp', { name: file.name })}
                    onClick={() => move(n, n - 1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={n === files.length - 1 || isReading}
                    aria-label={t('upload.moveDown', { name: file.name })}
                    onClick={() => move(n, n + 1)}
                  >
                    <ArrowDown />
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                disabled={isReading}
                aria-label={t('upload.remove', { name: file.name })}
                onClick={() => setFiles(files.filter((_, i) => i !== n))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
      )}

      <ul className="space-y-1 text-sm text-muted-foreground">
        <li>{t('upload.notices.notLegalAdvice')}</li>
        <li>{t('upload.notices.data')}</li>
      </ul>

      <div className="flex items-center gap-4">
        <Button disabled={files.length === 0 || isReading} onClick={start}>
          {isReading ? t('upload.reading') : t('upload.start')}
        </Button>
        {isReading && (
          <p className="text-sm text-muted-foreground" role="status">
            {t('upload.readingHint')}
          </p>
        )}
      </div>
    </div>
  );
}
