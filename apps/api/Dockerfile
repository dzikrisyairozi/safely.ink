# Build context is the repo root:
#   docker build -f apps/api/Dockerfile -t safely-ink-api .
FROM node:24-slim

RUN corepack enable
WORKDIR /app
COPY . .
# --ignore-scripts: the root prepare script runs husky, a dev dependency.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter api...

# The service runs TypeScript directly through tsx; there is no compile step.
# Bundle with esbuild if cold-start time becomes a problem.
ENV NODE_ENV=production
USER node
WORKDIR /app/apps/api
# Cloud Run sets PORT.
CMD ["node_modules/.bin/tsx", "src/index.ts"]
