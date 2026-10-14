import en from '@/i18n/locales/en.json';
import { listPosts, plainText, postSource } from '@/lib/blog';
import { absoluteUrl } from '@/lib/seo';
import { CONTACT_EMAIL, SITE_NAME, localePath } from '@/lib/site';

// https://llmstxt.org: a plain map of the site for language models, in English.

const ABOUT =
  'An information tool, not legal advice. Outcomes are decided by a deterministic rules engine, never by a language model; every finding quotes the clause it comes from, and a legal citation is shown only when its quote was found in the official source.';

function faq() {
  return Object.values(en.faq.items)
    .map(({ q, a }) => `### ${q}\n\n${a}`)
    .join('\n\n');
}

export function llmsTxt() {
  const posts = listPosts('en').map(
    (post) =>
      `- [${post.title}](${absoluteUrl(localePath('en', `/blog/${post.slug}`))}): ${post.description}`,
  );
  return [
    `# ${SITE_NAME}`,
    '',
    `> ${en.meta.description}`,
    '',
    ABOUT,
    '',
    '## Pages',
    '',
    `- [Home](${absoluteUrl(localePath('en'))}): what safely.ink does, the four steps, a sample trap, coverage and FAQ`,
    `- [Beranda](${absoluteUrl(localePath('id'))}): the same page in Indonesian`,
    `- [Blog](${absoluteUrl(localePath('en', '/blog'))}): plain-language guides to contract clauses`,
    `- [Full text](${absoluteUrl('/llms-full.txt')}): this site's pages and articles as plain text`,
    '',
    '## Articles',
    '',
    ...posts,
    '',
    '## Contact',
    '',
    `- ${CONTACT_EMAIL}`,
    '',
  ].join('\n');
}

export function llmsFullTxt() {
  const steps = (['read', 'rules', 'fuzz', 'compare'] as const)
    .map((s, i) => `${i + 1}. ${en.steps[s].title}: ${en.steps[s].body}`)
    .join('\n');
  const articles = listPosts('en').map(
    (post) =>
      `# ${post.title}\n\nURL: ${absoluteUrl(localePath('en', `/blog/${post.slug}`))}\nPublished: ${post.date}\n\n${plainText(postSource('en', post.slug))}`,
  );
  return [
    `# ${SITE_NAME}`,
    '',
    `> ${en.meta.description}`,
    '',
    ABOUT,
    '',
    `## ${en.steps.heading}`,
    '',
    steps,
    '',
    `## ${en.coverage.heading}`,
    '',
    `${Object.values(en.coverage.types).join(', ')}. ${en.coverage.general}`,
    `${en.coverage.countriesHeading}: ${Object.values(en.coverage.countries).join(', ')}. ${en.coverage.otherCountries}`,
    '',
    '## FAQ',
    '',
    faq(),
    '',
    ...articles.flatMap((a) => [a, '']),
  ].join('\n');
}
