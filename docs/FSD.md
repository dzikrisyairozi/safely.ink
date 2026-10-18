# safely.ink functional specification

|         |                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| Status  | Revision 3                                                                                                              |
| Date    | 2026-10-18                                                                                                              |
| Scope   | The deployed build, v1.0.1. Planned behaviour is in the [roadmap](./ROADMAP.md) and moves here when its milestone ships |
| Related | [PRD](./PRD.md) · [TSD](./TSD.md) · [Roadmap](./ROADMAP.md) · [Flow](./FLOW.md)                                         |

This document says **what the system does** from the outside. How it is built is in the TSD.

## 1. Glossary

| Term           | Meaning                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document       | The policy or contract the user uploads.                                                                                                                               |
| Document type  | `insurance`, `loan`, `employment`, `nda`, `lease`, `terms`, or `other`.                                                                                                |
| Pack           | Prompt content for one document type: the facts worth looking for and scenario seeds, later also expectation hints. A type without its own pack uses the general pack. |
| User's role    | The party the user is in the document (insured, borrower, employee, receiving party, tenant, …). Everything is judged from this side.                                  |
| Clause         | One numbered or otherwise separable piece of wording, with its page.                                                                                                   |
| Fact schema    | The list of facts that matter for this document (for example `daysSinceStart`, `noticeGivenDays`), derived from the document itself.                                   |
| Rule           | A machine-checkable statement derived from one or more clauses, written over the fact schema.                                                                          |
| Unmodeled rule | A clause that affects the user but cannot be expressed as a machine condition. Shown to the user, never silently dropped.                                              |
| Scenario       | A generated situation: a short story plus a value for every fact. For insurance this is a claim; for a lease it may be "moving out two months early".                  |
| Outcome        | Result of running a scenario through the rules, from the user's side: `fine`, `partly_bad`, `bad`, or `undetermined`, with money lost where it applies.                |
| Expectation    | What a reasonable person in the user's role would expect in that scenario, judged without seeing the fine print.                                                       |
| Legal finding  | What the law of the document's jurisdiction says about the deciding rule, with citation.                                                                               |
| Trap           | A scenario whose outcome is worse than the expectation, or whose deciding rule conflicts with the law.                                                                 |
| Analysis       | One run of the whole pipeline on one document, and its stored result.                                                                                                  |

## 2. Actors

- **Visitor**: not signed in. Sees the landing page only.
- **User**: signed in with Google. Owns analyses.
- **System**: the pipeline. Acts only on the user's uploaded document.

## 3. End-to-end flow

```
Landing ──► Sign in ──► Upload ──► Confirm details ──► Live run ──► Report ──► History
                                                         │
                                 Read ► Rules ► Fuzz ► Run ► Compare
```

1. Visitor opens the landing page and chooses "Check a document".
2. Visitor signs in with Google.
3. User says what kind of document it is and which country it is from (or Global), then
   uploads a PDF or one or more page photos.
4. System reads the document: title, the parties, language, and on its own the document
   type and jurisdiction. User confirms or corrects type and country, is told when the
   document reads like something else, and picks which party they are.
5. System runs the remaining stages. The user watches stage progress and sees traps
   appear as they are found.
6. User lands on the report: grade, summary numbers, ranked traps.
7. User opens a trap to see scenario, outcome, expectation, deciding clause and law.
8. The analysis is in the user's history until they delete it.

## 4. Functional requirements

Each requirement has an ID used by the TSD and by tests.

### 4.1 Access

| ID       | Requirement                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-AUTH-1 | The only sign-in method is Google.                                                                                                                     |
| F-AUTH-2 | All product screens except the landing page require sign-in; unauthenticated access redirects to sign-in and returns to the requested page afterwards. |
| F-AUTH-3 | A user can read and delete only their own analyses and files.                                                                                          |
| F-AUTH-4 | The user can sign out from any product screen.                                                                                                         |

### 4.2 Upload

| ID     | Requirement                                                                                                                                                                                                                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-UP-1 | Accepted input: one PDF, **or** 1–30 images (JPEG, PNG, WebP, HEIC) treated as pages in the order given.                                                                                                                                                                                                                                  |
| F-UP-2 | Limits: total 30 MB, 100 pages. Over the limit, the upload is refused with a message that states the limit.                                                                                                                                                                                                                               |
| F-UP-3 | The user can reorder and remove page images before starting.                                                                                                                                                                                                                                                                              |
| F-UP-4 | The upload screen shows the "not legal advice" notice and the data notice (private, source file deleted after 7 days) before the user starts.                                                                                                                                                                                             |
| F-UP-5 | A user may start at most 10 analyses per day. The 11th shows when the limit resets.                                                                                                                                                                                                                                                       |
| F-UP-6 | Before uploading, the user picks the document type and the country it is from: one of the JAPAC countries (Australia, China, Hong Kong, India, Indonesia, Japan, Malaysia, New Zealand, Philippines, Singapore, South Korea, Taiwan, Thailand, Vietnam) or Global, for a document no single country governs. Nothing starts without both. |

