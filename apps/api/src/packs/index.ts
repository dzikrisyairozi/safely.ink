import type { DocType, WrittenStrategy } from '@repo/api-types';
import { employment } from './employment';
import { general } from './general';
import { insurance } from './insurance';
import { lease } from './lease';
import { loan } from './loan';
import { nda } from './nda';
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

// Every type but `other` has a pack of its own, so a report is labelled
// "general analysis" exactly when its type is `other` (F-READ-5).
const packs: Record<Exclude<DocType, 'other'>, Pack> = {
  employment,
  insurance,
  lease,
  loan,
  nda,
  terms,
};

export const packFor = (docType: DocType): Pack =>
  docType === 'other' ? general : packs[docType];
