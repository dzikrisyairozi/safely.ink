import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { AnalysisMeta, Rule } from '@repo/api-types';
import { searchLaw } from '../agents/legal-researcher';
import { findSources } from './search';

vi.mock('../agents/legal-researcher');
const search = vi.mocked(searchLaw);
const network = vi.fn<typeof fetch>();

const meta = {
  docType: 'insurance',
  jurisdiction: 'SG',
  userRole: 'insured',
} as AnalysisMeta & { jurisdiction: 'SG' };
const rule = { id: 'r-002', summary: 'Not covered.' } as Rule;
const redirect = (n: number) =>
  `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${n}`;
const to = (location: string) =>
  new Response(null, { status: 302, headers: { location } });

beforeEach(() => {
  search.mockReset();
  network.mockReset();
  vi.stubGlobal('fetch', network);
});
afterEach(() => vi.unstubAllGlobals());

test('a grounding redirect is resolved to the page it points at', async () => {
  search.mockResolvedValue([redirect(1)]);
  network.mockResolvedValue(to('https://sso.agc.gov.sg/Act/IA1966'));

  expect(await findSources(rule, meta)).toEqual([
    'https://sso.agc.gov.sg/Act/IA1966',
  ]);
  const [url, init] = network.mock.calls[0]!;
  expect(url).toBe(redirect(1));
  expect(init?.redirect).toBe('manual');
});

test('the search is told the official sites of the country', async () => {
  search.mockResolvedValue([]);

  await findSources(rule, meta);

  expect(search).toHaveBeenCalledWith(rule, meta, [
    'sso.agc.gov.sg',
    'mas.gov.sg',
    'mom.gov.sg',
  ]);
});

test('a page off the allowlist is dropped', async () => {
  search.mockResolvedValue([redirect(1), redirect(2)]);
  network
    .mockResolvedValueOnce(to('https://www.singaporelegaladvice.com/x'))
    .mockResolvedValueOnce(to('https://www.mom.gov.sg/a.pdf'));

  expect(await findSources(rule, meta)).toEqual([
    'https://www.mom.gov.sg/a.pdf',
  ]);
});

test('a URI that is neither a redirect nor allowlisted is never contacted', async () => {
  search.mockResolvedValue(['https://evil.example/law']);

  expect(await findSources(rule, meta)).toEqual([]);
  expect(network).not.toHaveBeenCalled();
});

test('a redirect that cannot be resolved is dropped, not guessed', async () => {
  search.mockResolvedValue([redirect(1), redirect(2)]);
  network
    .mockRejectedValueOnce(new TypeError('fetch failed'))
    .mockResolvedValueOnce(new Response('no location', { status: 200 }));

  expect(await findSources(rule, meta)).toEqual([]);
});

test('the same page is kept once, and at most three pages', async () => {
  const pages = [
    'https://sso.agc.gov.sg/Act/IA1966',
    'https://sso.agc.gov.sg/Act/IA1966',
    'https://www.mas.gov.sg/a',
    'https://www.mas.gov.sg/b',
    'https://www.mom.gov.sg/c',
  ];
  search.mockResolvedValue(pages.map((_, n) => redirect(n)));
  for (const page of pages) network.mockResolvedValueOnce(to(page));

  expect(await findSources(rule, meta)).toEqual([
    'https://sso.agc.gov.sg/Act/IA1966',
    'https://www.mas.gov.sg/a',
    'https://www.mas.gov.sg/b',
  ]);
});

test('a URI already on the allowlist needs no resolving', async () => {
  search.mockResolvedValue(['https://sso.agc.gov.sg/Act/IA1966']);

  expect(await findSources(rule, meta)).toEqual([
    'https://sso.agc.gov.sg/Act/IA1966',
  ]);
  expect(network).not.toHaveBeenCalled();
});
