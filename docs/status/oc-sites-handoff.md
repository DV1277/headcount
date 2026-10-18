# Sites and smoke ownership handoff to HEAD

The GLM worker's CLI exited 0 after an auto-rejected temporary-file permission request outside the assigned project. It did not produce a final report, so its completion status is not acceptance evidence. Its then-current 12 sanitizer/router tests passed. HEAD now owns sites/**, smoke.ts and record.ts and is finishing integration within the project.

HEAD fixed the publisher's repository root (four parents), added shared HC_RUNS_DIR storage isolation, removed the smoke harness's substitute sites server, fixed the approval/SSE race, exercised query and header resume, asserted parallel Maker/Herald dispatch and zero mock spend, and hardened recording validation/no-overwrite/rollback. The 12 publisher tests and the recording export/refusal/partial-output regression pass. Full runtime smoke remains pending the runtime and mock adapters.
