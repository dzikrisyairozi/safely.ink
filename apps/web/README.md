# web

Policy Police landing page. Next.js App Router, Tailwind v4, `@repo/ui`, `@repo/i18n`.

```bash
pnpm dev:web          # http://localhost:3000
pnpm --filter web lint
pnpm --filter web type-check
pnpm --filter web build
```

## Environment

| Variable               | Purpose                                   | Default                 |
| ---------------------- | ----------------------------------------- | ----------------------- |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for metadata and Open Graph | `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL`  | Where "Check a document" sends the user   | `http://localhost:5174` |

Copy lives in `src/i18n/locales/{en,id}.json`. Required content is listed in
[`docs/FSD.md`](../../docs/FSD.md) section 4.12.
