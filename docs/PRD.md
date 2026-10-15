# safely.ink — Product Requirements Document (PRD)

|         |                                                                            |
| ------- | -------------------------------------------------------------------------- |
| Status  | Draft, revision 2                                                          |
| Date    | 2026-10-13                                                                 |
| Target  | AI Builder Cup 2026 (Google Cloud, JAPAC) — submission deadline 2026-10-18 |
| Theme   | BFSI: Intelligent Risk, Fraud & Financial Experiences                      |
| Related | [FSD](./FSD.md) · [TSD](./TSD.md)                                          |

## 1. Problem

Insurance policies, loan agreements, employment contracts, NDAs, leases and terms and
conditions are long, written by the other side's lawyers, and signed by people who do not
read them. The signer finds
out what the document really says on the worst day possible: when a claim is denied, a
penalty is charged, or a deposit is kept. Summarising the document does not solve this. A
summary tells you what the document says; it does not tell you where it breaks.

## 2. Product in one sentence

safely.ink is a **policy fuzzer**: upload a policy or contract and it turns the wording
into executable rules, generates dozens of tricky but realistic scenarios, runs them
through those rules, and shows every case where you end up worse off than a reasonable
person would expect — or worse off than the law allows.

The name of the technique comes from software testing. A fuzzer does not read code and
describe it; it attacks the code with edge cases until something breaks. We do the same to
a contract.

## 3. Users

| Persona                  | Situation                                                                                           | What they need                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **The signer** (primary) | About to sign, or just signed, a policy or contract. No legal background, no wish to read 40 pages. | "Tell me where this will bite me, in plain words, before I sign." |
| **The one in trouble**   | Already bound by the document and something has happened.                                           | "What happens to me now? Which clause decides it?"                |
| **The helper**           | Agent, broker, HR person, or family member who is asked "is this okay to sign?"                     | A cited report they can stand behind.                             |

Users are in JAPAC. The hackathon build checks the law of Indonesia, Singapore and
Australia; documents from other countries are still analysed, without the legal comparison.

## 4. Goals and non-goals

### Goals (hackathon build, P0)

1. A user can upload one document (PDF or page photos) and get a trap report in about two
   minutes, with progress visible while it runs.
2. Every trap is backed by the exact clause and, where the law is relevant, a citation to a
   real article or section with a link to the official source.
3. Works on any mainstream policy or contract. Six document types are tuned: insurance
   policy, loan / credit agreement, employment contract, NDA, rental lease, terms and
   conditions.
4. Legal comparison works for Indonesia, Singapore and Australia.
5. Signed-in users keep a history of their reports.
6. Meets every hackathon rule: Gemini models, agentic platform (ADK), deployed on Cloud
   Run and Firebase, public repo, English submission.

### Non-goals (hackathon build)

- Legal advice. The product is an information tool and says so.
- Drafting, redlining or negotiating documents.
- Contacting the other party, filing claims, or calling any company dishonest.
- Payments, teams, sharing permissions, mobile apps.

## 5. Scope

### P0 — must ship by 18 Oct

| #     | Capability                                                                                  |
| ----- | ------------------------------------------------------------------------------------------- |
| P0-1  | Google sign-in (Firebase Auth)                                                              |
| P0-2  | Upload PDF (text or scanned) or photos of pages                                             |
| P0-3  | Read: detect document type, parties, jurisdiction, language; split into clauses             |
| P0-4  | Confirm: user confirms document type, jurisdiction and **which party they are**             |
| P0-5  | Rules: derive the document's own fact schema, then a typed, machine-checkable rule set      |
| P0-6  | Fuzz: generate 20–40 edge-case scenarios                                                    |
| P0-7  | Run: evaluate every scenario against the rules with a deterministic engine                  |
| P0-8  | Compare A — reasonable person's expectation                                                 |
| P0-9  | Compare B — law and regulation (ID, SG, AU) through grounded search with verified citations |
| P0-10 | Report: overall grade and ranked trap list; each trap opens the source clause               |
| P0-11 | Live progress while the pipeline runs                                                       |
| P0-12 | History of past reports, with delete                                                        |
| P0-13 | Landing page that explains the product                                                      |

