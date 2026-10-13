import { expect, test } from 'vitest';
import { loadConfig } from './config';
import { score } from './engine/score';

test('defaults apply when the environment is empty', () => {
  const config = loadConfig({});

  expect(config.PORT).toBe(3001);
  expect(config.ALLOWED_ORIGIN).toBe('http://localhost:5174');
});

test('values from the environment win over defaults', () => {
  const config = loadConfig({
    PORT: '8080',
    ALLOWED_ORIGIN: 'https://app.safely.ink',
  });

  expect(config.PORT).toBe(8080);
  expect(config.ALLOWED_ORIGIN).toBe('https://app.safely.ink');
});

test('an invalid value stops startup and names the variable', () => {
  expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  expect(() => loadConfig({ ALLOWED_ORIGIN: 'not a url' })).toThrow(
    /ALLOWED_ORIGIN/,
  );
});

test('the scoring weights give the grade TSD 5.7 works out by hand', () => {
  // One trap: the whole stake lost (3) in a common scenario (2) under a rule
  // the law restricts (2). Seven points is critical, which costs 20.
  const result = score(
    {
      scenarios: [
        {
          id: 's-1',
          story: '',
          strategy: 'boundary',
          frequency: 'common',
          targetRuleIds: [],
          stake: 1000,
          facts: {},
        },
      ],
      outcomes: [
        {
          scenarioId: 's-1',
          result: 'bad',
          stake: 1000,
          loss: 1000,
          decidingRuleId: 'r-1',
          trace: [],
        },
      ],
      expectations: { 's-1': { result: 'fine', reason: '' } },
      findings: {
        'r-1': {
          status: 'restricted',
          reasoning: '',
          citations: [
            {
              instrument: 'Insurance Act 1966',
              section: 's 25(5)',
              quote: 'An insurer may not rely on the term.',
              url: 'https://example.com/insurance-act',
            },
          ],
          error: null,
        },
      },
      meta: { docType: 'insurance', unreadablePages: [] },
    },
    loadConfig({}).scoring,
  );

  expect(result).toMatchObject({
    traps: [{ severity: 'critical' }],
    points: 80,
    grade: 'B',
    confidence: 'high',
  });
});
