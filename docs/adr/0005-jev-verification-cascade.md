# 5. Use Jev as a verification layer that can add caution and never remove it

## Status

Proposed on 2026-11-11, revised after an adversarial review the same day. Phase J0 runs offline on public or consented documents. Nothing from a user's analysis goes to TypeSafe under this decision.

## Context

The pipeline has one kind of citation check: code looks for the model's quote in the page we fetched. That check proves a quote exists. It does not prove the quote supports the claim, or that the provision applies to this agreement. [LegalCiteTrust](https://arxiv.org/abs/2607.20872) separates the three (existence, fidelity, applicability) and reports that revising reports on all three raises trust more than filtering on existence alone. Its data is Chinese legal research reports, so the size of the effect may not carry over. [L-MARS](https://arxiv.org/abs/2509.00761) reports strict citation F1 of 0.13 for naive retrieval and 0.25 with a multi-turn judge on a 100-question bar exam audit, which shows weak citation performance overall.

R0 made the status follow the quotes that survive. A quote can survive and still say nothing about the term. Gemini wrote that quote, so asking Gemini again is a weak second opinion.

Jev 1.14 is a [System One model](https://docs.typesafe.ai/concepts/system-one.md): it returns typed answers and probabilities and does not generate text. The [models page](https://docs.typesafe.ai/models.md), read on 2026-11-11, gives these facts:

| Fact            | Value                                   |
| --------------- | --------------------------------------- |
| Pinned model ID | `jev-1.14.0`                            |
| Price           | $0.042 per 1M input tokens, output free |
| Context         | 64k per request, 32k per question       |

The [changelog](https://docs.typesafe.ai/changelog.md) says 1.14 has better multilingual support and gives no figures. No page reports accuracy on Indonesian, so that has to be measured. The [jaggedness page](https://docs.typesafe.ai/model-jaggedness.md) says arithmetic, counting, date ordering and multi-hop reasoning are unreliable, that injected text in the state can shift answers, and that Choice answers lean toward the first option. The [legal page](https://docs.typesafe.ai/legal.md) states a commitment not to train on user data, and zero data retention for enterprise customers.

## Decision

Jev joins as a verification layer with five rules.

1. Code decides. Jev never sets an outcome, a loss, a grade or a legal status.
2. Jev can add caution and never remove it. A Jev answer alone cannot remove evidence, suppress a warning, lower a severity or raise a grade. A wrong answer that removed a citation could erase the only reason a trap exists, and could turn a true warning into an A.
3. A disputed reassurance is the one status that moves. When Jev doubts a `permitted` finding, the report withdraws the assurance and shows uncertainty. A disputed `conflicts` or `restricted` finding stays visible, with the disagreement shown beside it, until a separate source-backed assessment with an audit trail resolves it.
4. Everything starts offline. A question affects users only after it passes a stated gate on labelled Indonesian data, one action at a time.
5. Contract-derived text goes to TypeSafe only under agreed processing terms, disclosure, retention and minimization. That covers rule summaries and model reasoning as well as clause text. Statute text is public and free to send.

### Phases

| Phase | What it does                                                                                                 | Text sent                                                 | Effect                                                                                                                                                                                                  | Gate to start                                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J0    | Offline judgments on fidelity and applicability                                                              | Public or consented evaluation documents and statute text | A results file, read by the calibration script                                                                                                                                                          | R1 tooling and the owner's API key                                                                                                                       |
| J1    | The same judgments on live findings, as annotations and requests for a second assessment                     | Masked rule text and statute text                         | Caution only, under rules 2 and 3                                                                                                                                                                       | Processing terms and masking (R3), facts from R6, provision context from R5, durable runs (R2), and the calibration gate                                 |
| J2    | Passage relevance, as a reranker over the top 30 of hybrid search                                            | Query and statute passage                                 | Experimental. Measured beside the baseline order. A reranker can push the only applicable provision out of the passages the assessment reads, which would remove a warning upstream of every other rule | R5 corpus. Going live also needs a design that keeps the baseline's top passages alongside the reranked ones, and an evaluation of the resulting reports |
| J3    | Clause signals: sole discretion, unilateral change, undefined trigger, affects the user but no rule cites it | One clause, masked                                        | Adds a coverage gap, listed for the user to read. An open gap lowers confidence and withholds a good grade, as an untested rule does. It is never a legal finding                                       | R3 masking, a signed processing agreement, zero data retention                                                                                           |
| J4    | Mirrored expectation, where role swaps keep the law the same                                                 | One scenario                                              | Measures the judge's lean in R12                                                                                                                                                                        | R12                                                                                                                                                      |
| J5    | Where a clause sits on a photographed page, through Box questions                                            | Page image                                                | Clause highlight on photos in R8                                                                                                                                                                        | Same as J3                                                                                                                                               |

J3 is the strongest use. A clause that Jev says affects the user, and that no rule cites, is the false reassurance the PRD names as a risk. The PRD allows a good grade only when the run covered the document, so an open gap caps the grade at `GRADE_FORMULA.untestedBest`.

### J0 design

J0 is a batch script, separate from report production. It reads committed finding snapshots from the evaluation set, so it cannot delay a lookup, fail a stage or leave a record for a user to read.

`apps/api/src/legal/jev.ts` is the only code that calls TypeSafe. It holds the fixed questions, the endpoint and the answer options. Everything else (summary, reasoning, role, passage) is passed as quoted data in `state`. The client rejects a response whose answers are missing, whose keys are unexpected, or whose probabilities are not finite numbers between 0 and 1.

```ts
type Relation = 'supports' | 'partly_supports' | 'contradicts' | 'says_nothing';

// One claim about the law, one citation. `null` means no judgment was recorded.
type Judgment = {
  claimId: string;
  citationIndex: number;
  relation: Record<Relation, number>;
  factsSufficient: number; // noul: do the given facts settle applicability?
  applies: number; // noul: given those facts, does the provision govern?
  optionOrder: Relation[];
  model: string; // the model that answered, not the alias requested
};
```

The request goes to `POST https://api.typesafe.ai/v1/systemone` with `fetch` and `model: 'jev-1.14.0'`.

A claim has to be a single proposition. A paragraph of reasoning can state a true rule and a false application at once, and one relation over it says nothing useful. So J0 judges claim and citation pairs, where each claim separates what the provision says from how it meets the term. The assessment schema gains that split as part of J1's prerequisites. J0 builds the pairs from its labelled set.

The state carries the term, the agreement's document type, role, regulated product and date, the claim, and the passage. Applicability asks two questions: are the given facts enough to tell, and if so does the provision apply. Missing facts produce an abstention. The passage is the whole provision, with its parent text, definitions and referenced ayat where R5 has them. Before R5, a window around the quote is marked as incomplete context and those results stay experimental.

Each result line stores a fingerprint of the rule, claim, citation and source text, plus the question version, the requested and returned model, the option order, the input and the time. A timeout is recorded as a missing judgment and counted.

### Calibration and gates

`apps/api/scripts/jev-calibrate.ts` reads the labelled file and the J0 results. A Brier score alone can pass a useless classifier: at 1% prevalence, always answering "no" scores 0.01 and finds nothing. So the script reports, per class and per action:

- precision, recall and false-positive rate at the deployment prevalence
- the precision-recall curve and a reliability table
- coverage after abstention, and how many judgments were missing
- reports whose content changed for the worse
- how often the answer or an action threshold changes across option orders, with every option placed in every position

Thresholds are tuned on development data and the frozen rule is scored on a holdout split by provider and template family.

An action goes live when the one-sided 95% upper bound on harmful actions is below a risk budget set per action, with a separate bound on newly introduced false reassurance. These budgets are proposals for counsel and the owner to set. With zero errors observed, a 1% bound needs 299 independent eligible decisions, 0.5% needs 598 and 0.1% needs 2,995. Citations from the same agreement are correlated, so they do not count as independent. Thresholds start at the documented conservative bands (0.7 for yes, 0.3 for no, the gap as its own outcome).

A `says_nothing` answer is never treated as proof that a citation is wrong. Statutes state rules generally, so a passage can govern a term without naming it.

The evaluation set includes Indonesian prompt-injection cases placed in agreements and in statute pages, because a typed answer can still be steered by the text it reads. Rules 1 to 3 limit what a steered answer can do.

## Consequences

- J0 needs labelled data and an API key, and adds nothing to a user's report. Its value is the measurement.
- J1 is the first phase users can see, and it has the most prerequisites.
- Jev answers are probabilities from a model nobody at safely.ink can inspect, so each gate is a measured result on our data and not a vendor figure.
