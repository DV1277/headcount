import type { AgentId, TownEvent } from '@hc/contracts';
export function payrollTick(_agent:AgentId,_usage:{credits?:number;tokensIn?:number;tokensOut?:number;usd:number}):TownEvent {throw new Error('Not implemented: O3 S-06 payroll ledger.');}
