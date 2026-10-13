import type { DocType } from '@repo/api-types';
import { general } from './general';
import { insurance } from './insurance';
import { terms } from './terms';

// Prompt content for one document type. A pack never changes what the code
// does with the answer (TSD 3.2).
export type Pack = {
  // Facts that usually matter in this kind of document, in plain words.
  facts: string[];
};

const packs: Partial<Record<DocType, Pack>> = { insurance, terms };

export const packFor = (docType: DocType): Pack => packs[docType] ?? general;
