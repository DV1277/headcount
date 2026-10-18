import type { AgentId, BuildingId } from '@hc/contracts';
export type BridgeEvents = {
  select: {agent:AgentId|null}; openArtifact: {artifactId:string}; focusBuilding: {building:BuildingId};
};
const listeners: {[K in keyof BridgeEvents]: Set<(value:BridgeEvents[K])=>void>} = {
  select:new Set(),openArtifact:new Set(),focusBuilding:new Set(),
};
export const bridge = {
  on<K extends keyof BridgeEvents>(key:K, fn:(payload:BridgeEvents[K])=>void):()=>void {
    (listeners[key] as Set<typeof fn>).add(fn); return () => {(listeners[key] as Set<typeof fn>).delete(fn);};
  },
  emit<K extends keyof BridgeEvents>(key:K,payload:BridgeEvents[K]):void {
    for (const fn of listeners[key]) (fn as (value:BridgeEvents[K])=>void)(payload);
  },
};
let positions:(()=>Record<AgentId,{x:number;y:number}>)|null=null;
export function provideSimPositions(provider:()=>Record<AgentId,{x:number;y:number}>):void {positions=provider;}
export function getSimPositions():Record<AgentId,{x:number;y:number}>|null {return positions?.()??null;}