### 4.3 Read and confirm

| ID       | Requirement                                                                                                                                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-READ-1 | The system extracts the clauses with clause number (if any), heading, verbatim text and page number.                                                                                                                                                                                  |
| F-READ-2 | The system detects document type, title, the named parties and their roles, jurisdiction (from the governing-law clause, else from other evidence) and document language. Type and jurisdiction are a check on the user's pick (F-UP-6), not a replacement for it.                    |
| F-READ-3 | Before the run continues, the user confirms or changes the document type and country, and selects which party they are. When the detected type or country differs from the pick, the screen says so and one click takes it; a detected country outside the list is offered as Global. |
| F-READ-4 | If the upload is not a policy or contract (for example a letter, an invoice, a photo of something else), the run stops with a clear message and nothing is counted against the daily limit.                                                                                           |
| F-READ-5 | A policy or contract that is not one of the six tuned types is analysed with the general pack, and its report is labelled "general analysis".                                                                                                                                         |
| F-READ-6 | The legal comparison runs for Indonesia, Singapore and Australia. Indonesia's legal sources are kept up to date. Singapore and Australia work as in v1.0.1. Any other jurisdiction, or Global, does not stop the run. The legal comparison is skipped and the report says so.         |
| F-READ-7 | Documents in any language are accepted. The interface is in English and Indonesian. Generated report text is written in English, and quoted clauses stay in the original language with an English gloss.                                                                              |
| F-READ-8 | If pages are unreadable (blurred, cut off), the system says which pages and continues with the rest; the report carries a visible "incomplete document" warning.                                                                                                                      |

### 4.4 Rules

| ID       | Requirement                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| F-RULE-1 | Every rule references at least one existing clause. A rule that references no real clause is discarded.                               |
| F-RULE-2 | Every rule has a kind, a plain-English one-line summary, and a machine condition that uses only facts in the document's fact schema.  |
| F-RULE-3 | A clause that affects the user but cannot be expressed as a machine condition becomes an unmodeled rule with a plain-English summary. |
| F-RULE-4 | The user can open "How we read your document" and see all rules grouped by kind, each linking to its clause.                          |
| F-RULE-5 | Every fact in the fact schema has a plain-English description, so that a non-expert can read a rule.                                  |

### 4.5 Fuzz

| ID       | Requirement                                                                                                                                                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-FUZZ-1 | The system aims for between 20 and 40 scenarios per analysis and never keeps more than 40. A short document can give fewer; the run goes on with what there is.                                                                                                       |
| F-FUZZ-2 | Each scenario has a 1–3 sentence story a non-expert understands, told from the user's role, and a value for every fact in the fact schema.                                                                                                                            |
| F-FUZZ-3 | Scenarios target the document's own rules. At least one scenario probes each rule that can hurt the user, up to the scenario cap.                                                                                                                                     |
| F-FUZZ-4 | Strategies used: boundary (just inside and just outside a number or date), overlap (an allowed situation with a disallowed contributing factor), definition (a situation at the edge of a defined term), procedure (late notice, missing paperwork), and combination. |
| F-FUZZ-5 | Scenarios must be realistic: things that happen to ordinary people in that role. No fraud by the user, no absurd events.                                                                                                                                              |
| F-FUZZ-6 | A baseline set of plainly unproblematic scenarios is included so that the report can also show what works.                                                                                                                                                            |

### 4.6 Run

| ID      | Requirement                                                                                                                                    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| F-RUN-1 | Each scenario gets exactly one outcome: `fine`, `partly_bad`, `bad`, or `undetermined`.                                                        |
| F-RUN-2 | The outcome is produced by a deterministic engine. Running the same rules and scenario again gives the same outcome and amounts.               |
| F-RUN-3 | Each outcome carries a trace: the ordered list of rules that applied and the fact that triggered each one.                                     |
| F-RUN-4 | Where money is involved, the outcome states the amount at stake and the amount the user loses (unpaid claim, penalty, fee, forfeited deposit). |
| F-RUN-5 | If an unmodeled rule could plausibly decide the scenario, the outcome is `undetermined` and names that rule.                                   |

