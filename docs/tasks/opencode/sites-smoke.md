# G1/G2 site publishing and end-to-end gate tools

HEAD broadcast: PRD v1.3.0 / ADR-017 makes app-trigger CREAO primary by founder request; account realtime is optional. Read docs/requests/HEAD.md for current integration notices.

Headless OpenCode worker in `/Users/DV/LA-Hacks-2026`. HEAD owns root server wiring, env, package scripts, tunnel and real paid calls.

WRITE: `apps/server/src/sites/**`, `scripts/smoke.ts`, `scripts/record.ts`, `docs/status/oc-sites.md`, `docs/requests/oc-sites.md` only.
READ: PRD §§6 E07/E10, 7.4, 8.7, 9, 11, 16–17; contracts/engine, current server stubs and foundation smoke.

Implement S-05, S-08 and recording support needed to review G1/G2. Keep `publishSite(runId,site):Promise<string>` and add/export `createSitesRouter()` for HEAD to mount on a separate sites-only Express listener. Validate safe IDs and ≤120KB HTML, explicit sanitize-html allowlist from HC-N-021, preserve inline style, remove scripts/on*/iframes/unsafe URLs and emit exact restrictive CSP + security headers. Write `runs/<id>/site/index.html` atomically and derive URL from PUBLIC_BASE_URL or localhost:HC_SITES_PORT; serve only the /sites path and never control APIs or arbitrary files. Test script/eventhandler/javascript/style-edge/path-traversal payloads and preserved mailto/GoogleFonts document structure.

Implement `npm run smoke` script using ONLY HC_MAYOR=mock HC_WORKERS=mock HC_MOCK_SPEED=10. Start an isolated child server on an available test port, wait for health, create idea, assert no dispatch before approval, approve, read SSE to run.completed in<30sec, fetch artifacts and published site, run engine invariants. Stop every child/listener in finally. Do not edit root server files; they are being integrated concurrently. Smoke should give explicit failures, not false positives or real paid API calls. Implement record as a local copy of a completed run's log/artifacts/site to an explicitly provided fixture name, validate inputs and avoid overwriting existing fixtures by default.

No dependencies or changes outside owned files, no git operations, no `.env` reading, no cloud tunnel launch or external API calls. Runtime/API implementation is another worker; use frozen public HTTP contracts, report any needed export/API via request file. Done when meaningful site tests pass, smoke is runnable once runtime lands, typecheck green; status with exact exports and checks, then finish.
