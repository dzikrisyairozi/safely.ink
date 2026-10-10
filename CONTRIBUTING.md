# Contributing to Policy Police

## Setup

Requires Node.js 22+ and pnpm 9.

```bash
git clone https://github.com/dzikrisyairozi/policy-police.git
cd policy-police
pnpm install
pnpm dev              # all apps; or dev:web, dev:api, dev:dashboard
```

## Layout

```text
apps/
  web/          Landing page (Next.js)
  dashboard/    Product app (Vite + React + TanStack Router)
  api/          Analysis service (TypeScript, Hono)
packages/
  api-types/    Zod schemas shared by api and dashboard
  ui/           Shared components (shadcn/ui)
  i18n/         i18next setup and shared locale files
  tailwind-config/  eslint-config/  typescript-config/
docs/           PRD, FSD, TSD, architecture decisions (adr/)
```

Read `docs/FSD.md` for what the product does and `docs/TSD.md` for how it is built before
changing behaviour.

## Before you push

```bash
pnpm type-check && pnpm lint && pnpm test
pnpm format:check
pnpm build            # after changing anything under packages/
```

The pre-push hook runs the first line. Do not bypass hooks with `--no-verify`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint:

```text
feat(api): add scenario fuzzer agent
fix(dashboard): keep upload order after removing a page
docs: record decision on law lookup
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`, `revert`.

## Pull requests

Branch from `staging` (`feat/…`, `fix/…`, `docs/…`), keep the change focused, and open the
PR against `staging`. `main` only receives release PRs from `staging`; CI (build,
type-check, lint, format check and tests) runs on those, so run the checks above locally
before a feature PR.

## Rules that are easy to break

- **A model call never decides a scenario outcome.** Outcomes come from the deterministic
  engine in `apps/api/src/engine`.
- **No legal citation is shown unless its quote was found in the fetched source text.**
- Types shared across apps are defined once, as Zod schemas in `packages/api-types`.
- Every UI string goes through i18n, with the same keys in the `en` and `id` locale files.
- Never commit secrets or real user documents. Evaluation documents stay on your machine.

## Dependencies

```bash
pnpm add <package> --filter=api        # one workspace
pnpm add -D <package> -w               # repo tooling
```

TypeScript is pinned below 7 and ESLint below 10; see `docs/adr/0001-toolchain-pins.md`.
