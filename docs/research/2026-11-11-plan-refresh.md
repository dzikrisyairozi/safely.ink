# What changed the plan by November 2026

|         |                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| Status  | Dated note, read on 2026-11-11                                                                              |
| Updates | [Technical stack](./2026-10-18-technical-stack.md) · [Literature review](./2026-10-18-literature-review.md) |
| Related | [Roadmap](../ROADMAP.md) · [ADR 5](../adr/0005-jev-verification-cascade.md)                                 |

Seven findings change what we build or the order we build it in. Where this note disagrees with the October notes, this note is right.

## Sampling parameters are going away

Google's [troubleshooting guide](https://aistudio.google.com/docs/troubleshooting) says Gemini 4 and Gemini 3.6+ models ignore custom `temperature`, `top_p` and `top_k`, return deprecation warning headers, and "will return `400` errors in a future release". Our agents set `temperature: 0` on every call, and `gemini-3.8-flash` is one of those models.

Two things follow. The parameter comes out of the code now. And no document may say the model calls are deterministic, because they never were on these models. The repeatability claim in the PRD covers the engine: the same rules and scenarios give the same outcomes.

## Singapore processing covers different models than we planned

R3 moves model calls to Vertex AI in Singapore. The [data residency table](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency), read on 2026-11-11, has a column for Singapore (`asia-southeast1`) and none for Jakarta. Of the current Gemini models, these are marked for Singapore:

| Model                    | Singapore ML processing            | Role today |
| ------------------------ | ---------------------------------- | ---------- |
| `gemini-4-argon`         | Yes                                | None       |
| `gemini-3.5-flash`       | Yes                                | None       |
| `gemini-2.5-flash`       | Yes                                | None       |
| `gemini-3.8-flash`       | No (US, EU, Canada and Japan only) | Flash role |
| `gemini-3.1-pro-preview` | Not listed                         | Pro role   |

The table gives a residency guarantee for the models it lists, and neither model we use today is among those for Singapore. The Singapore move is therefore also a model change: `gemini-4-argon` for the Pro role and `gemini-3.5-flash` for the Flash role. A model change needs an evaluation, so that move now depends on the R1 smoke set, and the exact models, regional endpoint and features each caller uses are confirmed on Vertex first, including the direct `GoogleGenAI` page reader. The [Argon guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-4-argon) lists `LOW`, `MEDIUM` and `HIGH` thinking levels and returns HTTP 400 for `thinking_budget`, `MINIMAL`, `candidate_count` and the penalty parameters. It supports structured output and Google Search grounding.

## Prices move on dated steps

