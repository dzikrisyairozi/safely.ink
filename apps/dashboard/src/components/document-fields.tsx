import {
  COUNTRIES,
  DocType,
  GLOBAL,
  Jurisdiction,
  isLawChecked,
} from '@repo/api-types';
import { useTranslation } from '@repo/i18n';
import { useCountryName } from '../lib/country-name';

const FIELD =
  'h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * What the document is and where it is from: the two choices the upload and
 * the confirm screen share. An empty value shows a prompt to choose.
 */
export function DocumentFields({
  docType,
  jurisdiction,
  onDocType,
  onJurisdiction,
  disabled,
}: {
  docType: DocType | '';
  jurisdiction: Jurisdiction | '';
  onDocType: (docType: DocType) => void;
  onJurisdiction: (jurisdiction: Jurisdiction) => void;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation('dashboard');
  const countryName = useCountryName();
  const countries = [...COUNTRIES].sort((a, b) =>
    countryName(a).localeCompare(countryName(b), i18n.language),
  );

  return (
    <div className="space-y-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium">
          {t('document.type')}
          <select
            className={FIELD}
            value={docType}
            disabled={disabled}
            onChange={(event) => onDocType(DocType.parse(event.target.value))}
          >
            {docType === '' && (
              <option value="" disabled>
                {t('document.choose')}
              </option>
            )}
            {DocType.options.map((type) => (
              <option key={type} value={type}>
                {t(`analysis.docTypes.${type}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-sm font-medium">
          {t('document.country')}
          <select
            className={FIELD}
            value={jurisdiction}
            disabled={disabled}
            onChange={(event) =>
              onJurisdiction(Jurisdiction.parse(event.target.value))
            }
          >
            {jurisdiction === '' && (
              <option value="" disabled>
                {t('document.choose')}
              </option>
            )}
            {countries.map((code) => (
              <option key={code} value={code}>
                {isLawChecked(code)
                  ? t('document.lawChecked', { country: countryName(code) })
                  : countryName(code)}
              </option>
            ))}
            <option value={GLOBAL}>{countryName(GLOBAL)}</option>
          </select>
        </label>
      </div>

      {docType === 'other' && (
        <p className="text-sm text-muted-foreground">
          {t('document.generalAnalysis')}
        </p>
      )}
      {jurisdiction !== '' && !isLawChecked(jurisdiction) && (
        <p className="text-sm text-muted-foreground">
          {jurisdiction === GLOBAL
            ? t('document.lawSkippedGlobal')
            : t('document.lawSkipped', { country: countryName(jurisdiction) })}
        </p>
      )}
    </div>
  );
}
