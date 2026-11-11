import { expect, test } from 'vitest';
import { GRADE_FORMULA, RUN_STALE_SECONDS } from '@repo/api-types';
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
      rules: [],
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

test('the calls of the confirm request end before Cloud Run ends the request', () => {
  const { modelCallSeconds: call, confirmSeconds } = loadConfig({}).limits;

  // One after the other, each at its limit, the fuzzer at its most.
  expect(
    call.facts +
      call.rules +
      call.repair +
      call.fuzzMost +
      call.judge +
      call.wording,
  ).toBeLessThanOrEqual(confirmSeconds);
  expect(call.fuzzMost).toBeGreaterThanOrEqual(call.fuzz);
  expect(confirmSeconds).toBeLessThan(900);
});

test('no stage outlasts the age at which a run counts as dead', () => {
  const { modelCallSeconds: call, confirmSeconds } = loadConfig({}).limits;

  // Otherwise a live run could be deleted and write its records again.
  expect(confirmSeconds).toBeLessThan(RUN_STALE_SECONDS);
  expect(call.read).toBeLessThan(RUN_STALE_SECONDS);
});

test('the grade is computed with the formula the report shows', () => {
  const config = loadConfig({});

  expect(config.scoring.penalty).toBe(GRADE_FORMULA.penalty);
  expect(config.scoring.gradeBands).toBe(GRADE_FORMULA.gradeBands);
  expect(config.scoring.untestedBest).toBe(GRADE_FORMULA.untestedBest);
});

const queue = {
  TASKS_QUEUE: 'projects/safely-ink/locations/asia-southeast2/queues/stages',
  WORKER_URL: 'https://worker.example.com',
  TASKS_SERVICE_ACCOUNT: 'tasks@safely-ink.iam.gserviceaccount.com',
};

test('the task queue settings load together', () => {
  expect(loadConfig(queue)).toMatchObject(queue);
});

test.each(Object.keys(queue))('%s alone is refused', (key) => {
  expect(() => loadConfig({ [key]: queue[key as keyof typeof queue] })).toThrow(
    /together, or none of them/,
  );
});

test('a queue name that is not a full resource name is refused', () => {
  expect(() => loadConfig({ ...queue, TASKS_QUEUE: 'stages' })).toThrow(
    /TASKS_QUEUE/,
  );
});

const budgetPush = {
  BUDGET_PUSH_AUDIENCE: 'https://api.example.com/internal/budget',
  BUDGET_PUSH_SERVICE_ACCOUNT: 'budget-push@example.com',
};

test('the budget push settings load together or remain unset', () => {
  expect(loadConfig(budgetPush)).toMatchObject(budgetPush);
  expect(loadConfig({}).BUDGET_PUSH_AUDIENCE).toBeUndefined();
  expect(loadConfig({}).BUDGET_PUSH_SERVICE_ACCOUNT).toBeUndefined();
});

test.each(Object.keys(budgetPush))('%s alone is refused', (key) => {
  expect(() =>
    loadConfig({ [key]: budgetPush[key as keyof typeof budgetPush] }),
  ).toThrow(/together, or none of them/);
});

test.each([
  ['BUDGET_PUSH_AUDIENCE', 'not a url'],
  ['BUDGET_PUSH_SERVICE_ACCOUNT', 'not an email'],
])('an invalid %s is refused', (key, value) => {
  expect(() => loadConfig({ ...budgetPush, [key]: value })).toThrow(key);
});
