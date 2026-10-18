import type { EventEnvelope, TownEvent } from '@hc/contracts';
export interface EventLog {append(event:TownEvent):Promise<EventEnvelope>;read(from?:number):EventEnvelope[];}
export function createEventLog(_runId:string):EventLog {throw new Error('Not implemented: O3 S-01 append-only event log.');}
