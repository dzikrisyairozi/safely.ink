import { createFileRoute } from '@tanstack/react-router';
import {
  Clause,
  Rule,
  StoredFinding,
  StoredScenario,
  Trap,
} from '@repo/api-types';
import { AppHeader } from '../../../../../components/layout/app-header';
import { Main } from '../../../../../components/layout/main';
import { useAnalysis } from '../../../../../features/analysis/use-analysis';
import { useSubcollection } from '../../../../../features/analysis/use-subcollection';
import { GeneralError } from '../../../../../features/errors/general-error';
import { NotFoundError } from '../../../../../features/errors/not-found-error';
import { TrapView } from '../../../../../features/report/trap-view';

export const Route = createFileRoute(
  '/_authenticated/analyses/$id/traps/$trapId',
)({ component: TrapPage });

function TrapPage() {
  const { id, trapId } = Route.useParams();
  const { analysis, failed } = useAnalysis(id);
  const traps = useSubcollection(id, 'traps', Trap);
  const rules = useSubcollection(id, 'rules', Rule);
  const scenarios = useSubcollection(id, 'scenarios', StoredScenario);
  const clauses = useSubcollection(id, 'clauses', Clause);
  const findings = useSubcollection(id, 'findings', StoredFinding);

  if (failed) return <GeneralError />;
  // Missing, or someone else's.
  if (analysis === null) return <NotFoundError />;
  // Without the findings the trap still shows, without what the law says.
  const lists = [traps, rules, scenarios, clauses];
  if (lists.includes(null)) return <GeneralError />;
  const trap = traps?.find((candidate) => candidate.id === trapId);
  if (traps && !trap) return <NotFoundError />;

  return (
    <>
      <AppHeader />
      <Main>
        {analysis && trap && rules && scenarios && clauses && (
          <TrapView
            id={id}
            analysis={analysis}
            trap={trap}
            rules={rules}
            scenarios={scenarios}
            clauses={clauses}
            finding={findings?.find(({ ruleId }) => ruleId === trap.ruleId)}
          />
        )}
      </Main>
    </>
  );
}
