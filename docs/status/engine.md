# Engine + fixtures status

**Owner:** HEAD · **Requirements:** §8.1–8.5, §16.1–16.2, K-02–K-04

- Implemented pure `initialState`, `reduce`, `deriveCues`, `statusLine`, plus `checkInvariants` for smoke/replay checks.
- Added golden-boba, failure-retry and redirect replay fixtures, artifacts, and self-contained site HTML. All external market references and output copy are explicitly illustrative fixture data.
- Golden replay has 87 events over 6m58s. After Scout is accepted, both Maker and Herald receive Scout handoffs and dispatch independently; the log includes founder Q/A, tool/progress/say updates, review revision, founder redirect, payroll and brief.
- Failure replay demonstrates retry, async dispatch, a correctly ordered initial Maker attempt followed by Mayor cover, skip, then terminal run failure during brief preparation. Redirect replay marks the optional Herald task disabled at approval.
- Validation: fixture generation passes under Node; engine fixture/schema/invariant tests pass (9 tests), and workspace typecheck passes.
