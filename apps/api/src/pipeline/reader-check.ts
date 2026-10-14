import {
  DocType,
  isLawChecked,
  type AnalysisMeta,
  type Clause,
  type CreateAnalysisRequest,
  type ReaderOutput,
} from '@repo/api-types';

export type Reading =
  | { status: 'rejected' }
  | { status: 'failed' }
  | { status: 'awaiting_confirmation'; meta: AnalysisMeta; clauses: Clause[] };

/**
 * Turns what the Reader returned into what the analysis becomes. The model
 * proposes; this function decides. Pure: no I/O and no model call.
 *
 * `pageCount` comes from the files, not from the model. `pick` is what the
 * user said the document is; it wins over what the Reader found, which is
 * kept in `detected` so the user can be told when the two differ.
 */
export function checkReading(
  read: ReaderOutput,
  pageCount: number,
  pick: Pick<CreateAnalysisRequest, 'docType' | 'jurisdiction'>,
): Reading {
  if (!read.isPolicyOrContract) return { status: 'rejected' };

  const onAPage = (page: number) => page >= 1 && page <= pageCount;

  const clauses = read.clauses
    .filter((clause) => clause.text.trim() && onAPage(clause.page))
    .map((clause, n) => ({
      ...clause,
      id: `c-${String(n + 1).padStart(3, '0')}`,
    }));
  // A contract with no usable clause cannot be analysed; say so now rather
  // than hand an empty document to the next stage.
  if (clauses.length === 0) return { status: 'failed' };

  const docType = DocType.safeParse(read.docType.trim().toLowerCase());

  return {
    status: 'awaiting_confirmation',
    clauses,
    meta: {
      docType: pick.docType,
      title: read.title.trim(),
      parties: read.parties,
      userRole: null,
      jurisdiction: pick.jurisdiction,
      lawChecked: isLawChecked(pick.jurisdiction),
      detected: {
        docType: docType.success ? docType.data : 'other',
        jurisdiction: read.jurisdiction.trim().toUpperCase(),
      },
      language: read.language,
      pageCount,
      unreadablePages: [...new Set(read.unreadablePages.filter(onAPage))].sort(
        (a, b) => a - b,
      ),
    },
  };
}
