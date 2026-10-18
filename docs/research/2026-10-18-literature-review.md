# Contract review for lay people: what the research says

|         |                                                                                             |
| ------- | ------------------------------------------------------------------------------------------- |
| Date    | 2026-10-18                                                                                  |
| Scope   | Unfair-clause detection, legal AI errors, Indonesian sources, practitioners, lay users      |
| Method  | Web search and reading of abstracts and official pages on the date above                    |
| Related | [Market and competitors](./2026-10-18-market-and-competitors.md) · [Roadmap](../ROADMAP.md) |

Every arXiv ID below was checked against its title on 2026-10-18. Most findings come from
abstracts, so a figure quoted here can differ from the final published version. Where only a
secondary write-up was available, the text says so.

## Detecting unfair clauses

CLAUDETTE ([arXiv 1805.01217](https://arxiv.org/abs/1805.01217), Lippi et al., later in
_Artificial Intelligence and Law_ in 2019) is the closest academic precedent for safely.ink. It
tags sentences in online terms of service as potentially unfair under EU consumer law. Its
categories are a ready-made checklist for consumer contracts: unilateral change, unilateral
termination, limitation of liability, jurisdiction, choice of law, arbitration, content removal
and consent by using the service. LexGLUE later packaged the data as the UNFAIR-ToS task
([ACL 2022](https://aclanthology.org/2022.acl-long.297)).

The same group built a corpus of 100 terms of service in four languages
([NLLP 2021](https://aclanthology.org/2021.nllp-1.1)) and tested ways to move labels between
languages ([_Artificial Intelligence and Law_, 2024](https://doi.org/10.1007/s10506-024-09398-7)).
Their result is good news for an Indonesian version: projecting or translating annotations often
works about as well as labelling a new corpus from scratch.

General chat models are weak at this job. Frasheri et al.
([arXiv 2409.00077](https://arxiv.org/abs/2409.00077)) asked 12 questions about popular
privacy policies, and the best model (GPT-4) did only slightly better than random. On
CLAUDETTE-ToS, a fully fine-tuned encoder gave the best balance of precision and recall, ahead
of zero-shot GPT-4o ([arXiv 2510.22531](https://arxiv.org/abs/2510.22531)). Wardas and Matthes
classified German employment clauses as valid, unfair or void
([arXiv 2507.01734](https://arxiv.org/abs/2507.01734)): examination guidelines helped recall on
void clauses, and the models still fell well short of lawyers.

For safely.ink this argues for the design it already has. A model proposes, and something
narrower checks. A model that flags everything is useless to a reader, and the papers show high
recall with poor precision is the normal failure.

## Contract benchmarks worth adapting

| Benchmark                                                                           | What it tests                                                                                   | Use for safely.ink                                                      |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [CUAD](https://arxiv.org/abs/2103.06268)                                            | 41 clause types in 510 commercial contracts, labelled by lawyers                                | Reader and clause extraction recall                                     |
| [ContractNLI](https://arxiv.org/abs/2110.01799)                                     | Whether an NDA entails, contradicts or does not mention a hypothesis, with evidence spans       | The shape of a scenario question, with "not mentioned" as a real answer |
| [UNFAIR-ToS](https://aclanthology.org/2022.acl-long.297)                            | Unfair-clause categories in terms of service                                                    | The category list for consumer findings                                 |
| [LEDGAR](https://aclanthology.org/2020.lrec-1.155)                                  | About 100,000 provisions with labels                                                            | Clause-type classification                                              |
| [MAUD](https://arxiv.org/abs/2301.00876), [ACORD](https://arxiv.org/abs/2501.06582) | Merger agreements, and clause retrieval for drafting                                            | Later, for the rewording library                                        |
| [LegalBench](https://arxiv.org/abs/2308.11462)                                      | 162 legal reasoning tasks                                                                       | Pick single tasks. An aggregate score says little about this product    |
| [LegalBench-RAG](https://arxiv.org/abs/2408.10343)                                  | Retrieval of the exact supporting span, 6,858 query-answer pairs                                | Retrieval evaluation for the law corpus                                 |
| [CLAUSE](https://arxiv.org/abs/2511.00340)                                          | More than 7,500 contracts from CUAD and ContractNLI with planted discrepancies in 10 categories | Stress tests for contradiction and omission detection                   |

ContractNLI deserves a note. Its authors found negation by exception hard, which is the exact
case where a contract grants something and then takes it back three pages later. That is the
case the fuzzer exists to catch.

CLAUSE is built from perturbations. It tells us whether a detector finds a planted defect. It
tells us nothing about how often real Indonesian contracts contain that defect, which only a
labelled set of real documents can answer.

No Indonesian dataset of unfair standard clauses (klausula baku) turned up in searches on
2026-10-18. Building one is the largest gap in this area and a result worth publishing.

## Legal AI gets facts wrong, and retrieval alone does not fix it

Dahl et al. ([arXiv 2401.01301](https://arxiv.org/abs/2401.01301)) asked models specific,
checkable questions about US federal cases. Hallucination rates ran from 58% (GPT-4) to 88%
(Llama 2). The models also tended to accept a user's wrong legal premise, and they could not
tell when they were wrong. The authors write that the risk is highest for people without a
lawyer, who are safely.ink's users.

Magesh et al. ([arXiv 2405.20362](https://arxiv.org/abs/2405.20362)) ran the first
preregistered test of commercial legal research tools sold as hallucination-free. Lexis+ AI and
two Thomson Reuters tools hallucinated between 17% and 33% of the time. Retrieval helped
compared with GPT-4 alone. It did not make the problem go away.

The CiteGuard-RAG paper ([arXiv 2609.15830](https://arxiv.org/abs/2609.15830)) shows where the
gain comes from. With a validation step between retrieval and the answer, grounded-answer
accuracy was 98.3% on its controlled set. Removing validation made accuracy fall sharply while
retrieval accuracy stayed the same. safely.ink already has a validation step of this kind
(`apps/api/src/legal/verify.ts`), and it is the part of the legal pipeline to strengthen first.

Two faults in that step came out of the code review for this document. A legal assessment keeps
its status as long as one quote survives, even if the quote that carried the conclusion failed
(`verify.ts:66`). Checks should run per claim, and the status should be reassessed against only
the quotes that survived. A quote can also be found on the page and still not support the
claim. That second check is a natural job for a small classifier (see "Fast classifiers").

## Retrieval for Indonesian law

Indonesian legislation has a fixed hierarchy: Undang-Undang, then Bab, Pasal, Ayat and huruf. A
thesis at UGM chunked by that hierarchy and used hybrid dense and sparse retrieval with
reciprocal rank fusion. A Universitas Indonesia paper on labour regulations compared answers at
the four levels. Both are small studies. They agree with what the general literature suggests:
retrieve at Ayat or huruf level, and always attach the parent Pasal, the definitions and the
Penjelasan, because a list item cut from its opening sentence can say the opposite of what the
law says.

Exact identifiers are where pure vector search fails. A query for "Pasal 18 ayat (1) huruf a"
needs lexical matching. A hybrid of BM25 and dense vectors is the usual default for statutes, as
in a four-arm study on Ontario tenancy law ([arXiv 2606.20359](https://arxiv.org/abs/2606.20359)).
Reranking is a separate question. CLERC ([arXiv 2406.17186](https://arxiv.org/abs/2406.17186))
found that zero-shot retrieval models reach only 48.3% recall at 1,000 on case law, so domain
fit is a real problem. We will measure a reranker on our own queries before adding it.

For embeddings, BGE-M3 ([model card](https://huggingface.co/BAAI/bge-m3)) supports dense and
sparse retrieval and 8,192-token inputs. SEA-BED ([arXiv 2508.12243](https://arxiv.org/abs/2508.12243))
compares embedding models on Southeast Asian languages and puts multilingual-e5 and BGE-M3 close
together. Neither result is about Indonesian law, so the plan is to test Gemini embeddings
against BGE-M3 on a few hundred of our own statute queries.

Law changes. Cipta Kerja amended dozens of statutes, and Constitutional Court decisions change
how provisions read (for employment, MK 168/PUU-XXI/2023). Citing a superseded Pasal is a
serious error that a version-aware corpus can catch. De Martim's ontology-driven Graph RAG for
legal norms ([arXiv 2505.00039](https://arxiv.org/abs/2505.00039)) separates the abstract
provision from its dated versions and treats amendments as events. That design fits our need
better than GraphRAG-style community detection, which invents structure the law already has.

Primary law is free to use. UU 28/2014 on copyright, Pasal 42, puts statutes and court decisions
outside copyright ([official text](https://peraturan.go.id/files/uu28-2014bt.pdf)). Two problems remain. `peraturan.bpk.go.id` answers Cloud Run with a 403 bot check (recorded in issue
#16), and the Supreme Court's decision directory has inconsistent anonymisation, so any decision
text we store needs our own personal-data scrubbing.

Sources we can draw on:

| Source                                                                     | What it has                                            | Notes                                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| peraturan.go.id                                                            | Official statute texts                                 | Serves Cloud Run, per #16                                                                   |
| peraturan.bpk.go.id (JDIH BPK)                                             | Regulations with metadata                              | Blocks Cloud Run. Ingest from another host                                                  |
| [pasal.id API](https://pasal.id/en/api)                                    | Regulations at article level, REST and MCP             | Full text needs an account. The MCP server is AGPL-3.0, so check terms before relying on it |
| [indo-law](https://github.com/ir-nlp-csui/indo-law)                        | About 22,630 Supreme Court criminal decisions in XML   | Research data from Universitas Indonesia                                                    |
| [ID_REG_DB_2511](https://huggingface.co/datasets/Azzindani/ID_REG_DB_2511) | A community SQLite dump of regulations with embeddings | Provenance and freshness unknown, so use it only for discovery                              |

## Indonesian language models

IndoNLU ([arXiv 2009.05387](https://arxiv.org/abs/2009.05387)) and IndoBERT are the standard
Indonesian NLP baselines. IndoCareer ([arXiv 2409.08564](https://arxiv.org/abs/2409.08564)) has
8,834 professional exam questions across six sectors including law and insurance, and models did
worst in the sectors with the most local context, insurance and finance among them. That is our
sector.

SEA-HELM ([arXiv 2502.14301](https://arxiv.org/abs/2502.14301)) evaluates Southeast Asian
models, SEA-LION is described in [IJCNLP-AACL 2025](https://aclanthology.org/2025.ijcnlp-long.30),
and Komodo-7B ([arXiv 2403.09362](https://arxiv.org/abs/2403.09362)) covers Indonesian and
regional languages. None of them reports results on legal tasks. KemenkeuGPT
([arXiv 2407.21459](https://arxiv.org/abs/2407.21459)), a RAG system over Ministry of Finance
data and regulations, moved accuracy from 35% to 61% with 73% RAGAS faithfulness. That is a
sober reference point for what Indonesian regulatory RAG reaches without a deterministic layer.

NitiBench ([arXiv 2502.10868](https://arxiv.org/abs/2502.10868)), a Thai legal QA benchmark, is
the closest regional template for an Indonesian one.

The model choice follows from this. A local model helps with fluency in Bahasa Indonesia, and
no published result shows it helps with legal correctness. We keep Gemini for reading and add a
local model only if our own benchmark shows a gain.

## What practitioners say

Lawyers use AI widely now. Clio's 2024 Legal Trends Report
([press release, 2024-10-07](https://www.clio.com/about/press/clio-latest-legal-trends-report/))
put AI use at 79% of legal professionals, up from 19% in 2023, with 70% of clients preferring or
indifferent to firms that use it.

Their fear is the silent error. Mata v. Avianca
([summary](https://en.wikipedia.org/wiki/Mata_v._Avianca,_Inc.)) ended in a sanction in 2023
after lawyers filed made-up citations and then stood by them when questioned. On Hacker News, a
lawyer wrote in 2023 that a client arrived with AI-suggested redlines and that every
recommendation was worse for the client ([thread](https://news.ycombinator.com/item?id=36422807)).
That is one anecdote. It is also the failure our rewording feature must never produce, which is
why every suggested change will say whose interest it serves.

Regulators punish claims that outrun evidence. The US Federal Trade Commission finalised an order
against DoNotPay on 2025-02-11
([FTC](https://www.ftc.gov/news-events/news/press-releases/2025/02/ftc-finalizes-order-donotpay-prohibits-deceptive-ai-lawyer-claims-imposes-monetary-relief-requires)):
$193,000 in relief, and a ban on saying the service performs like a real lawyer without evidence
to back it up. In New York, a court upheld limits on non-lawyer legal advice against Upsolve in
March 2026 ([report](https://reason.com/volokh/2026/03/08/court-upholds-new-yorks-limits-on-unauthorized-practice-of-law/printer/)).

Indonesia is more permissive. The Constitutional Court struck down Pasal 31 of the Advocates Law
in decision 006/PUU-II/2004, which had made it a crime for a non-advocate to act like one
([Hukumonline](https://www.hukumonline.com/berita/a/pasal-31-undangundang-advokat-dinyatakan-tidak-berlaku-hol11740/)).
Legal information from a non-advocate is defensible. Representation is not. Complaint drafting
and suggested rewording sit between the two, and Indonesian counsel should review both before
they ship.

Defamation risk is narrower than often assumed. In decision 105/PUU-XXII/2024, read on
2025-04-29, the Constitutional Court held that "orang lain" in Pasal 27A of the ITE Law means an
individual and excludes institutions and corporations
([MKRI](https://www.mkri.id/berita/-23133)). A company cannot use that article against a report
about its contract. Other rules can still apply, so publishing named product comparisons waits
for counsel.

Demand is concentrated in consumer finance. LBH Jakarta received 1,330 complaints about online
lenders in its first intake, according to
[Kontan](https://keuangan.kontan.co.id/news/terima-1330-pengaduan-lbh-jakarta-temukan-pelanggaran-dari-25-fintech-legal).
Complaint figures from OJK, YLKI and BPKN are in the
[market document](./2026-10-18-market-and-competitors.md).

## What lay users need from the interface

Lay people trust AI legal advice too much. In three experiments with 288 people, participants
were more willing to act on LLM advice than on a lawyer's when the source was hidden, even though
they could tell the two apart above chance
([arXiv 2409.07871](https://arxiv.org/abs/2409.07871), CHI 2025). The design problem is
over-reliance.

How we hedge changes behaviour. In a preregistered study of 404 people answering medical
questions, a first-person hedge ("I'm not sure, but...") lowered agreement with wrong answers and
raised accuracy, and an impersonal hedge had a weaker effect
([arXiv 2405.00623](https://arxiv.org/abs/2405.00623)). The domain was medicine, so the Bahasa
Indonesia wording needs its own test. Showing a confidence score calibrates trust, and on its own
it did not improve decisions ([arXiv 2001.02114](https://arxiv.org/abs/2001.02114)).

Intake research is the most direct guide for a counsellor-style flow. "Getting in the Door"
([arXiv 2410.03762](https://arxiv.org/abs/2410.03762)) used an LLM to sort legal-aid applicants
and to ask follow-up questions, with a hand-off to a human. FETCH
([arXiv 2509.07170](https://arxiv.org/abs/2509.07170)) classified 419 real referral queries and
generated clarifying questions as radio buttons and checkboxes. Margaret Hagan's work at Stanford
grounds quality standards for legal-help AI in what people with a real problem say they need
([Stanford Law](https://law.stanford.edu/publications/towards-human-centred-standards-for-legal-help-ai/)).

From these we take five rules for the product:

1. Ask structured questions before analysing: document type, signed or not, the user's role, the
   counterparty, amounts and dates, and how urgent it is.
2. Show three separate scales, never one blended score: the legal status (likely void, open to
   dispute, lawful but harsh), the gap from what a reasonable person expects, and how sure we
   are.
3. Hedge in the first person only where the doubt is real. Engine results are stated plainly.
4. Put the clause text next to the governing Pasal, and say what the report did not check.
5. End every finding with a next step: a question to ask, a complaint channel, or a referral.

## Fast classifiers next to the reasoning model

TypeSafe's Jev returns typed judgments and probabilities. It does not generate text. That fits
the parts of the pipeline where a yes or no with a probability is the whole answer, and where a
reasoning model costs more than it adds. The three questions worth testing first:

- Does this retrieved passage address the legal issue in the finding?
- Does this quote support, contradict or leave open this exact claim?
- Does this clause give one named party sole discretion?

It runs in shadow mode first, logged beside the current Gemini path and never shown to users,
and its thresholds are calibrated on our gold set with a Brier score. When it disagrees with
Gemini, the case goes up for review. Disagreement is a signal, and neither model wins by vote. A
single "one-sidedness score" is off the table. It would blend bargaining power, enforceability
and commercial context into one number that nobody can audit.

Jev is a third party that would see contract text. Under UU PDP that makes TypeSafe a data
processor, so sending real user documents to it waits for a processing agreement.

Judging with models has its own literature. "Judge, Retrieve, or Abstain"
([arXiv 2608.17994](https://arxiv.org/abs/2608.17994)) sets an uncertainty threshold on
human-labelled data so that the error rate on the cases a judge does decide stays under a chosen
limit, and abstains on the rest. Our expectation judge could do the same: abstain and show
"undetermined" when it is unsure.

## Graphs

Three graphs pay for themselves, and none needs a graph database. Typed rows in Postgres with
bounded traversal are enough.

1. Statute links: amends, repeals, implements, interprets, refers to. These stop us citing a
   superseded Pasal.
2. Contract cross-references: "subject to clause 12", definitions, overrides, attachments. These
   resolve exceptions and expose missing attachments.
3. Rule dependencies: which benefit an exclusion limits, which payment a deadline governs. These
   fix the engine fault where any benefit firing counts as the one the scenario targets
   (`apps/api/src/engine/evaluate.ts:104`).

A large automatic "legal knowledge graph" would add guessed relations before we have labels to
check them.

## Harm to both parties

The engine runs from one side today (`meta.userRole`). Running it twice with the roles swapped
would produce two fact schemas that do not line up. The better model is one shared set of
events, each scenario evaluated for both parties. Harm is often not zero-sum: a vague repair
clause can leave a tenant without repairs and a landlord with damage and a dispute.

Ambiguity becomes alternative readings. Where a clause can reasonably be read two ways, the
engine runs both and reports where the outcomes split, with the assumption each reading makes.
Contradictions are found by searching for a witness scenario in which two obligations cannot
both be met. Omissions are checked against a reviewed list of what each document type normally
contains, because a missing rule in our extraction does not prove a missing clause in the
document.

"Fallacies" is too loose a label for users or for code. The defects we can name and test are:
an undefined trigger, a circular definition, deadlines that cannot both be met, two clauses with
no rule for which wins, a procedure that cannot be completed, and a decision left to one party's
sole discretion.

Models have political leanings, and that reaches this product. The Wikipedia guide to AI writing
notes that frontier models lean toward authority on some prompts. Our judge could lean toward
the drafting party or toward the state in the same way. Mirrored scenarios with the roles
swapped will measure it.

## Open items

These were not confirmed in searches on 2026-10-18, and the roadmap carries them as tasks:

- The text and status of PP 33/2026 implementing UU PDP. One law-firm alert dates it 2026-07-16
  and says it takes effect on 2027-01-16.
- PostgreSQL ships an `indonesian` text search configuration. It was tried on 2026-10-18 on
  PostgreSQL 17, and the [technical stack note](./2026-10-18-technical-stack.md) has the result.
- Which Gemini models Vertex AI serves in asia-southeast1. On 2026-10-18 it served none in
  asia-southeast2.
- The terms of use for bulk reading of peraturan.go.id and pasal.id.

## Codex review of this direction

Codex (GPT-5 class, read-only) reviewed the architecture on 2026-10-18. We agree on the curated
corpus, typed relations in place of a graph database, Jev in shadow mode, the shared event model
and building evaluation before widening scope. It caught the four engine and citation faults
listed in the roadmap, and I confirmed each in the code.

We differ in two places. Codex prefers AlloyDB for the corpus, and I prefer to start on Cloud SQL
for PostgreSQL behind a retrieval interface, because the corpus is small and the team is small.
Codex also proposed dropping "fallacies" as a product category, and I agree and went further by
naming the six defects above.
