# fixtures/agent-outputs

Deterministic payloads for the mock Mayor/workers (`HC_MAYOR=mock`, `HC_WORKERS=mock`):

- `scout.json` — ResearchPayload (Scout/Rio)
- `maker.json` — SitePayload (Maker/Juno); `__SITE_URL__` is substituted per run
- `herald.json` — LaunchKitPayload (Herald/Pip); `__SITE_URL__` substituted per run

Live golden-idea outputs (AC-11.1, PRD §11.6) are saved here by `scripts/try-mayor.ts` /
`scripts/try-creao.ts` as `mayor-plan-<i>.json`, `creao-scout-<i>.json`, etc. Those files are
recorded evidence, not mock inputs — the mock adapters only read the three JSON files above.
