# G1/G2 founder controls and deliverables

HEAD broadcast: PRD v1.3.0 / ADR-017 makes app-trigger CREAO primary by founder request; account realtime is optional. Read docs/requests/HEAD.md for current integration notices.

Work as a headless OpenCode worker in `/Users/DV/LA-Hacks-2026`. HEAD owns integration.

WRITE: `apps/web/src/ui/**`, `apps/web/src/styles/**`, `docs/status/oc-hud.md`, `docs/requests/oc-hud.md` only.
READ: `docs/PRD.md` §§6 E01/E02/E06/E07/E08/E09, 8.6–8.7, 10, 17; store/bridge/contracts; current review-ui report.

Extend the existing parchment HUD to complete G1/G2: validated idea intake, three example chips and start action; editable approval plan with disabled-task dependency cascade and confirmation; founder questions; status/log/errors; selectable agent inspector with status/task/latest20events/payroll and redirect; deliverables shelf and research/site/launch/brief viewers; final card with real site URL and QR. Preserve offline recording controls and native modal keyboard/focus behavior. Live actions use store methods only, are disabled in replay/history, and catch errors. QR must point to an actual public URL when configured, with an honest local-only fallback. Site preview uses a sandboxed iframe; research/copy is text, not HTML injection. For brief HTML rendering use safe text or an allowlist; never insert raw marked output unsanitized. Keep local fonts, identity/status token distinctions and repaired compact-grid columns. Label mock, recording and fallback provenance honestly. Org-chart, full scrubber enhancements, sound and cosmetic polish can wait for G3.

Use exact current store/bridge/contracts; no API calls from town/HUD except existing store/API data interfaces. No new deps or edits to data/bridge/App/root/engine/server. Do not read `.env`, modify git, create accounts, send messages or spend agent credits. Report missing APIs in your request file. HEAD performs browser QA.

Done: keyless mock run can be started/approved from UI, plan/viewers/QR render with real store state, replay is preserved, no inaccessible or dead controls, typecheck/build pass. Write concise status and finish.
