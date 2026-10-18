# Saved CREAO agents

The founder chose the app platform, `agent.creao.ai`, and app-scoped API Trigger. No developer Account key is required. The existing `capi_` key authenticated read-only run-list requests for all three saved apps (HTTP 200); StepFun `/models` returned HTTP 200 and listed `step-5-preview`.

| Department | Saved app | Verified ID |
|---|---|---|
| Scout (Rio) | [Open Scout](https://agent.creao.ai/apps/dabe17eb-3f2c-40d9-bc8c-662f8736ddc1) | `dabe17eb-3f2c-40d9-bc8c-662f8736ddc1` |
| Maker (Juno) | [Open Maker](https://agent.creao.ai/apps/2430f36c-51b1-484e-9025-8cb37837f0d9) | `2430f36c-51b1-484e-9025-8cb37837f0d9` |
| Herald (Pip) | [Open Herald](https://agent.creao.ai/apps/bc76ea75-e5c8-4b83-a8b2-ff8722009881) | `bc76ea75-e5c8-4b83-a8b2-ff8722009881` |

All three are Active team agents, use Lite by default, and have no schedules or private connectors. Maker and Herald were created from the repository's instruction files through the CREAO UI. Their canonical JSON/form fields and output-schema guardrails were inspected. Stored instructions are generated SKILL.md content, so literal byte-for-byte identity with the source is not claimed.

Root `.env` now selects `CREAO_API_MODE=app` and contains the three `CREAO_<ROLE>_APP_ID` values. The existing trigger key remains in its original variable; adapters must use the explicitly selected app path and permit per-role key overrides. No key value appears in this report. Live health returns `ok:true`, StepFun `ok`, CREAO `ok`, and no missing/configuration fields. These checks are read-only authentication/readiness evidence, not successful execution evidence.

The app trigger uses POST `{inputs}` and polling. Status events must remain honest: it cannot emit the search/tool telemetry available in optional Account realtime mode. Reference: [CREAO API Trigger](https://docs.creao.ai/pro/api-trigger).

Remaining G2 proof: execute the real approved DAG through the app adapter; validate payloads and actual reported credits; publish the sanitized landing page through the sites-only listener/tunnel; verify QR on a phone. No real business-agent run has been started at this point.

UI evidence: [Scout](img/CREAO-scout-setup.jpg), [Maker](img/CREAO-maker-setup.jpg), [Herald](img/CREAO-herald-setup.jpg).
