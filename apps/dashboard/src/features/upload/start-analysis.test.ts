import { expect, test } from 'vitest';
import { CreateAnalysisRequest } from '@repo/api-types';
import { storedName } from './start-analysis';

const file = (name: string) => new File(['x'], name);

test('the stored name keeps the page position and a readable file name', () => {
  expect(storedName(file('Polis Asuransi (2026).pdf'), 0)).toBe(
    '0-Polis_Asuransi_2026_.pdf',
  );
});

test('a file name with dots in a row is still accepted by the API', () => {
  const request = CreateAnalysisRequest.safeParse({
    analysisId: 'analysis-1',
    files: [storedName(file('scan..final...pdf'), 3)],
  });

  expect(request.success).toBe(true);
});
