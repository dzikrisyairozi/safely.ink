import type {
  ClaimedCitation,
  LawJurisdiction,
  LegalAssessment,
  LegalFinding,
} from '@repo/api-types';
import { config } from '../config';

// Shorter than this, a quote such as "the insurer" is on almost any page and
// proves nothing.
const MIN_QUOTE = 30;

/**
 * Text as compared for a quote: the same letters in the same order, whatever
 * the case, the punctuation, or how a page or a PDF spaced and wrapped it.
 */
export const normalise = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

/** True when the quote is in the text, as normalised (F-CMP-4). */
export function quoteFound(quote: string, text: string) {
  const needle = normalise(quote);
  return needle.length >= MIN_QUOTE && normalise(text).includes(needle);
}

const escape = (part: string) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

// `*` stands for one host label; any subdomain of a listed host is on it.
const hostPatterns = Object.fromEntries(
  Object.entries(config.legalSources).map(([jurisdiction, hosts]) => [
    jurisdiction,
    hosts.map(
      (host) =>
        new RegExp(
          `^(?:[^.]+\\.)*${host.split('*').map(escape).join('[^.]+')}$`,
        ),
    ),
  ]),
) as Record<LawJurisdiction, RegExp[]>;

/** True for a web URL on an official source of that country (F-CMP-5). */
export function isAllowlisted(url: string, jurisdiction: LawJurisdiction) {
  if (!URL.canParse(url)) return false;
  const { protocol, hostname } = new URL(url);
  if (protocol !== 'https:' && protocol !== 'http:') return false;
  return hostPatterns[jurisdiction].some((pattern) => pattern.test(hostname));
}

const sameUrl = (url: string) => (URL.canParse(url) ? new URL(url).href : url);

const weight = { permitted: 0, restricted: 1, conflicts: 2 };

/**
 * Keeps the citations whose quote code found in the text stored for their
 * page, then decides the status on those alone: the status the model claimed
 * when a surviving quote shows it, else the strongest status a surviving
 * quote shows that is no stronger than the claim, else nothing found. The
 * finding keeps the quotes that show its status, and the model's reasoning
 * only when that is the status it claimed. `pages` are the pages the
 * model was given that we fetched ourselves.
 */
export function verify(
  assessment: LegalAssessment,
  pages: { url: string; text: string }[],
  jurisdiction: LawJurisdiction,
): LegalFinding {
  const texts = new Map(pages.map(({ url, text }) => [sameUrl(url), text]));
  const claim = assessment.status;
  const survivors =
    claim === 'no_finding'
      ? []
      : assessment.citations.filter((citation) => {
          const text = texts.get(sameUrl(citation.url));
          return (
            text !== undefined &&
            weight[citation.supports] <= weight[claim] &&
            isAllowlisted(citation.url, jurisdiction) &&
            quoteFound(citation.quote, text)
          );
        });
  const strongest = survivors.reduce<ClaimedCitation['supports'] | null>(
    (best, { supports }) =>
      best === null || weight[supports] > weight[best] ? supports : best,
    null,
  );

  const status = strongest ?? 'no_finding';
  return {
    status,
    // The model argued for its claim, which is no longer the status.
    reasoning: status === claim ? assessment.reasoning : '',
    citations: survivors
      .filter(({ supports }) => supports === strongest)
      .map(({ instrument, section, quote, url }) => ({
        instrument,
        section,
        quote,
        url,
      })),
    error: null,
  };
}