### Document packs

A pack is a set of prompt seeds for one document type: typical scenarios and what an
ordinary person expects. Packs are content, not code; the engine is the same for all.

| Pack                    | Example scenarios                                                           |
| ----------------------- | --------------------------------------------------------------------------- |
| Insurance policy        | Claim inside a waiting period, excluded contributing cause, late notice     |
| Loan / credit agreement | One late payment, early repayment, rate change, default and collateral      |
| Employment contract     | Resignation notice, non-compete, training-bond clawback, dismissal          |
| NDA                     | What counts as confidential, how long, penalty for an accidental disclosure |
| Rental lease            | Deposit forfeiture, early exit, repairs, rent increase                      |
| General (fallback)      | Any other policy or contract; report is labelled "general analysis"         |

### P1 — roadmap (in the deck, not in the build)

- Compare C — marketing brochure versus fine print.
- Compare D — two documents side by side on the same scenarios.
- "What if" chat that runs a user-described scenario through the same rule engine.
- More tuned packs: telco, purchase agreements.
- More JAPAC jurisdictions (Japan, India, Malaysia, Philippines, Thailand, Vietnam, …).
- Localised UI (the repo already carries Indonesian i18n scaffolding).
- Shareable public report links.

## 6. Why this is not "chat with your PDF"

|             | Summariser / chat           | safely.ink                                                                |
| ----------- | --------------------------- | ------------------------------------------------------------------------- |
| Output      | Description of the document | Failing test cases against the document                                   |
| Method      | One LLM reading             | LLM extraction → **deterministic** rule execution → independent judgments |
| Repeatable  | No                          | Yes: the same rules and scenarios always give the same outcomes           |
| Explainable | "The model said so"         | A trace: which rule fired, on which fact, from which clause               |
| Grounding   | Model memory                | Law text fetched from official sites, quote-verified before display       |

This is the innovation claim for the judges: Gen AI is used where it is strong (reading
messy legal prose, inventing adversarial scenarios, researching law) and kept away from
where it is weak (being the calculator that decides the outcome).

## 7. Hackathon alignment

| Criterion (weight)               | How we address it                                                                                                                                                                                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technical merit & Gen AI (40%)   | Multi-agent pipeline on Google ADK; Gemini multimodal document reading; structured output into a typed rule schema derived per document; Google Search grounding for law; deterministic evaluator; citation verification. Serverless on Cloud Run + Firebase, scales to zero. |
| Problem alignment & impact (25%) | The demo leads with insurance policies and loan agreements, both named in the BFSI theme. Being hurt by unread fine print is a mass-market problem across JAPAC, where financial and legal literacy is low and legal help is expensive.                                       |
| Innovation & creativity (25%)    | Fuzzing applied to contracts. Outcome is decided by code, not by the model. Law citations are checked against the source page.                                                                                                                                                |
| UX & solution design (10%)       | One upload, live progress, a grade and a ranked list. Plain language. Every statement one click from its evidence.                                                                                                                                                            |

Deck framing: **financial-document safety first, any contract next.** The same engine
reading employment contracts, NDAs and leases is shown as breadth, not as the pitch.

### Hard rules we must satisfy

- Gemini or Gemma models, or a Google agentic platform → Gemini + ADK.
- Deployed on Cloud Run or Firebase → API on Cloud Run; front ends on Firebase.
- Fresh project built in the hackathon window. The repo starts from the author's own
  public starter template (tooling and UI shell only); all product code is new. **This is
  disclosed in the deck and the README.**
- Deliverables: deployed link, public GitHub repo, demo video under 3 minutes, deck as PDF.
  All in English.

## 8. Success metrics

Hackathon build:

| Metric                                                              | Target                                 |
| ------------------------------------------------------------------- | -------------------------------------- |
| Time from upload to finished report (30-page document)              | ≤ 150 s                                |
| Rules that trace to a real clause (spot check)                      | ≥ 95%                                  |
| Law citations shown whose quote is found on the fetched source page | 100% (unverified ones are never shown) |
| Traps a human reviewer agrees are real, on 5 demo documents         | ≥ 80%                                  |
| A first-time user reaches a report without help                     | Yes, in the demo run                   |

Post-hackathon: reports per user, share of users who open at least one trap, return rate.

## 9. Product principles

1. **Evidence or silence.** No trap without a quoted clause. No legal statement without a
   verified citation.
2. **Neutral voice.** We describe what the wording does. We never call a company a scam.
3. **Plain language first, legal language one click away.**
4. **Not legal advice.** Stated on the upload screen, the report, and the landing page.
   High-severity traps point the user to a professional or the relevant regulator.
5. **The user's document is theirs.** Private by default, deletable, not used for training.

## 10. Risks

| Risk                                                          | Impact                 | Mitigation                                                                                                                                   |
| ------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Five days to deadline, wide scope                             | Scope is not finished  | P0 list is fixed; packs are prompt content, not code; cut order in section 11.                                                               |
| Any-document mode gives shallow results on unusual documents  | Weak report            | Six tuned packs carry the demo; fallback reports are labelled "general analysis"; clauses that cannot be modelled are listed, never dropped. |
| Model invents a rule or a law                                 | Wrong, harmful report  | Rules must reference clause IDs that exist; citation quotes are string-matched against the fetched page; unverifiable items are dropped.     |
| Search grounding misses the relevant article                  | Missing legal finding  | Reported as "no finding", never guessed. Verified findings are stored and reused, so coverage improves with use.                             |
| Official legal sites block or cannot be fetched               | Citations unverifiable | Day-1 spike per site; fallback is Gemini's URL context tool as the retriever, with the same quote check.                                     |
| Defamation / liability                                        | Legal exposure         | Neutral wording, disclaimer, evidence shown, no company ranking.                                                                             |
| Personal data inside uploaded documents                       | Privacy breach         | Owner-only access rules, source files auto-deleted after 7 days, user can delete everything.                                                 |
| "Fresh project" rule versus starter template                  | Disqualification       | Disclosed; template is generic tooling; ask organisers.                                                                                      |
| Submission form lists categories that do not match the themes | Wrong category         | Ask organisers before submitting.                                                                                                            |

## 11. Delivery plan

| Day | Date       | Outcome                                                                                                                                              |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Mon 13 Oct | Documents approved. Repo converted: Rust API and docs app removed, TypeScript API scaffolded, rebrand done. GCP and Firebase project created.        |
| 1   | Tue 14 Oct | Shared schemas. Deterministic evaluator with tests. Reader and rule-extractor agents working on one insurance policy. Spikes: ADK, legal-site fetch. |
| 2   | Wed 15 Oct | Scenario fuzzer and expectation judge. Sign-in, upload, confirm, live progress screen. First end-to-end run on Cloud Run.                            |
| 3   | Thu 16 Oct | Legal researcher: grounded search, page cache, citation verification. Report screen and history. Loan and employment packs.                          |
| 4   | Fri 17 Oct | NDA and lease packs. Three countries tested on real documents. Landing page. Limits, error states. **Feature freeze 18:00.**                         |
| 5   | Sat 18 Oct | Demo video, deck PDF, README, final deploy, submit with hours to spare.                                                                              |

Cut order if we fall behind: lease pack → NDA pack → Australia → history screen → landing
page polish. Never cut: the deterministic run, the expectation comparison, the insurance
and loan packs, one country of legal lookup, deployment on Google Cloud.

## 12. Open questions

1. Which hackathon submission "category" applies to a BFSI entry? (To ask organisers.)
2. Is the starter template acceptable under the "fresh project" rule? (To ask organisers; assumed yes, disclosed.)
3. Final product tagline and visual identity.
