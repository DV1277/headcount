/** Runtime barrel: append-only log, typed run errors, storage helpers. */
export type {
  EventLog,
  EventLogBase,
  EventLogOptions,
  EventLogStream,
  EventLogSubscription,
} from './eventLog';
export {
  createEventLog,
  openEventLog,
} from './eventLog';
export type { EventEnvelope } from '@hc/contracts';
export {
  RunError,
  badRequest,
  conflict,
  notFound,
  invalidBody,
} from './errors';
export {
  isSafeRunId,
  runsRoot,
  runDir,
  eventsPath,
  artifactsDir,
  artifactPath,
} from './fs';
