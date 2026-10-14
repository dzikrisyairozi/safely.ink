import en from '@/i18n/locales/en.json';
import { absoluteUrl } from '@/lib/seo';
import { CONTACT_EMAIL, SITE_NAME, localePath } from '@/lib/site';

export const dynamic = 'force-static';

// https://llmstxt.org: a short, plain map of the site for language models.
export function GET() {
  const body = [
    `# ${SITE_NAME}`,
    '',
    `> ${en.meta.description}`,
    '',
    'An information tool, not legal advice. Outcomes are decided by a deterministic rules engine, never by a language model; every finding quotes the clause it comes from, and a legal citation is shown only when its quote was found in the official source.',
    '',
    '## Pages',
    '',
    `- [Home (English)](${absoluteUrl(localePath('en'))}): what safely.ink does and how it works`,
    `- [Beranda (Bahasa Indonesia)](${absoluteUrl(localePath('id'))}): the same page in Indonesian`,
    '',
    '## Contact',
    '',
    `- ${CONTACT_EMAIL}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
