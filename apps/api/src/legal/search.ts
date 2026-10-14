import type { AnalysisMeta, LawJurisdiction, Rule } from '@repo/api-types';
import { searchLaw } from '../agents/legal-researcher';
import { config } from '../config';
import { isAllowlisted } from './verify';

// Grounding gives its sources as redirects through this host.
const GROUNDING_REDIRECT = 'vertexaisearch.cloud.google.com';

// Where a grounding redirect points, read from its Location header. The
// redirect is never followed and its body never read.
async function resolve(uri: string, jurisdiction: LawJurisdiction) {
  if (isAllowlisted(uri, jurisdiction)) return uri;
  if (!URL.canParse(uri) || new URL(uri).hostname !== GROUNDING_REDIRECT) {
    return null;
  }
  try {
    const response = await fetch(uri, {
      redirect: 'manual',
      signal: AbortSignal.timeout(config.limits.law.pageSeconds * 1000),
    });
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location) return null;
    const url = new URL(location, uri).href;
    return isAllowlisted(url, jurisdiction) ? url : null;
  } catch {
    return null;
  }
}

/**
 * The official pages a grounded search found for a rule, on the allowlist of
 * its country only (F-CMP-5), each once, at most `pagesPerRule`.
 */
export async function findSources(
  rule: Rule,
  meta: AnalysisMeta & { jurisdiction: LawJurisdiction },
) {
  const { jurisdiction } = meta;
  const uris = await searchLaw(rule, meta, config.legalSources[jurisdiction]);
  const urls = await Promise.all(uris.map((uri) => resolve(uri, jurisdiction)));
  return [...new Set(urls.filter((url) => url !== null))].slice(
    0,
    config.limits.law.pagesPerRule,
  );
}