The [pricing page](https://aistudio.google.com/docs/pricing) lists these standard prices per 1M tokens:

| Model                                               | Input             | Output              | Cached input       | Change          |
| --------------------------------------------------- | ----------------- | ------------------- | ------------------ | --------------- |
| `gemini-4-argon`                                    | $2.00, then $4.00 | $10.00, then $20.00 | $0.10, then $0.20  | From 2026-12-01 |
| `gemini-3.8-flash`                                  | $0.75, then $1.50 | $3.75, then $7.50   | $0.075, then $0.15 | From 2027-01-01 |
| `gemini-3.1-pro-preview`, prompts up to 200k tokens | $2.00             | $12.00              | $0.20              | None listed     |

Search grounding on Gemini 3 and later has 5,000 free requests a month across those models, then $14 per 1,000, with a cap of 1,500 a day. R0 widened the law check from the rules that decided a bad outcome to every rule that can go against the user, so search volume per analysis grew. `searches` and `tokenCostUsd` on each analysis measure it. The dated table in `config.ts` already holds the Flash change.

## Where the law is a number, code can apply it

OJK's [SEOJK 19/SEOJK.06/2025](https://www.ojk.go.id/id/regulasi/Documents/Pages/SEOJK-19-SEOJK06-2025-Penyelenggaraan-LPBBTI/SEOJK%2019-SEOJK06-2025%20Penyelenggaraan%20Layanan%20Pendanaan%20Bersama%20Berbasis%20Teknologi%20Informasi.pdf), signed on 31 July 2025, replaced 19/SEOJK.06/2023 and took effect that day. Section XIV sets daily ceilings on the economic benefit of an online loan. Section XIV item 4 sets the same figures for late fees:

| Funding type | Amount             | Tenor          | Daily ceiling |
| ------------ | ------------------ | -------------- | ------------- |
| Consumptive  | Any                | Up to 6 months | 0.3%          |
| Consumptive  | Any                | Over 6 months  | 0.2%          |
| Productive   | Up to Rp50,000,000 | Up to 6 months | 0.275%        |
| Productive   | Up to Rp50,000,000 | Over 6 months  | 0.1%          |
| Productive   | Over Rp50,000,000  | Any            | 0.1%          |

Item 5 caps all economic benefit and late fees at 100% of the funding amount. Section XIII limits consumptive repayments to 30% of the borrower's income from 2026.

The comparison is arithmetic, and the facts around it are legal judgments. Getting the inputs wrong produces a confident false result, so R7 builds it this way:

- A dated table holds the ceilings and the passage each comes from, reviewed by counsel.
- A model reads each charge and its source from the agreement. Code classifies charges under XIV.2 (interest, margin, profit share, administration, commission, platform fees and equivalent ujrah count, while late fees, qualifying certified electronic signature costs and tax do not).
- The calculation uses the funding amount named in the provision, and states its day count, the tenor boundary and every assumption. Economic benefit and late fees are checked separately, and together against the 100% limit in item 5.
- The check first establishes that the product is regulated lending under this circular, and that the agreement's date is covered. Section XXI item 4 keeps agreements signed before the circular in force until they end, and item 5 requires any later amendment to meet the circular. So the check needs the signing date and the amendment dates and terms, and missing amendment information gives `indeterminate` where it changes the answer.
- The result is a calculation with its assumptions, and `indeterminate` when a required fact is missing. `conflicts` is reserved for a reviewed rule whose applicability and facts are established. A pass means this one check passed.

Sharia products need margin and ujrah counted, and XIV.6 treats their late penalties as benevolent funds, which is a separate check. The income limit in Section XIII covers payments across creditors, so one uploaded agreement cannot establish compliance with it, and the product does not claim to. The roadmap's October reference to SEOJK 19/2023 is out of date.

## Finding a real citation is the easy part

Recent work separates a citation that exists from one that is right.

[LegalCiteTrust](https://arxiv.org/abs/2607.20872) scores existence, fidelity and applicability separately, on Chinese legal research reports, and says a citation "can be risky even when it points to a real source". [L-MARS](https://arxiv.org/abs/2509.00761) reports strict citation F1 of 0.13 for naive retrieval and 0.25 with a multi-turn judge on 100 bar exam questions, and retrieve-then-draft pipelines near 0.75 on 50 search questions. [ClaimRAG-LAW](https://arxiv.org/abs/2605.21071) scores legal RAG claim by claim, in French and English, for expert and non-expert users.

Our quote check covers existence only. `docs/eval.md` will report the three separately, and ADR 5 adds a verification layer for the other two. Low F1 can come from low recall, so these results argue for measuring citation quality, and do not show that most resolving citations are wrong.

## Tests that need no annotators

[CLAUSE](https://aclanthology.org/2026.findings-eacl.305.pdf) produces over 7,500 perturbed contracts from CUAD and ContractNLI in 10 anomaly categories and reports that models often miss subtle errors and struggle more to justify them legally. The method needs no labels of its own: change a clause in a known way and check that the output changes.

R1's gold set waits on legal annotators. Perturbation tests can start now on public Indonesian agreements, with limits on what they prove. Each edit states its expected relation:

- Amounts, extraction and engine outcomes are checked by code: a changed figure must appear in the rules and change the computed outcome.
- Assertions about legal status need a reviewed expectation, because raising a fee may keep it under a ceiling and shortening a notice may not matter when another provision sets a minimum.
- Irrelevant edits and legally equivalent paraphrases must leave the findings unchanged, so a model that invents a finding for every edit fails.
- Role swaps count as a bias test only where the swap leaves the applicable law the same.
- Each case runs several times, because the models are stochastic, and the set defines the variation it accepts.

These are regression tests and do not replace the gold set.

[LegalOn's 2026 benchmark](https://www.artificiallawyer.com/2026/06/22/what-legal-ai-benchmarks-reveal-that-model-names-dont/), a sponsored vendor article, argues that general models find the right topic and miss the legal standard, and that provision-level checks tied to a guideline matter as much as the model. Our packs are the natural place for those guidelines. We hold the claim as a hypothesis to test on our gold set. [ContractEval](https://arxiv.org/abs/2508.03080) adds a laziness measure, how often a model answers "no related clause", which is close to our false-reassurance guardrail.

## Data protection has a date

[PP 33/2026](https://pro.hukumonline.com/a/lt6a97c3fe4527c/pemerintah-akhirnya-terbitkan-kerangka-implementasi-pelindungan-data-pribadi--berlaku-mulai-16-januari-2027) takes effect on 16 January 2027. It covers objections to automated processing, compensation, impact assessments, data protection officers and cross-border transfers. [Kompas](https://www.kompas.id/artikel/peraturan-pelaksana-uu-pdp-akhirnya-terbit-lembaga-pengawas-masih-dinanti) reported that the supervisory institution had not been named when the regulation appeared. Searches on 2026-11-11 found no OJK rule that applies PP 33/2026 to online lenders.

Our findings are generated automatically, so the provision on objecting to automated processing goes to counsel as a new question. We read the official text before encoding any obligation or deadline from it.
