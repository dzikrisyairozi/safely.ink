# 3. Run agents on Google ADK for TypeScript, with our own fan-out and a two-step search

## Status

Accepted

## Context

TSD section 13, question 1, left open whether the pipeline's agents run on Google's Agent
Development Kit or on plain `@google/genai` calls. A two-hour spike on 2026-10-13 answered
it with `@google/adk` 2.2.1 against the Gemini Developer API, model `gemini-3.8-flash`.

What the spike measured:

| Question                                  | Result                                                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package and maturity                      | `@google/adk`, Apache-2.0, first release 2025-10, 1.0 in 2026-04, 2.0 in 2026-08, 26 releases. Pulls in `@google/genai`.                                         |
| Structured output                         | `LlmAgent` takes a Zod schema as `outputSchema`; with `outputKey` the parsed object lands in session state. Three of three outputs passed our schema.            |
| Parallel sub-agents                       | `ParallelAgent` with three sub-agents sent three requests at once and finished in 4.7 s. It logs that it is deprecated in favour of `Workflow`.                  |
| Google Search tool with structured output | Does not work. `GOOGLE_SEARCH` plus `outputSchema` returned an empty final response in 0.4 s, with no error.                                                     |
| Same combination on the raw API           | The request is accepted and returns JSON, but the response carries no `groundingMetadata`: no search queries and no source URLs, so nothing proves a search ran. |
| Google Search tool alone                  | Works in ADK and on the raw API; grounding chunks with source hosts are returned.                                                                                |
| Cost of the dependency                    | 24 direct dependencies (OpenTelemetry, MikroORM, winston, Vertex AI SDK), 118 packages and 137 MB installed.                                                     |

The hackathon asks for Gemini or a Google agentic platform. ADK is the agentic platform;
plain SDK calls would meet the rule only through Gemini.

## Decision

- Agents are ADK `LlmAgent`s, each wrapped in one exported function per agent
  (`readDocument()`, `extractRules()`, and so on) that takes and returns types from
  `@repo/api-types`. Nothing outside `apps/api/src/agents` imports `@google/adk`.
- Every agent that returns data uses `outputSchema` with the shared Zod schema.
- **Search and structure are two calls.** The LegalResearcher first runs a search-only
  agent and reads the source URLs from the grounding metadata, then our code fetches and
  verifies the page (TSD 5.6 steps 2 and 3). No agent combines `GOOGLE_SEARCH` with
  `outputSchema`.
- **Fan-out is ours.** ScenarioFuzzer, ExpectationJudge and LegalResearcher batches run
  as plain concurrent calls to the agent functions with a concurrency limit, in
  `pipeline.ts`. We do not build on `ParallelAgent` (deprecated) or on `Workflow` (new,
  and not needed for a fixed linear pipeline).
- Model IDs stay in `config.ts`: `gemini-3.1-pro-preview` for the Pro tier and
  `gemini-3.8-flash` for the Flash tier. `gemini-2.5-pro` is closed to new API keys, and
  no generally available Pro model is offered to this key.

## Consequences

- The agentic-platform requirement is met without giving ADK control of the pipeline's
  order, which stays readable in one file and testable with stubbed agent functions.
- If ADK blocks us, the fallback is cheap: an agent function is reimplemented with
  `@google/genai` and its signature does not change.
- The API image grows by roughly 137 MB of dependencies, and cold start gets slower.
  The existing note about bundling with esbuild applies sooner.
- The Pro tier runs on a preview model. Its ID can be withdrawn; `config.ts` is the one
  place to change it.
- The empty response from search plus schema is silent. An agent function must treat an
  empty final response as a failure, not as an empty result.
