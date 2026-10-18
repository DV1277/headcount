// packages/contracts/src/roster.ts
export const DEPARTMENTS = ['scout', 'maker', 'herald'] as const;      // + 'ledger' if HC-F-044
export type DeptId = typeof DEPARTMENTS[number];
export type AgentId = 'mayor' | DeptId | 'founder';
export type BuildingId = 'hall' | 'library' | 'workshop' | 'post' | 'home' | 'plaza';

export const ROSTER: Record<AgentId, {
  name: string; role: string; building: BuildingId; color: string; initials: string;
  platform: 'stepfun' | 'creao' | 'human';
}> = {
  mayor:   { name: 'Mayor Mabel', role: 'Chief of Staff', building: 'hall',     color: '#F2B544', initials: 'MM', platform: 'stepfun' },
  scout:   { name: 'Rio',         role: 'Research',       building: 'library',  color: '#3FB8AF', initials: 'RI', platform: 'creao' },
  maker:   { name: 'Juno',        role: 'Product & Web',  building: 'workshop', color: '#FF6B5A', initials: 'JU', platform: 'creao' },
  herald:  { name: 'Pip',         role: 'Marketing',      building: 'post',     color: '#8C6CF2', initials: 'PI', platform: 'creao' },
  founder: { name: 'You',         role: 'Founder',        building: 'home',     color: '#F6EFE1', initials: 'ME', platform: 'human' },
};
