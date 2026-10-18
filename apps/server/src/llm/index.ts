import type { Usage } from '../mayor';
export type Completion={message:{role:string;content:string};usage:Usage};
export function chatRaw(_messages:{role:string;content:string}[]):Promise<Completion> {throw new Error('Not implemented: O4 A-02 StepFun typed wrapper.');}
