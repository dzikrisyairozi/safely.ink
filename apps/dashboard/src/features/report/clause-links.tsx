import { Link } from '@tanstack/react-router';
import type { Clause } from '@repo/api-types';
import { ClauseLabel } from '../rules/rules-view';

/**
 * Links to clauses on "How we read your document", where each clause has an
 * anchor. A clause ID that is not in the document is left out.
 */
export function ClauseLinks({
  id,
  clauseIds,
  clauses,
}: {
  id: string;
  clauseIds: string[];
  clauses: Clause[];
}) {
  const cited = clauses.filter((clause) => clauseIds.includes(clause.id));
  if (cited.length === 0) return null;

  return (
    <span className="flex flex-wrap gap-x-4 font-mono text-xs">
      {cited.map((clause) => (
        <Link
          key={clause.id}
          to="/analyses/$id/rules"
          params={{ id }}
          hash={clause.id}
          className="underline"
        >
          <ClauseLabel clause={clause} />
        </Link>
      ))}
    </span>
  );
}
