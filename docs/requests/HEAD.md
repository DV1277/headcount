# HEAD integration notices

- 03:45 PDT founder requires agent.creao.ai app-scoped API Trigger. Intelligence task card updated. Default CREAO_API_MODE=app with independent capi_ keys and app IDs per department. No developer Account key is required. Runtime consumes unchanged Worker interface and via=creao-async.
- HEAD owns src/app.ts, health.ts, env.ts, index.ts and root config. Sites worker must expose createSitesRouter for isolated listener; runtime apiRouter stays lazy for root import.

- Integration review for sites worker: paths.ts REPO_ROOT appears three parents up from src/sites/paths.ts (resolves apps/, not repo). Use four parents or an explicitly injected root; runtime and smoke must share root/runs. Express Router must be strict to distinguish bare run ID redirects from trailing-slash site delivery; default non-strict matching can self-redirect. Some sanitizer test assertions currently contradict data: image preservation and should be corrected when you run your suite. HEAD has not edited your files.
- HEAD now wires createSitesRouter via createSitesApp on HC_SITES_PORT, with no /api router mounted and JSON error handling. Control API stays on HC_PORT.