### 4.7 Compare

| ID      | Requirement                                                                                                                                                                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-CMP-1 | **Expectation.** For each scenario the system records what a reasonable person in the user's role would expect (`fine`, `partly_bad`, `bad`) and a one-sentence reason. This judgment is made from the kind of document and the scenario story only.                   |
| F-CMP-2 | **Law.** For each rule that decides a `bad` or `partly_bad` outcome, the system looks up the law of the document's jurisdiction and records one of: `conflicts`, `restricted` (allowed only under conditions the document may not meet), `permitted`, or `no finding`. |
| F-CMP-3 | Every legal finding other than `no finding` has at least one citation: instrument name, article or section number, a verbatim quote, and a link to the official source.                                                                                                |
| F-CMP-4 | A citation is shown only if its quote is found in the text of the cited page as fetched by the system. Otherwise the finding is downgraded to `no finding`.                                                                                                            |
| F-CMP-5 | Citations come only from the official legal sources listed for each jurisdiction. A source outside that list is never cited.                                                                                                                                           |
| F-CMP-6 | The source text a citation was checked against is kept with the analysis, so the quote can be checked again later.                                                                                                                                                     |

### 4.8 Traps and grade

| ID       | Requirement                                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-TRAP-1 | A scenario is a trap when (a) the outcome is `bad` or `partly_bad` and the expectation is better than the outcome, or (b) its deciding rule has a `conflicts` or `restricted` legal finding. |
| F-TRAP-2 | Traps that share the same deciding rule are merged into one trap with several example scenarios.                                                                                             |
| F-TRAP-3 | Each trap has a severity: `critical`, `high`, `medium`, `low`, from what the user loses, how common the scenario is, and the legal finding.                                                  |
| F-TRAP-4 | The analysis has a grade A–F computed by a fixed formula from the traps. The formula is shown to the user on request.                                                                        |
| F-TRAP-5 | `undetermined` scenarios are listed separately as "Unclear — read these clauses yourself" and reduce the stated confidence of the grade, not the grade itself.                               |

### 4.9 Report

| ID      | Requirement                                                                                                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-REP-1 | The report header shows title, other party, document type, the user's role, country or Global, date, grade, confidence, and counts: scenarios tested, fine, partly bad, bad, unclear, traps.  |
| F-REP-2 | Traps are listed by severity. Each row shows a plain-English title, the severity, and "You'd expect: … / The document says: …".                                                               |
| F-REP-3 | Opening a trap shows: example scenario(s), outcome and amounts, expectation and reason, the rule trace, the verbatim clause with page number, and the legal finding with citations and links. |
| F-REP-4 | Critical and high traps show a "what you can do" note: questions to ask the other party before signing. Where to get help in that jurisdiction is added with the legal comparison.            |
| F-REP-5 | A "What works in your favour" section lists the baseline scenarios that came out `fine`.                                                                                                      |
| F-REP-6 | The disclaimer is visible on the report without scrolling to the end.                                                                                                                         |
| F-REP-7 | Wording is neutral. The report describes what the wording does; it does not accuse the other party.                                                                                           |
| F-REP-8 | Reports from the general pack carry a "general analysis" label; reports without legal comparison say which jurisdiction was detected and that its law is not yet checked.                     |

### 4.10 Live progress

| ID       | Requirement                                                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-LIVE-1 | During a run the user sees the five stages (Read, Rules, Fuzz, Run, Compare) with the current one marked, and counts as they grow (clauses, rules, scenarios, traps). |
| F-LIVE-2 | Traps appear on screen as they are confirmed, before the run ends.                                                                                                    |
| F-LIVE-3 | The user may close the tab. The run continues, and the analysis shows in history with its current status.                                                             |
| F-LIVE-4 | If a stage fails, the user sees which stage and may retry. A failed analysis does not count against the daily limit.                                                  |

### 4.11 History

| ID       | Requirement                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-HIST-1 | History lists the user's analyses, newest first: title, document type, jurisdiction, date, grade, status.                                          |
| F-HIST-2 | The user can open any analysis and delete any analysis whose run is not going on. Delete removes the report, rules, scenarios and the source file. |
| F-HIST-3 | Source files are removed automatically 7 days after upload. Reports stay until deleted; the clause quotes inside them remain.                      |

### 4.12 Landing page

