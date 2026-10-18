import type { ReactNode } from 'react';
import { ROSTER, type AgentId } from '@hc/contracts';
import { IconBang, IconCheck, IconHourglass } from './icons';
import type { PillMeta } from './lib';

/** Status pill: icon + word on a tinted ground. Agent colors never appear here (PRD §10.2). */
export function StatusPill({ meta, stamp = false }: { meta: PillMeta; stamp?: boolean }) {
  const icon = meta.icon === 'check' ? <IconCheck size={12} />
    : meta.icon === 'hourglass' ? <IconHourglass size={12} />
      : meta.icon === 'bang' ? <IconBang size={12} />
        : <span className={meta.icon === 'ring' ? 'hc-pill-ring' : 'hc-pill-dot'} aria-hidden="true" />;
  return <span className={`hc-pill${stamp ? ' hc-pill--stamp' : ''}`} data-tone={meta.tone}>{icon}<span>{meta.word}</span></span>;
}

/** Owner chip: identity ring + name + role, for plan rows and the org chart. */
export function OwnerChip({ agent, role = true }: { agent: AgentId; role?: boolean }) {
  const person = ROSTER[agent];
  const short = person.name.replace('Mayor ', '');
  const title = agent === 'mayor' ? 'Mayor' : agent === 'scout' ? 'Scout' : agent === 'maker' ? 'Maker' : agent === 'herald' ? 'Herald' : 'Founder';
  return <span className="hc-owner-chip">
    <span className="hc-ring-dot" style={{ borderColor: person.color }}><span style={{ background: person.color }} /></span>
    <span>{short}{role && <> · {title}</>}</span>
  </span>;
}

/** Square portrait used by the inspector: color frame, ink border, initials. */
export function Portrait({ agent, round = false, size = 48 }: { agent: AgentId; round?: boolean; size?: number }) {
  const person = ROSTER[agent];
  return <span className={`hc-portrait${round ? ' hc-portrait--round' : ''}`} style={{ borderColor: person.color, width: size, height: size }}>
    <span style={{ background: person.color }}>{person.initials === 'MM' ? 'MA' : person.initials === 'ME' ? 'YOU' : person.initials}</span>
  </span>;
}

export function Kicker({ children }: { children: ReactNode }) {
  return <span className="hc-kicker">{children}</span>;
}
