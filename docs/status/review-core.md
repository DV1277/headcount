# G-1 / G0 core review

Reviewed with GPT-6.1 Sol at high reasoning on 2026-10-18. Scope: PRD §§8–9 and 16–17; contracts, engine, fixture generation, replay/live data sources. This review does not claim later O1/O2 or live O3/O4 implementation complete.

## Corrected defects

- Live connection discarded the event prefix preceding its initial snapshot, so scrubbing before connection produced incomplete state. It now reads the snapshot-bounded prefix through the existing SSE endpoint before connecting at the snapshot sequence.
- Reconnect previously resumed SSE without fetching a snapshot. Reconnect now catches up from a fresh snapshot and complete prefix without cues; history views remain scrubbed while the head advances. Old EventSource callbacks and disposed retries cannot write into a new source.
- A delayed live connection or artifact request could overwrite a newly opened recording or pollute its artifact cache. Source generations now reject stale completions; live artifact responses also validate payload, run ID, and artifact ID. Existing live deliverables remain readable during history views.
- Replay pause and speed changes lost the elapsed fraction between timer ticks. The clock now accounts for that elapsed time at the previous speed, excludes paused wall time, and rejects NaN clock/speed input. Seeking remains cue-silent.
- Recorded SSE now rejects wrong-run envelopes, empty logs, missing run.created, duplicate run.created, sequence gaps, and backward times. The finite reader stops exactly at the captured snapshot sequence and cancels its stream.
- Approved plans retained tasks removed from the proposal. The reducer now projects exactly the approved task definitions.
- Invariant checks now reject forged completion artifacts, dispatch owner mismatches, missing dependency handoffs even when the producer has not yet been accepted, and handoff owner/dependency mismatches. Terminal non-retried failures count as terminal; revisions reopen tasks before finishing checks.
- Final fixtures now include all ordinary retry/revision/redirect task.started events, review-phase cues, and consistent via metadata for the CREAO async and Mayor cover examples. Golden-boba has separate Herald founder redirect and Maker Mayor revise paths, with parallel Maker/Herald work after Scout.

## Evidence

- `npm test`: 27 tests pass across six files, including regressions for reconnect/history, source disposal, stale snapshot/artifact completion, historical live deliverables, malformed/wrong-run/gapped SSE, bounded recording reads, pause/speed arithmetic, dependency handoffs, forged artifacts, plan replacement, and fixture canonical ordering/metadata.
- `npm run typecheck`: passes.
- `npm run smoke:foundation`: passes; golden-boba 91 events / 418.2 seconds / 5 artifacts / completed, failure-retry 27 events / 2 artifacts / failed, redirect 36 events / 4 artifacts / completed.
- All 27 semantic event variants occur across fixtures and validate with strict runtime schemas. All four full artifact payload variants validate.
- `npm run build`: passes. Vite retains its existing large Phaser bundle warning; this is a later optimization concern, not a G0 functional failure.

## Accepted scope limits

Live API execution, sponsor adapters, real agent runs, orchestration, publishing, and API smoke are later-gate typed stubs. They were not exercised or represented as working here. No sponsor calls or keys were used. Browser/visual evidence belongs to the separate scaffold/UI review; a successful build alone does not establish visual acceptance.
