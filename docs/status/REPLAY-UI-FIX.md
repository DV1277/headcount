# Replay animation and text fixes — October 18, 2026

## Causes and changes

- At 20×, ambient glow, alert and envelope cycles ran in roughly 6–30 ms, while speech could disappear in 160 ms. Decorative cycles now use wall time or steady states at high replay speed. Short transitions have minimum visible durations; bubbles remain readable for at least 1.8 seconds. The semantic replay clock still runs at the selected speed.
- Lighting transitions could overlap and write different tint values. A new progress transition cancels the previous one.
- Seek/restart left counter tweens, puff shapes and delayed callbacks alive. Snapshot restoration now cancels scene tweens, clears tracked shapes/effects, resets camera effects and fences callbacks by generation. The generation guard also covers Phaser timers still pending insertion during the same frame.
- Revised artifacts cancel their old pop/stamp tweens before removal. Duplicate accepted stamps do not restart their animation. Fast replay has no stamp camera shake or scaling overshoot.
- Bubbles no longer stack for the same agent, fight entrance/exit alpha tweens, or sit over the resident sprite. They use a bounded position above the speaker. Celebratory jumps wait until an agent's movement queue settles.
- Notice-board and hover labels fit measured font widths and line limits. The board title initializes correctly when the scene loads halfway through a recording.
- Plan titles get their own grid row with natural height. Mobile plan headers stack metadata beneath the heading instead of squeezing the title into a narrow column. Long viewer text, tables, URLs, stats and footer actions wrap within their containers.
- The compact header fits its controls and retains accessible labels. The mobile org chart uses readable stacked nodes and a handoff list; the desktop graph remains intact. Compact shelf actions retain labels and icons.

## Verification

- Typecheck passes.
- 197 tests pass in 27 files, including new regression coverage for effect replacement, seek cleanup, pending timer fencing, speaker deduplication, minimum visual timing and measured text fitting.
- Production build passes (existing large Phaser chunk warning remains).
- Real CREAO recording completed at 20× in the browser; restart/play/seek-to-end completed with no application errors.
- Checked plan layout at 1280×800 and 390×844. DOM measurements found no horizontal text overflow in the tested plan/final-card content. Mobile org container scroll width equals its 390px viewport. One town canvas is present.
- Restored the browser's normal viewport and left the completed demo open.

Screenshots: `img/replay-plan-desktop-fixed.jpg`, `img/replay-plan-mobile-fixed.jpg`, `img/replay-mobile-org-fixed.jpg`, `img/replay-final-fixed.jpg`.
