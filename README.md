# safely.ink

**A fuzzer for the fine print.** Upload an insurance policy, loan agreement, employment
contract, NDA or lease. safely.ink turns the wording into executable rules, generates
dozens of tricky but realistic scenarios, runs them through those rules, and shows every
case where you end up worse off than a reasonable person would expect, or worse off than
the law allows.

It is an information tool, not legal advice.

> Built for [AI Builder Cup 2026](https://aibuildercup.com/) (Google Cloud, JAPAC), theme
> BFSI. Status: repository scaffold; the analysis pipeline is under construction.

## How it works

```
1. Read       Gemini reads the PDF or page photos and splits it into clauses
2. Rules      Clauses become typed rules over a fact schema derived from the document
3. Fuzz       20–40 edge-case scenarios aimed at those rules
4. Run        A deterministic engine (plain TypeScript, no model) decides each outcome
5. Compare    against what a reasonable person expects, and against the law,
              with citations checked word for word against the official source
```

The model reads, proposes and researches. It never decides an outcome, and no legal
citation is shown unless its quote is found in the source text.

Full detail: [PRD](./docs/PRD.md) · [FSD](./docs/FSD.md) · [TSD](./docs/TSD.md) ·
[decisions](./docs/adr) · [runbook](./docs/runbook.md)

## Repository

```
apps/
  web/          Landing page            Next.js 16, React 19          :3000
  api/          Analysis service        TypeScript, Hono              :3001
  dashboard/    Product app             Vite, React, TanStack Router  :5174
packages/
  api-types/    Zod schemas shared by api and dashboard
  ui/           shadcn/ui components
  i18n/         i18next setup (English, Indonesian)
  tailwind-config/  typescript-config/
docs/           PRD, FSD, TSD, architecture decision records
```

Target platform: Gemini through Google ADK, API on Cloud Run, front ends on Firebase,
data in Firestore and Cloud Storage.

## Getting started

Requires Node.js 22+ and pnpm 9.

```bash
pnpm install
pnpm dev              # everything
pnpm dev:web          # http://localhost:3000
pnpm dev:api          # http://localhost:3001  (GET /health)
pnpm dev:dashboard    # http://localhost:5174
```

The dashboard's sign-in is currently a mock that accepts any email and password.

## Commands

```bash
pnpm build            # build all workspaces
pnpm type-check       # TypeScript
pnpm lint             # ESLint
pnpm test             # Vitest
pnpm format           # Prettier write
pnpm check-all        # type-check + lint + format:check
```

Run `pnpm type-check && pnpm lint && pnpm test` before pushing; the pre-push hook does the
same. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Origin

The repository was started from the author's own open-source Turborepo starter template,
which supplied build tooling, the shared UI package and an empty dashboard shell. The
template's Rust API, documentation site and demo screens were removed. All safely.ink
product code is written for this project.

## License

[MIT](./LICENSE)
