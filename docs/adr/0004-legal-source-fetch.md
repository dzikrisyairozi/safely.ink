# 4. Fetch legal pages directly with browser-like headers; use URL context where the law is a PDF

## Status

Accepted

## Context

TSD section 13, question 2, asked whether the official legal sites can be fetched
server-side as plain HTML. The quote check (F-CMP) only works if we hold the text of the
page a citation points to.

A spike on 2026-10-13 sent one GET per allowlisted host from a developer machine in
Indonesia, with a 10-second timeout, following redirects, then stripped the HTML to text.
"Text" below is the character count after stripping.

| Jurisdiction | Host                  | Plain request                | With browser headers | Law text in the HTML                          |
| ------------ | --------------------- | ---------------------------- | -------------------- | --------------------------------------------- |
| ID           | `peraturan.go.id`     | 200                          | not needed           | No. Metadata page; the law is a PDF           |
| ID           | `peraturan.bpk.go.id` | 200                          | not needed           | No. Metadata page; the law is in a viewer     |
| ID           | `jdih.kemnaker.go.id` | 200                          | not needed           | Not checked beyond the home page              |
| ID           | `jdih.kemenkeu.go.id` | 200                          | not needed           | Not checked beyond the home page              |
| ID           | `ojk.go.id`           | 200                          | not needed           | Listing pages yes; regulations are PDFs       |
| ID           | `pasal.id`            | 200                          | not needed           | Search results yes; article pages not checked |
| SG           | `sso.agc.gov.sg`      | **403** from the CDN         | 200, 15,000 chars    | Yes                                           |
| SG           | `mas.gov.sg`          | 200 but a "maintenance" page | 200, 10,500 chars    | Yes                                           |
| SG           | `mom.gov.sg`          | 200                          | not needed           | Yes                                           |
| AU           | `legislation.gov.au`  | 200, 138,000 chars           | not needed           | Yes, the full Act                             |
| AU           | `asic.gov.au`         | 200 (redirects to `www.`)    | not needed           | Yes                                           |
| AU           | `fairwork.gov.au`     | 200                          | not needed           | Yes                                           |

"Browser headers" means a current Chrome `User-Agent` plus `Accept` and
`Accept-Language`. A custom `User-Agent` naming the project is what triggered the 403 and
the maintenance page.

Limits of the spike: one page per host, one run, from one network. Cloud Run addresses
may be treated differently from a home connection. `legislation.gov.au` returned 1.36 MB
of HTML for one Act, close to the 2 MB cap in the TSD.

## Decision

- `legal/fetch.ts` sends browser-like headers on every request and follows redirects,
  but only while the redirect target is still on the allowlist.
- The fetch size cap rises from 2 MB to 5 MB; a consolidated Australian Act does not fit
  comfortably under 2 MB.
- A response is unusable when the status is not 200, the content type is not HTML, or
  the stripped text is shorter than 1,000 characters. For an unusable response the
  retriever falls back to Gemini's URL context tool, stores the text it returns, and
  applies the same quote check.
- **Indonesia goes through the fallback by default for statutes**, because
  `peraturan.go.id`, `peraturan.bpk.go.id` and `ojk.go.id` publish the law as PDF, not as
  page text. A citation whose quote cannot be found in the retrieved text is dropped,
  as everywhere else.
- No host is removed from the allowlist. `jdih.*.go.id` stays a pattern; the two
  ministries tested answered normally.

## Consequences

- Singapore and Australia can be verified with our own fetch, which is the stronger
  evidence: we hold the page text ourselves.
- Indonesian citations depend on the URL context tool being able to read the PDF. If it
  cannot, Indonesian findings will show fewer citations, not wrong ones. Parsing the PDF
  ourselves is the upgrade path.
- Sending a browser `User-Agent` is a workaround for bot filters on public government
  pages. Requests stay low in volume, cached in `lawPages`, and limited to the allowlist.
- The first deploy must repeat this check from Cloud Run before the legal stage is built.

## Update, 2026-10-14 (M8)

A second spike, while the legal stage was built, changed the fallback for PDFs:

- The URL context tool mostly refused to copy Indonesian statutes (`finishReason:
RECITATION`, no text), and when it answered, it gave a partial copy with a preamble of
  its own. `ojk.go.id` turned away both our fetch and the tool with a firewall page that
  answers 200.
- Our own fetch got the official PDFs from `peraturan.bpk.go.id` directly. PDFs are
  now read in code with `unpdf` (MIT, no dependencies), so Indonesian citations are
  checked against the official file, like Singapore and Australia. `pasal.id` article
  pages are HTML and need nothing more.
- The URL context tool stays only for pages our fetch cannot use (a short or blocked
  page). Its text is kept only when the retrieval status is a success, and is stored
  with `via: 'url_context'`.
- There is no Blaze plan yet, so there is no Cloud Run deploy. The check from Cloud Run
  above is moved to M12 (#16); the legal stage was built and run from a developer
  machine.
