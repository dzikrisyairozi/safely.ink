import { expect, test } from 'vitest';
import type { ClaimedCitation, LegalAssessment } from '@repo/api-types';
import { isAllowlisted, normalise, quoteFound, verify } from './verify';

const page =
  'Section 23.  A Singapore insurer must not use, in the course of\n' +
  'carrying on insurance business in Singapore, a form of proposal which\n' +
  'does not have prominently displayed therein a warning — that if a ' +
  'proposer does not fully and faithfully give the facts as the proposer ' +
  'knows them or ought to know them, the proposer may receive nothing.';

test('normalising ignores case, punctuation and how the text is spaced', () => {
  expect(normalise('  The  “Insurer” —  must\nNOT. ')).toBe(
    'the insurer must not',
  );
  // Full-width letters, as some PDFs give them, become plain ones.
  expect(normalise('ＡＢＣ')).toBe('abc');
});

test('a quote is found despite other spacing, case and punctuation', () => {
  expect(
    quoteFound(
      'a Singapore insurer must not use in the course of carrying on INSURANCE business',
      page,
    ),
  ).toBe(true);
  expect(
    quoteFound(
      '"a warning - that if a proposer does not fully and faithfully give the facts"',
      page,
    ),
  ).toBe(true);
});

test('a quote is found when it is part of a sentence, not the whole', () => {
  expect(quoteFound('the proposer may receive nothing', page)).toBe(true);
});

test('a quote that is not on the page is not found', () => {
  expect(
    quoteFound('An insurer shall not avoid a policy for any reason', page),
  ).toBe(false);
  // One changed word is enough.
  expect(
    quoteFound(
      'a Singapore insurer may not use, in the course of carrying',
      page,
    ),
  ).toBe(false);
});

test('a quote too short to identify a passage is not accepted', () => {
  // On the page, but so short it would be on almost any page.
  expect(quoteFound('the proposer', page)).toBe(false);
  expect(quoteFound('', page)).toBe(false);
});

test.each([
  ['https://sso.agc.gov.sg/Act/IA1966', 'SG', true],
  ['https://www.mom.gov.sg/a.pdf', 'SG', true],
  ['https://www.legislation.gov.au/C2009A00028/latest', 'AU', true],
  ['https://jdih.kemnaker.go.id/peraturan/1', 'ID', true],
  ['http://peraturan.bpk.go.id/Details/1', 'ID', true],
  ['HTTPS://PERATURAN.GO.ID/x', 'ID', true],
  // On the list of another country.
  ['https://sso.agc.gov.sg/Act/IA1966', 'AU', false],
  // Not an official source: a private copy of the official PDFs.
  ['https://pasal.id/peraturan/uu', 'ID', false],
  // Look-alikes.
  ['https://peraturan.go.id.evil.com/x', 'ID', false],
  ['https://evilperaturan.go.id/x', 'ID', false],
  ['https://jdih.a.b.go.id/x', 'ID', false],
  ['https://jdih.go.id/x', 'ID', false],
  [
    'https://vertexaisearch.cloud.google.com/grounding-api-redirect/x',
    'SG',
    false,
  ],
  // Not a web page.
  ['ftp://peraturan.go.id/x', 'ID', false],
  ['not a url', 'ID', false],
] as const)('%s on the %s allowlist: %s', (url, jurisdiction, allowed) => {
  expect(isAllowlisted(url, jurisdiction)).toBe(allowed);
});

const url = 'https://sso.agc.gov.sg/Act/IA1966?ProvIds=P12-';
const checked = {
  instrument: 'Insurance Act 1966',
  section: 's 23',
  quote: 'the proposer may receive nothing',
  url,
};
const citation: ClaimedCitation = { ...checked, supports: 'conflicts' };
const assessment: LegalAssessment = {
  status: 'conflicts',
  reasoning: 'The Act limits the duty to what the proposer knows.',
  citations: [citation],
};

test('a finding keeps the citations whose quote is on their page', () => {
  expect(verify(assessment, [{ url, text: page }], 'SG')).toEqual({
    ...assessment,
    citations: [checked],
    error: null,
  });
});

test('a status whose own quote fails falls back to what the surviving quotes show', () => {
  const restriction: ClaimedCitation = {
    ...checked,
    section: 's 23(1)',
    quote: 'a form of proposal which does not have prominently displayed',
    supports: 'restricted',
  };
  const invented: ClaimedCitation = {
    ...citation,
    quote: 'An insurer shall never refuse a claim on this ground',
  };

  const finding = verify(
    { ...assessment, citations: [invented, restriction] },
    [{ url, text: page }],
    'SG',
  );

  expect(finding).toEqual({
    status: 'restricted',
    reasoning: '',
    citations: [
      {
        instrument: restriction.instrument,
        section: restriction.section,
        quote: restriction.quote,
        url,
      },
    ],
    error: null,
  });
});

test('a quote showing a stronger status than the claim does not raise it', () => {
  const finding = verify(
    { ...assessment, status: 'restricted' },
    [{ url, text: page }],
    'SG',
  );

  expect(finding).toMatchObject({ status: 'no_finding', citations: [] });
});

test('only the quotes that show the status stay with the finding', () => {
  const permission: ClaimedCitation = {
    ...checked,
    quote: 'A Singapore insurer must not use, in the course of carrying',
    supports: 'permitted',
  };

  const finding = verify(
    { ...assessment, citations: [permission, citation] },
    [{ url, text: page }],
    'SG',
  );

  expect(finding).toMatchObject({
    status: 'conflicts',
    reasoning: assessment.reasoning,
    citations: [checked],
  });
});

test('a citation is dropped when its quote is not on its page', () => {
  const invented = {
    ...citation,
    quote: 'An insurer shall never refuse a claim',
  };
  const finding = verify(
    { ...assessment, citations: [citation, invented] },
    [{ url, text: page }],
    'SG',
  );

  expect(finding.citations).toEqual([checked]);
});

test('a citation is dropped when it points at a page the model was not given', () => {
  // The quote is real, but on a page we did not fetch, so we cannot know.
  const elsewhere = { ...citation, url: 'https://sso.agc.gov.sg/Act/MIA1906' };

  expect(
    verify(
      { ...assessment, citations: [elsewhere] },
      [{ url, text: page }],
      'SG',
    ).citations,
  ).toEqual([]);
});

test('a citation is dropped when its host is not on the allowlist', () => {
  const offList = 'https://example.com/ia1966';

  expect(
    verify(
      { ...assessment, citations: [{ ...citation, url: offList }] },
      [{ url: offList, text: page }],
      'SG',
    ).citations,
  ).toEqual([]);
});

test('a finding left with no citation says nothing was found', () => {
  const finding = verify(
    {
      ...assessment,
      citations: [{ ...citation, quote: 'Made up words here.' }],
    },
    [{ url, text: page }],
    'SG',
  );

  expect(finding).toEqual({
    status: 'no_finding',
    reasoning: '',
    citations: [],
    error: null,
  });
});

test('a citation URL written another way still names the same page', () => {
  const written = {
    ...citation,
    url: 'https://SSO.agc.gov.sg/Act/IA1966?ProvIds=P12-',
  };

  expect(
    verify({ ...assessment, citations: [written] }, [{ url, text: page }], 'SG')
      .citations,
  ).toHaveLength(1);
});
