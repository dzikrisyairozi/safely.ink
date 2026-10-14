import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { LAW_JURISDICTIONS, type LawJurisdiction } from '@repo/api-types';
import { extractText, getDocumentProxy } from 'unpdf';
import { z } from 'zod';
import { config } from '../config';
import { db } from '../firebase';
import { isAllowlisted } from './verify';

// lawPages/{sha256(url)}: the text a citation is checked against (F-CMP-6).
// `via` says whether we fetched it ourselves or the model read it for us.
const LawPage = z.object({
  url: z.string(),
  host: z.string(),
  jurisdiction: z.enum(LAW_JURISDICTIONS),
  text: z.string(),
  via: z.enum(['fetch', 'url_context']),
  fetchedAt: z.instanceof(Timestamp),
});

// A page with less text than this is a metadata page, an error or a firewall
// that answered 200 (ADR 4, spike of 2026-10-14).
const MIN_TEXT = 1000;
const MAX_REDIRECTS = 5;
// Some legal sites turn away anything that does not look like a browser
// (ADR 4).
const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
  'accept-language': 'en,id;q=0.8',
};

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  sect: '§',
  para: '¶',
  hellip: '…',
  middot: '·',
  bull: '•',
};

/** The visible text of an HTML page, one block per line. */
export const htmlToText = (html: string) =>
  html
    .replace(/<(head|script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, '')
    .replace(
      /<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/td|\/th|\/section)\b[^>]*>/gi,
      '\n',
    )
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (_, name: string) => {
      if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? ' ';
      const code =
        name[1] === 'x' || name[1] === 'X'
          ? parseInt(name.slice(2), 16)
          : parseInt(name.slice(1), 10);
      return String.fromCodePoint(code);
    })
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

// The body, or null once it is larger than the limit.
async function readCapped(response: Response, signal: AbortSignal) {
  const limit = config.limits.law.pageBytes;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength;
    // Leaving the loop cancels the rest of the body.
    if (size > limit || signal.aborted) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function pdfText(body: Buffer) {
  const document = await getDocumentProxy(new Uint8Array(body));
  return (await extractText(document, { mergePages: true })).text;
}

// The text of the page as we fetch it ourselves, or null when it is not
// usable. A redirect is followed only while it stays on the allowlist.
async function download(url: string, jurisdiction: LawJurisdiction) {
  const signal = AbortSignal.timeout(config.limits.law.pageSeconds * 1000);
  let at = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowlisted(at, jurisdiction)) return null;
    const response = await fetch(at, {
      headers: HEADERS,
      redirect: 'manual',
      signal,
    });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      at = new URL(location, at).href;
      continue;
    }
    if (response.status !== 200) return null;

    const body = await readCapped(response, signal);
    if (!body) return null;
    const type = response.headers.get('content-type') ?? '';
    const isPdf = body.subarray(0, 5).toString('latin1') === '%PDF-';
    const text = isPdf
      ? await pdfText(body)
      : type.includes('html')
        ? htmlToText(body.toString('utf8'))
        : null;
    return text && text.length >= MIN_TEXT ? text : null;
  }
  return null;
}

const fresh = (page: z.infer<typeof LawPage>) =>
  Date.now() - page.fetchedAt.toMillis() <
  config.limits.law.pageDays * 86_400_000;

/**
 * The text of an official page, from `lawPages` when stored in the last 30
 * days, else fetched and stored. When our fetch gets nothing usable, the
 * model reads the page instead (ADR 4). Null when neither can.
 */
export async function readPage(
  url: string,
  jurisdiction: LawJurisdiction,
  { readWithModel }: { readWithModel: (url: string) => Promise<string | null> },
): Promise<string | null> {
  if (!isAllowlisted(url, jurisdiction)) return null;

  const doc = db.doc(
    `lawPages/${createHash('sha256').update(url).digest('hex')}`,
  );
  const cached = LawPage.safeParse((await doc.get()).data());
  if (cached.success && fresh(cached.data)) return cached.data.text;

  const fetched = await download(url, jurisdiction).catch((err) => {
    console.warn(`Fetching ${url} failed:`, String(err));
    return null;
  });
  const read =
    fetched === null
      ? await readWithModel(url).catch((err) => {
          console.warn(`Reading ${url} with the model failed:`, String(err));
          return null;
        })
      : null;
  const text = fetched ?? (read && read.length >= MIN_TEXT ? read : null);
  // A page that cannot be fetched again is still the text we once read.
  if (text === null) return cached.success ? cached.data.text : null;

  await doc.set({
    url,
    host: new URL(url).hostname,
    jurisdiction,
    text,
    via: fetched === null ? 'url_context' : 'fetch',
    fetchedAt: Timestamp.now(),
  } satisfies z.infer<typeof LawPage>);
  return text;
}
