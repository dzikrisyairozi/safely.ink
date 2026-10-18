# Who else reads contracts for people, and where safely.ink fits

|         |                                                                                   |
| ------- | --------------------------------------------------------------------------------- |
| Date    | 2026-10-18                                                                        |
| Scope   | Competitors, Indonesian market figures, niches, business models, risks            |
| Method  | Web search and reading of official and press pages on the date above              |
| Related | [Literature review](./2026-10-18-literature-review.md) · [Roadmap](../ROADMAP.md) |

Figures carry the date of their source. Pricing for foreign products comes from third-party
listings and changes often, so it is left out except where it explains a business model.

## The gap

Searches on 2026-10-18 found no product, in Indonesia or elsewhere, that tests a consumer
agreement against realistic scenarios from the signer's side before signing. Existing products
fall into three groups.

Enterprise contract review is for lawyers and checks a contract against the company's own
playbook. Harvey, Spellbook, LegalOn, Luminance, Ironclad and Kira are here. LegalOn closed a
$50M Series E in July 2025 and says a quarter of Japanese listed companies use it
([press release](https://www.legalontech.com/press-releases/legalon-closes-50-million-series-e-led-by-goldman-sachs)).
Robin AI was listed for a distressed sale in late 2025 after a failed round
([Legal IT Insider](https://legaltechnology.com/robin-ai-listed-for-distressed-sale-nine-months-after-making-the-sunday-times-100-tech-list/)),
which shows how fast undifferentiated contract review turns into a commodity.

Consumer summarisers explain what a document says. Docusign's AI summary for signers
([TechRadar](https://www.techradar.com/pro/docusign-wants-to-use-ai-to-turn-your-complex-contracts-into-plain-english))
is the clearest case, and the sender can switch it off. A summary controlled by the party that
wrote the contract is a conflict of interest that safely.ink must not copy. ToS;DR grades popular
terms of service by hand and has no Indonesian coverage.

After-the-fact helpers act once harm has happened. Claimable
([launch, 2024-10-02](https://www.globenewswire.com/news-release/2024/10/02/2956879/0/en/Claimable-Launches-First-Ever-AI-Powered-Appeals-Platform-to-Fight-Unjust-Healthcare-Denials.html))
and Counterforce Health ([Axios, 2025-08-20](https://www.axios.com/local/raleigh/2025/08/20/using-ai-to-fight-back-against-insurance-denials-counteforce))
draft appeals against denied US health claims. None of them warns a buyer before purchase.

DoNotPay sits apart as the cautionary case. It sold itself as a robot lawyer, and the FTC's 2025
order banned that claim without evidence
([FTC](https://www.ftc.gov/news-events/news/press-releases/2025/02/ftc-finalizes-order-donotpay-prohibits-deceptive-ai-lawyer-claims-imposes-monetary-relief-requires)).

## Indonesian players

| Player                                | What it does                                                                                                                                                                                                                                                                                    | Relation to safely.ink                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Hukumonline AIlex                     | Legal research AI for professionals over statutes and decisions. "AIlex for Good" gave free access to legal aid groups and Peradi branches ([Hukumonline](https://www.hukumonline.com/berita/a/hukumonline-bagikan-akses-ai-gratis-pada-10-lembaga-di-program-ailex-for-good-lt6a203aadbb848/)) | The likeliest fast follower. It has the legal content, the brand and a channel into LBH offices    |
| Hukumonline Klinik Hukum              | Free articles answering legal questions, including klausula baku in leasing                                                                                                                                                                                                                     | Strong search presence in Bahasa Indonesia                                                         |
| Justika                               | Lawyer marketplace, owned by Hukumonline, seed round from East Ventures ([East Ventures](https://east.vc/news/press-release/justika-raises-seed-funding-from-east-ventures-expanding-public-access-to-legal-services-in-indonesia))                                                             | A referral destination for paid help                                                               |
| Privy                                 | E-signature and digital identity, $48M Series C led by KKR in 2022 ([DealStreetAsia](https://media.dealstreetasia.com/stories/privy-raises-48m-in-kkr-led-series-c-316226))                                                                                                                     | A possible "check before you sign" partner, if the signer keeps access whatever the sender prefers |
| pasal.id / Aturio                     | Regulation API and MCP server at article level ([API](https://pasal.id/en/api))                                                                                                                                                                                                                 | A data supplier for the law corpus, licence to be checked                                          |
| LegalReview.Pro                       | AI contract audit against Indonesian law ([listing](https://www.hunted.space/product/legalreview-pro))                                                                                                                                                                                          | The closest direct competitor, with no visible traction                                            |
| Kontrak Hukum, Smartlegal.id, Easybiz | Legal services for businesses                                                                                                                                                                                                                                                                   | Different buyer                                                                                    |

OJK and AFPI already offer a check for whether a lender is licensed. Nobody tells the borrower
whether the contract terms are fair. That is the opening.

## The Indonesian market in numbers

| Figure                              | Value                                                                                                                | Source                                                                                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Online lending (pindar) outstanding | Rp106.94 trillion in August 2026, up 22.07% year on year                                                             | [Bisnis, 2026-10-09](https://finansial.bisnis.com/read/20261009/563/2011301/kredit-macet-pinjol-naik-473-ojk-soroti-kemampuan-bayar-borrower)           |
| Pindar 90-day default rate (TWP90)  | 4.73% in August 2026, up from 4.32% in July. 16 lenders above the 5% ceiling                                         | Same source                                                                                                                                             |
| Borrower accounts                   | 158.37 million cumulative accounts by June 2025 (cumulative, so not active borrowers)                                | [CNBC Indonesia](https://www.cnbcindonesia.com/research/20250919113526-128-668450/rekening-pinjaman-online-ri-tembus-158-juta-setengah-jumlah-penduduk) |
| OJK complaints in 2025              | 56,620 complaints through APPK, with online lending dominant                                                         | [Kontan](https://keuangan.kontan.co.id/news/ojk-terima-56620-pengaduan-konsumen-sepanjang-2025-pinjol-ilegal-dominan)                                   |
| OJK complaints, first half of 2025  | 20,115 in total: fintech 7,697, banking 7,457, multifinance 4,046, insurance 648                                     | [Media Asuransi](https://mediaasuransinews.co.id/keuangan/ojk-terima-20-115-pengaduan-nasabah-termasuk-648-di-sektor-asuransi/)                         |
| Illegal lending in 2025             | Satgas PASTI stopped 2,263 illegal lenders and received 26,220 complaints, 21,249 of them about illegal online loans | [Bisnis, 2026-01-12](https://finansial.bisnis.com/read/20260112/563/1943665/ojk-hentikan-2263-pinjaman-online-pinjol-ilegal-pada-2025)                  |
| OJK market-conduct enforcement      | 144 administrative sanctions and about Rp6.57 billion in fines by November 2025                                      | [Warta Ekonomi](https://wartaekonomi.co.id/read593560/ojk-tindak-tegas-pujk-denda-market-conduct-tembus-rp658-miliar-per-november-2025)                 |
| YLKI complaints in 2025             | 1,977, with financial services first                                                                                 | [Kontan](https://industri.kontan.co.id/news/ylki-terima-1977-pengaduan-konsumen-sepanjang-2025)                                                         |
| BPKN complaints                     | Financial services lead across 2023 to 2025                                                                          | [detikFinance](https://finance.detik.com/berita-ekonomi-bisnis/d-8263403/warga-ri-sering-tertipu-di-sektor-keuangan-hingga-konser)                      |
| Insurance penetration               | About 3% of GDP, below Singapore                                                                                     | [detikFinance](https://finance.detik.com/moneter/d-7988629/penetrasi-asuransi-di-ri-masih-lesu-kalah-dari-singapura)                                    |

Two cautions apply. Complaint volume measures harm. It does not measure whether people would
review terms before borrowing. Outstanding loans measure lending, which is not the size of a
software market. The first product experiments have to test the behaviour directly.

The rule that turns this into a legal problem is POJK 22/2023 on consumer
protection in financial services ([text on pasal.id](https://pasal.id/peraturan/pojk/peraturan-ojk-no-22-tahun-2023)).
It allows standard-form agreements and bans exoneration clauses in them, for example a clause that
shifts the provider's liability to the consumer. OJK also publishes a self-assessment instrument
for providers that maps these duties to articles
([SEOJK 18/SEOJK.08/2024](https://www.ojk.go.id/id/regulasi/Documents/Pages/SEOJK-18-SEOJK08-2024-Penilaian-Sendiri-Terhadap-Pemenuhan-Ketentuan-Pelindungan-Konsumen-dan-Masyarakat-di-SJK/SEOJK%2018-SEOJK.08-2024%20Penilaian%20Sendiri%20Terhadap%20Pemenuhan%20Ketentuan%20Pelindungan%20Konsumen%20dan%20Masyarakat%20di%20Sektor%20Jasa%20Keuangan.pdf)).

## Neighbouring markets

Singapore's Academy of Law and IMDA launched GPT-Legal search on LawNet in September 2025, tuned
first for contract law and aimed at lawyers
([IMDA](https://www.imda.gov.sg/resources/press-releases-factsheets-and-speeches/factsheets/2025/imda-and-sal-launched-ai-powered-search-engine-in-lawnet)).
Vietnam passed a dedicated AI law in December 2025, effective 2026-03-01
([Tilleke & Gibbins](https://www.tilleke.com/insights/dna-how-the-use-of-artificial-intelligence-is-regulated-in-southeast-asia/21/)).
Thailand prescribes standard consumer contracts by sector, a regime close enough to Indonesia's
klausula baku rules that the same engine could carry over. Searches found no consumer-side
contract stress tester in any of these markets.

## Niches, ranked

1. Consumer finance before signing: multifinance and planned instalment purchases first, then
   paylater and online loans. The harm is arithmetic (late fees, penalties, default cascades),
   which is what executable rules and scenarios handle well. POJK 22/2023 gives a legal yardstick.
2. Online loans after signing. Most pinjol harm shows up after the money arrives, through fees and
   collection. The after-the-fact mode with complaint routing serves these users.
3. Insurance before purchase, phrased as "which circumstances could stop payment". Exclusions,
   waiting periods and claim procedures fit scenario testing. "Will they deny this claim" promises
   knowledge we do not have.
4. Clause testing for financial providers. Their compliance teams have budget and OJK sanctions
   give them a reason to spend it.
5. Employment and rental. High frequency and real harm, and less willingness to pay.
6. App terms and privacy policies under UU PDP. Good for attention, weak for revenue.

## Business models

| Model                                                            | Buyer                                 | Assessment                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Free consumer scan with a paid detailed report or complaint pack | Individuals                           | Builds reach and data. Price per report, since willingness to pay is low                           |
| Clause testing and remediation workflow                          | Lenders, multifinance firms, insurers | The most likely revenue. Sold to one paid design partner first, never as a "compliant" certificate |
| Sponsored access through legal aid and consumer groups           | LBH, YLKI, donors                     | Credibility and labelled cases. Hukumonline's programme shows the model and the competition        |
| Distribution inside a signing flow                               | Privy and similar                     | Only if the signer keeps access regardless of the sender                                           |
| Regulator tool for supervisory review of standard clauses        | OJK                                   | Slow procurement. A long-term option                                                               |

Selling to the party that drafts the contract changes the trust contract with consumers. Three
rules hold regardless of who pays: a paying provider cannot change or hide findings in a report
a consumer asked for, consumer documents are never shared with a provider without specific
consent, and any referral payment or sponsorship is disclosed and has no effect on rankings.

## Risks

| Risk                             | What could happen                                                            | Response                                                                                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Practising law without a licence | A complaint draft or rewording is treated as legal service                   | Counsel reviews each workflow before launch. Information and referral first                                                                                                                     |
| Claims beyond evidence           | The DoNotPay outcome                                                         | Publish the evaluation method and results. No "AI lawyer" language                                                                                                                              |
| Defamation                       | A named company objects to a report                                          | Reports are private by default. Public comparisons only after counsel review, with source dates and a right of reply. Pasal 27A of the ITE Law excludes corporations after MK 105/PUU-XXII/2024 |
| False reassurance                | A user signs because no trap was found                                       | Show coverage and confidence. Withhold a good grade when coverage is incomplete                                                                                                                 |
| Personal data                    | Contracts contain personal and financial data, and model calls cross borders | Consent, minimisation, retention limits and a Jakarta bucket                                                                                                                                    |
| A fast follower                  | Hukumonline adds a similar check                                             | Compete on tested scenarios, versioned evidence and hand-offs. Competing on legal content plays to its strength                                                                                 |
| Model dependency                 | Gemini changes or invents a citation                                         | The deterministic engine and quote checks against a curated corpus                                                                                                                              |

## Decision

The wedge is consumer finance, entered before signing through multifinance and instalment
offers, and after signing through online-loan harm. Insurance is the second vertical. A general
tool for every document type is not the launch strategy. The full reasoning and the milestones
are in the [roadmap](../ROADMAP.md).
