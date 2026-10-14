import type { DocType, WrittenStrategy } from '@repo/api-types';
import { general } from './general';
import { insurance } from './insurance';
import { loan } from './loan';
import { terms } from './terms';

// Prompt content for one document type. A pack never changes what the code
// does with the answer (TSD 3.2).
export type Pack = {
  // Facts that usually matter in this kind of document, in plain words.
  facts: string[];
  // Situations worth trying, per strategy (F-FUZZ-4). Boundary scenarios
  // are built in code from the rules and need none.
  seeds: Record<WrittenStrategy, string[]>;
  // What people in the user's role take for granted, and what they know
  // they do not get (F-CMP-1). For the judge, who sees no fine print.
  hints: string[];
};

const packs: Partial<Record<DocType, Pack>> = { insurance, loan, terms };

export const packFor = (docType: DocType): Pack => packs[docType] ?? general;
