# safely.ink product requirements

|         |                                                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status  | Living document, revision 3                                                                                                                                                                            |
| Date    | 2026-10-18                                                                                                                                                                                             |
| Related | [Roadmap](./ROADMAP.md) · [FSD](./FSD.md) · [TSD](./TSD.md) · [Flow](./FLOW.md) · [Market](./research/2026-10-18-market-and-competitors.md) · [Literature](./research/2026-10-18-literature-review.md) |

Revision 2 was the plan for the AI Builder Cup 2026 build. It is kept at the `v1.0.1` tag
(`git show v1.0.1:docs/PRD.md`), and the history section at the end says what came of it.

## 1. Problem

People in Indonesia sign loan agreements, paylater terms, multifinance contracts and insurance
policies written by the other side, and most never read them. They find out what the document
says when a late fee doubles, a collector calls their family, or a claim is refused. Outstanding
online lending reached Rp106.94 trillion in August 2026, and the illegal-lending task force
recorded 21,249 complaints about illegal online loans in 2025. The figures and their sources are in the
[market document](./research/2026-10-18-market-and-competitors.md).

A summary of the document does not help much. It says what the document says. The user needs to
know where it hurts them, whether the law allows it, how it compares with another offer, and what
to do next.

## 2. Product

safely.ink helps people in Indonesia test how an agreement affects them before and after they
sign, compare their choices, and take reliable evidence into a clarification, a complaint or a
consultation.

The method is fuzzing, borrowed from software testing. Gemini turns the wording into typed rules,
generates tricky but realistic scenarios, and a deterministic engine runs each scenario through
the rules. Every outcome where the user ends up worse off than a reasonable person expects, or
worse off than Indonesian law allows, becomes a finding with the clause and the scenario behind it, and the law passage
when the lookup finds one.

## 3. Users

| Persona                     | Situation                                                                                              | What they need                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| The signer (primary)        | Comparing a multifinance, instalment, paylater or loan offer, or about to sign one                     | "What happens if I pay late, repay early or cancel, and which offer costs me less when things go wrong?" |
| The one in trouble          | Already bound, and something has happened: a fee, a collection call, a refused claim                   | "Is this allowed, which clause decides it, and who do I complain to?"                                    |
| The helper                  | A family member, a paralegal at an LBH, or a consumer group volunteer asked "is this okay?"            | A cited report and an evidence packet they can stand behind                                              |
| The remediation buyer (B2B) | A product or legal team at a licensed provider that wants its own standard terms tested before release | Findings and suggested fixes for their drafts, with no say over what consumers see                       |

## 4. Wedge

Consumer finance first, insurance second. The pre-signing path starts with multifinance and
planned instalment purchases, where people have time to compare, then paylater and online loans.
Online-loan users mostly arrive after something has gone wrong, so they come in through the
after-the-fact path. Insurance is framed as "which circumstances could stop payment". Employment
and rental agreements follow, then app terms and privacy policies.

Law checks cover Indonesia. Singapore and Australia keep the v1.0.1 search-based check without
maintenance.

The B2B line is a clause-testing and remediation workflow for one paid design partner. It is
never sold as proof of compliance with POJK 22/2023.

## 5. Scope