| ID       | Requirement                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------- |
| F-LAND-1 | Explains the product in one screen: the problem, the four steps, a sample trap.                          |
| F-LAND-2 | One primary action: "Check a document", leading to sign-in.                                              |
| F-LAND-3 | States the tuned document types, the countries with legal comparison, and the "not legal advice" notice. |

## 5. Screens

| Screen       | App       | Route                           | Content                                            |
| ------------ | --------- | ------------------------------- | -------------------------------------------------- |
| Landing      | web       | `/`                             | F-LAND                                             |
| Sign in      | dashboard | `/sign-in`                      | Google button, disclaimer link                     |
| New analysis | dashboard | `/`                             | Type and country, upload area, limits, notices     |
| Run          | dashboard | `/analyses/$id` (status ≠ done) | Confirm details, then stage tracker and live traps |
| Report       | dashboard | `/analyses/$id` (status = done) | Header, traps, in-your-favour list, unclear list   |
| Trap detail  | dashboard | `/analyses/$id/traps/$trapId`   | F-REP-3, F-REP-4                                   |
| Rules        | dashboard | `/analyses/$id/rules`           | F-RULE-4                                           |
| History      | dashboard | `/history`                      | F-HIST                                             |

## 6. Analysis states

```
uploaded ─► reading ─► awaiting_confirmation ─► extracting_rules ─► fuzzing
                │                                                     │
                ▼                                                     ▼
            rejected                                 running ─► comparing ─► done
                                 (any stage) ─► failed ─► (retry) ─► that stage
```

- `rejected`: not a policy or contract (F-READ-4).
- `failed`: technical failure; retry resumes from the failed stage with stored results.

## 7. Messages for error cases

| Case                             | Message intent                                                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File too large / too many pages  | State the limit, suggest uploading the main document only.                                                                                                            |
| Unsupported file type            | List accepted types.                                                                                                                                                  |
| Not a policy or contract         | "This doesn't look like a policy or contract. safely.ink checks documents that set out rights and obligations between you and another party."                         |
| Jurisdiction without law check   | Name the country (or say Global); say the scenarios still run and the legal comparison is skipped.                                                                    |
| Detected type or country differs | Name what the document reads like; offer one click to take it; keep the user's pick otherwise.                                                                        |
| Unreadable pages                 | List page numbers, offer to continue or re-upload.                                                                                                                    |
| Daily limit reached              | State the limit and the reset time.                                                                                                                                   |
| Legal lookup unavailable         | Report still completes; legal findings show "law lookup unavailable — try again later", and the report offers "Check the law again", which looks up only those rules. |
| Stage failure                    | Name the stage, offer retry.                                                                                                                                          |

## 8. Acceptance criteria (demo-level)

On 2026-10-18 nobody had walked these criteria end to end on the deployed build. The walk-through
is open in issue #16. Criterion 4 covers the three countries v1.0.1 checks.

1. **Happy path.** Given a real 20–40 page Indonesian insurance policy PDF, when the user
   uploads it and confirms the details, then within 150 seconds a report appears with a
   grade, at least 20 scenarios tested, and at least one trap that shows a clause quote
   with page number and a law citation with a working link to an official source.
2. **Determinism.** Re-running the evaluator on a stored analysis gives identical outcomes
   and amounts for every scenario.
3. **No orphan evidence.** In any report, every rule links to a clause that exists in the
   document, every rule condition uses only facts in the fact schema, and every displayed
   citation quote appears in the stored page text.
4. **Three countries.** One real document each from ID, SG and AU produces a report with at
   least one legal finding that has a verified citation.
5. **Six packs.** One real document each for insurance, loan, employment, NDA, lease and
   terms and conditions completes without `failed` and produces at least one trap a human reviewer agrees with.
6. **General pack.** A document of another kind (for example a gym membership agreement)
   completes and is labelled "general analysis".
7. **The role changes the result.** The same NDA analysed once as the disclosing party and once as the
   receiving party produces different traps.
8. **Photos.** Ten phone photos of a printed document produce a report; an intentionally
   blurred page is reported by number.
9. **Rejection.** Uploading a restaurant receipt ends in `rejected` with the message above.
10. **Privacy.** User B cannot open user A's analysis by URL, and cannot read A's file.
11. **Delete.** After delete, the analysis, its sub-records and the stored file are gone.
12. **Live.** During a run, stage changes and new traps show without a page reload.

## 9. Out of scope

Not in v1.0.1: brochure comparison, two-document comparison, chat, legal comparison outside
Indonesia, Singapore and Australia, report text in Indonesian, public share links and payments.
The [roadmap](./ROADMAP.md) orders what comes next.
