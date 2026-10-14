import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Timestamp } from 'firebase-admin/firestore';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { db } from '../firebase';
import { htmlToText, readPage } from './fetch';

const url = 'https://sso.agc.gov.sg/Act/IA1966';
const stored = async (at = url) =>
  (
    await db
      .doc(`lawPages/${createHash('sha256').update(at).digest('hex')}`)
      .get()
  ).data();

const article =
  'A Singapore insurer must not use a form of proposal which does not ' +
  'have prominently displayed therein a warning. ';
const lawText = article.repeat(20); // a page is usable from 1,000 characters
const html = (body: string) =>
  `<html><head><title>Act</title><style>p{color:red}</style></head>` +
  `<body><script>var x = "not law";</script><p>${body}</p></body></html>`;
const htmlResponse = (body: string, init: ResponseInit = {}) =>
  new Response(html(body), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  });

const network = vi.fn<typeof fetch>();
const readWithModel = vi.fn<(url: string) => Promise<string | null>>();

beforeEach(async () => {
  await db.recursiveDelete(db.collection('lawPages'));
  network.mockReset();
  readWithModel.mockReset().mockResolvedValue(null);
  vi.stubGlobal('fetch', network);
});
afterEach(() => vi.unstubAllGlobals());

test('a host off the allowlist is never contacted', async () => {
  expect(
    await readPage('https://example.com/law', 'SG', { readWithModel }),
  ).toBeNull();
  expect(network).not.toHaveBeenCalled();
  expect(readWithModel).not.toHaveBeenCalled();
});

test('a page not stored yet is fetched like a browser and stored', async () => {
  network.mockResolvedValue(htmlResponse(lawText));

  const page = await readPage(url, 'SG', { readWithModel });
  const text = page?.text;

  expect(page?.via).toBe('fetch');
  expect(text).toContain(article.trim());
  expect(text).not.toContain('not law');
  expect(text).not.toContain('color:red');
  const [, init] = network.mock.calls[0]!;
  expect(new Headers(init?.headers).get('user-agent')).toMatch(/Chrome/);
  expect(await stored()).toMatchObject({
    url,
    host: 'sso.agc.gov.sg',
    jurisdiction: 'SG',
    text,
    via: 'fetch',
  });
});

test('a stored page is read without a request', async () => {
  network.mockResolvedValue(htmlResponse(lawText));
  const first = await readPage(url, 'SG', { readWithModel });
  network.mockClear();

  expect(await readPage(url, 'SG', { readWithModel })).toEqual(first);
  expect(network).not.toHaveBeenCalled();
});

test('a page stored more than 30 days ago is fetched again', async () => {
  network.mockResolvedValue(htmlResponse('Old wording. '.repeat(100)));
  await readPage(url, 'SG', { readWithModel });
  await db
    .doc(`lawPages/${createHash('sha256').update(url).digest('hex')}`)
    .update({
      fetchedAt: Timestamp.fromMillis(Date.now() - 31 * 86_400_000),
    });
  network.mockResolvedValue(htmlResponse(lawText));

  expect((await readPage(url, 'SG', { readWithModel }))?.text).toContain(
    article.trim(),
  );
  expect((await stored())?.text).toContain(article.trim());
});

test('an old stored page is still used when it cannot be fetched again', async () => {
  network.mockResolvedValue(htmlResponse(lawText));
  const first = await readPage(url, 'SG', { readWithModel });
  await db
    .doc(`lawPages/${createHash('sha256').update(url).digest('hex')}`)
    .update({ fetchedAt: Timestamp.fromMillis(0) });
  network.mockRejectedValue(new TypeError('fetch failed'));

  expect(await readPage(url, 'SG', { readWithModel })).toEqual(first);
});

test('a redirect is followed while it stays on the allowlist', async () => {
  const target = 'https://www.legislation.gov.au/C2009A00028/latest';
  network
    .mockResolvedValueOnce(
      new Response(null, { status: 301, headers: { location: target } }),
    )
    .mockResolvedValueOnce(htmlResponse(lawText));

  const page = await readPage('https://legislation.gov.au/x', 'AU', {
    readWithModel,
  });

  expect(page?.text).toContain(article.trim());
  expect(network.mock.calls[1]![0]).toBe(target);
});

test('a redirect off the allowlist is not followed and nothing is stored', async () => {
  network.mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { location: 'https://evil.example/law' },
    }),
  );

  expect(await readPage(url, 'SG', { readWithModel })).toBeNull();
  expect(network).toHaveBeenCalledTimes(1);
  expect(await stored()).toBeUndefined();
});

test('a body over 5 MB is not kept', async () => {
  network.mockResolvedValue(htmlResponse('x'.repeat(6 * 1024 * 1024)));

  expect(await readPage(url, 'SG', { readWithModel })).toBeNull();
  expect(await stored()).toBeUndefined();
});

test('a page that turns the request away is read by the model instead', async () => {
  // A firewall that answers 200 with a short page, as ojk.go.id does.
  network.mockResolvedValue(
    htmlResponse('Request Rejected. The requested URL was rejected.'),
  );
  readWithModel.mockResolvedValue(lawText);

  expect(await readPage(url, 'SG', { readWithModel })).toEqual({
    text: lawText,
    via: 'url_context',
  });
  expect(readWithModel).toHaveBeenCalledWith(url);
  expect(await stored()).toMatchObject({ text: lawText, via: 'url_context' });
});

test('a page the model read is still marked so when read from the store', async () => {
  network.mockResolvedValue(htmlResponse('Request Rejected.'));
  readWithModel.mockResolvedValue(lawText);
  await readPage(url, 'SG', { readWithModel });
  network.mockClear();

  expect((await readPage(url, 'SG', { readWithModel }))?.via).toBe(
    'url_context',
  );
  expect(network).not.toHaveBeenCalled();
});

test('a page neither we nor the model can read gives nothing', async () => {
  network.mockResolvedValue(new Response('Not found', { status: 404 }));

  expect(await readPage(url, 'SG', { readWithModel })).toBeNull();
  expect(await stored()).toBeUndefined();
});

test('the text of a PDF is read by code', async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([600, 800]);
  for (let line = 0; line < 30; line++) {
    page.drawText(
      `Pasal ${line + 1} Pelaku usaha dilarang membuat klausula baku.`,
      {
        x: 20,
        y: 780 - line * 25,
        size: 10,
        font,
      },
    );
  }
  const pdfUrl = 'https://peraturan.bpk.go.id/Download/1/uu.pdf';
  network.mockResolvedValue(
    new Response(await pdf.save(), {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }),
  );

  const read = await readPage(pdfUrl, 'ID', { readWithModel });

  expect(read?.via).toBe('fetch');
  expect(read?.text).toContain(
    'Pasal 18 Pelaku usaha dilarang membuat klausula baku.',
  );
  expect(readWithModel).not.toHaveBeenCalled();
  expect(await stored(pdfUrl)).toMatchObject({ via: 'fetch' });
});

test('HTML becomes text: tags out, entities decoded, blocks on their own lines', () => {
  expect(
    htmlToText(
      '<head><title>T</title></head><body><h1>Part&nbsp;1</h1>' +
        '<p>Don&rsquo;t &amp; won&#39;t &#x2014; &sect;&#160;5</p>' +
        '<noscript>enable js</noscript><div>Next<br>line</div></body>',
    ),
  ).toBe("Part 1\nDon’t & won't — § 5\nNext\nline");
});

test('an entity that names no character becomes a space', () => {
  expect(htmlToText('<p>a&#x110000;b</p>')).toBe('a b');
});