What v1.0.1 does is in the [roadmap](./ROADMAP.md#where-we-are-on-2026-10-18). The next work is
grouped in horizons there:

| Horizon             | What it adds                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 Trustworthy core | Engine and citation fixes, an Indonesian gold set and measured accuracy, durable runs, data protection, staging                                                                          |
| H2 Indonesian depth | A versioned legal corpus, a counsellor-style intake, consumer-finance packs, clause highlighting                                                                                         |
| H3 Act on findings  | Referral with an evidence packet, document comparison, after-the-fact help and complaint drafts, two-party analysis with graded and party-bias warnings, fast classifiers in shadow mode |
| H4 Reach            | Counsel review and public launch, the B2B design partner, a lawyer-reviewed rewording library, a published Indonesian benchmark                                                          |
| H5 Region           | Standard-contract regimes in Thailand and Vietnam                                                                                                                                        |

### Non-goals

- Acting as a lawyer, or letting a user believe a lawyer-client relationship exists.
- Certifying that a provider complies with any regulation.
- Contacting a provider, a regulator or a court for the user. The user reviews and sends
  everything.
- Public grades for named providers before counsel has reviewed publication.
- Letting anyone who pays us change what a consumer report says.
- Training models on user documents.
- Referral payments or sponsorships that are not disclosed, or that change a ranking.

## 6. Why this is not "chat with your PDF"

|             | Summariser or chat            | safely.ink                                                                                          |
| ----------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Output      | A description of the document | Failing scenarios against the document, with the clause behind each, and the law where it was found |
| Method      | One model reading             | Model extraction, deterministic rule execution, independent judgments                               |
| Repeatable  | No                            | The same rules and scenarios give the same outcomes                                                 |
| Explainable | "The model said so"           | A trace: which rule fired, on which fact, from which clause                                         |
| Grounding   | Model memory                  | Law text from official sources, quote-checked before it is shown                                    |

## 7. Measures

The north star is the number of evidence-backed decisions per month: a user confirms that a
supported finding shaped an offer choice, a question to the provider, a complaint or a
consultation, and a monthly sample is audited.

Three guardrails sit beside it:

| Guardrail               | What it counts                                                                       | Target                           |
| ----------------------- | ------------------------------------------------------------------------------------ | -------------------------------- |
| Material-error rate     | Reviewed reports with an unsupported consequential claim or a false reassurance      | Set after the first gold-set run |
| Safe-action rate        | Sampled complaints and referrals that went to the right channel with supported facts | Set after R11 ships              |
| Trust-boundary breaches | Sponsor influence on findings, or sharing without consent                            | Zero                             |

From R1, quality is measured on the gold set and published in `docs/eval.md`: extraction recall,
citation support, trap precision, false reassurance and abstention. The revision 2 targets (95%
of rules trace to a clause, 80% of traps confirmed, a report within 150 seconds) were never
measured, and they stay out of claims until R1 measures them. User satisfaction will be the in-app
rating on each report and each finding, which R1 adds.

## 8. Principles

1. Evidence or silence. No finding without a quoted clause, and no legal statement without a
   verified citation.
2. Code decides outcomes. Models read, propose and research.
3. Neutral voice. We describe what the wording does and never call a company dishonest.
4. Graded warnings. Each finding shows its legal status (likely void, open to dispute, lawful but
   harsh), the gap from what a reasonable person expects, and our confidence, separately.
5. Say whose interest it serves. Findings and suggested wording carry a party-bias indicator, and
   our own judge is tested for a lean toward the drafting party.
6. Ask when unsure. The product asks a question when an answer changes the result, and does not
   guess.
7. Plain language first, legal language one click away, in Indonesian and English.
8. Not legal advice. Said on the upload screen, the report and the landing page, and serious
   findings point to legal aid or the right complaint channel.
9. The user's document is theirs. Private by default, deletable, kept only as long as the
   retention schedule says, never used for training, and never shared without consent for that
   purpose.

## 9. Risks

| Risk                                                                          | Impact                                           | Mitigation                                                                                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complaint drafts or rewording count as legal services under the Advocates Law | Legal exposure                                   | Counsel reviews both before they ship. Templates over free text. Clear disclaimers and a referral path                                                   |
| Marketing claims run ahead of the product                                     | The FTC fined DoNotPay $193,000 in 2025 for this | No "AI lawyer" language, and accuracy claims only from published `docs/eval.md` figures                                                                  |
| A named provider objects to a report                                          | Defamation or ITE complaints                     | Neutral wording, evidence shown, no per-provider grades. MK 105/PUU-XXII/2024 limits ITE Pasal 27A to individuals, and counsel still reviews publication |
| False reassurance: a report misses a harmful clause                           | A user signs something that hurts them           | Coverage-aware grades (R0), unmodeled clauses shown, abstention measured in R1                                                                           |
| Contract text leaves Indonesia on each model call                             | A UU PDP transfer without a basis                | Counsel review against PP 33/2026, a DPIA, consent per purpose, masking before third-party classifiers                                                   |
| Search grounding keeps prompts for up to three days                           | Personal data held by a third party              | Law answers from our own corpus first (R5), Web Grounding for Enterprise if counsel asks                                                                 |
| No PSE registration with Komdigi                                              | The service is blocked in Indonesia              | Register before launch (R14), which needs the operator entity from R3                                                                                    |
| The judge model leans toward the drafting party or the state                  | Biased findings                                  | Mirrored scenarios with roles swapped, measured in R12                                                                                                   |
| Official legal sites block our fetches                                        | Missing law findings                             | Ingest statutes into the corpus from a host that is not blocked (R5)                                                                                     |
| Model spend runs past the budget                                              | Cost                                             | Cost per analysis logged, a budget-triggered pause and an instance cap (R2)                                                                              |

## 10. Open questions

1. The four questions for Indonesian counsel in the [roadmap](./ROADMAP.md#questions-for-indonesian-counsel).
2. Which legal entity operates safely.ink, for the privacy page and the PSE registration.
3. The monthly budget ceiling.
4. Pricing for consumers and for the B2B line. The market document lists the business models.

## 11. History

Revision 2 planned a five-day build for the AI Builder Cup 2026, judged on technical merit,
problem fit, innovation and design, with Gemini through ADK on Cloud Run and Firebase. The build
shipped as v1.0.1 with sign-in, upload, read and confirm, rules, fuzzing, the deterministic run,
the expectation judge, the legal lookup with quote checks, the report, history and delete, an
Indonesian and English interface, and the landing page. The legal lookup worked for Indonesia,
Singapore and Australia, and it found a source for 5 of 13 lookups in one live Indonesian run.
The accuracy targets were not measured. The FSD acceptance walk-through is open in issue #16.
