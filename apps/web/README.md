# web

safely.ink landing site and blog: Next.js App Router, Tailwind v4, `@repo/ui`,
`@repo/i18n`, framer-motion, React Three Fiber, Remotion, MDX.

```bash
pnpm dev:web                      # http://localhost:3000
pnpm --filter web lint
pnpm --filter web type-check
pnpm --filter web test            # Vitest: locales, routing, SEO, blog
pnpm --filter web build
pnpm --filter web reel:studio     # edit the showreel in Remotion Studio
pnpm --filter web reel:render     # public/reel/showreel-{en,id}.mp4
pnpm --filter web reel:stills     # public/reel/poster-{en,id}-{wide,tall}.jpg
pnpm --filter @repo/ui brand:icons  # favicons and app icons from the pangolin paths
```

## Environment

| Variable                       | Purpose                                                    | Default                 |
| ------------------------------ | ---------------------------------------------------------- | ----------------------- |
| `NEXT_PUBLIC_SITE_URL`         | Canonical URL for metadata, sitemap and Open Graph         | `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL`          | Where "Check a document" sends the user                    | `http://localhost:5174` |
| `NEXT_PUBLIC_GA_ID`            | Google Analytics 4; loads only after consent, off if empty | empty                   |
| `NEXT_PUBLIC_GSC_VERIFICATION` | Search Console HTML-tag token, if DNS is not used          | empty                   |

## Layout

- `src/app/[locale]/` holds every page. English is served at unprefixed URLs and
  Indonesian under `/id`; `src/proxy.ts` rewrites and redirects (see its comment).
- UI copy is in `src/i18n/locales/{en,id}.json`; server components use `getT(locale)`,
  client components `useTranslation('web')`. The parity test fails on a missing key.
- Articles: `content/blog/posts.ts` lists them, `content/blog/<locale>/<slug>.mdx` holds
  the text. How it works, Privacy and Terms are in `content/pages/<locale>/`.
- SEO helpers (metadata, JSON-LD) are in `src/lib/seo.tsx`; `llms.txt` and
  `llms-full.txt` are built by `src/lib/llms.ts`.
- The showreel composition is in `src/remotion/`; the page plays it live with
  `@remotion/player`, and the CLI renders the MP4s and posters committed in `public/reel/`.

Required content is listed in [`docs/FSD.md`](../../docs/FSD.md) section 4.12.
