# 2. Replace the Rust API with a TypeScript service on Google Cloud

## Status

Accepted

## Context

The repository started from a starter template whose backend was a Rust (Axum, SQLx,
PostgreSQL) API, with TypeScript types generated from Rust structs through `ts-rs`.

safely.ink is a pipeline of Gemini calls around a deterministic rule engine, built for
AI Builder Cup 2026. Three facts decided the backend:

- The hackathon requires Gemini or a Google agentic platform, and deployment on Cloud Run
  or Firebase.
- Google's Gen AI SDK and Agent Development Kit are published for TypeScript, Python, Go
  and Java. There is no official Rust SDK, so a Rust backend would hand-write the model
  client, structured output handling, tool calling and search grounding.
- The submission deadline was five days after the project started.

The product's data is also a poor fit for the template's relational setup: an analysis is
a tree of JSON documents (clauses, rules, scenarios, findings) that the browser needs to
watch live while the pipeline runs.

## Decision

- `apps/api` is a TypeScript service (Hono on Node), run directly with `tsx`, deployed as
  a container on Cloud Run.
- Shared types are Zod schemas in `@repo/api-types`. The same schema validates request
  bodies, constrains model output, and types Firestore documents and UI code. This
  replaces the `ts-rs` generation step.
- Persistence is Firestore and Cloud Storage. Authentication is Firebase Auth. PostgreSQL,
  SQLx and the `db:*` scripts are removed.
- The template's documentation app, Vercel configuration and SSH-based release workflow
  are removed. Deployment targets are Cloud Run and Firebase only.

## Consequences

- One language across the monorepo. A schema change is visible to the API and the
  dashboard in the same type-check.
- The outcome engine must stay free of I/O and model calls so that it remains testable and
  deterministic in a codebase where everything around it is asynchronous and model-driven.
- No compile step for the API means a slower cold start than a bundled build. Bundle with
  esbuild if Cloud Run cold starts become a problem.
- There is no release automation at the moment. A deploy workflow is added when the API
  is first deployed.
- Firestore ties the data layer to Google Cloud. That is acceptable for this project and
  required by its target.
