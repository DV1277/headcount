import { useLayoutEffect, useMemo, useRef } from 'react';
import { DEPARTMENTS, ROSTER, type AgentId, type DeptId, type EventEnvelope } from '@hc/contracts';
import type { TownState } from '@hc/engine';
import { getSimPositions } from '../bridge';
import { IconClose, IconCoin } from './icons';

// Geometry mirrors the Paper "Org chart" artboard, re-based so the You node's top edge is y = 0.
const NODE_W = 220;
const NODE_H = 104;
const CHART_W = 820;
const X: Record<AgentId, number> = { founder: 410, mayor: 410, scout: 110, maker: 410, herald: 710 };
const Y = { founder: 0, mayor: 190, dept: 400 };
const BUS = 342;
const ARROW = 9;

const nodeTop = (agent: AgentId) => (agent === 'founder' ? Y.founder : agent === 'mayor' ? Y.mayor : Y.dept);
const arrowDown = (x: number, y: number) => `${x - 6},${y - ARROW} ${x + 6},${y - ARROW} ${x},${y}`;
const arrowUp = (x: number, y: number) => `${x - 6},${y + ARROW} ${x + 6},${y + ARROW} ${x},${y}`;
const KILO = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

type Handoff = { from: DeptId; to: DeptId; count: number };

function groupHandoffs(state: TownState): Handoff[] {
  const map = new Map<string, Handoff>();
  for (const h of state.handoffs) {
    const key = `${h.from}>${h.to}`;
    const entry = map.get(key) ?? { from: h.from, to: h.to, count: 0 };
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => Math.abs(X[a.to] - X[a.from]) - Math.abs(X[b.to] - X[b.from]));
}

type Props = { state: TownState; events: readonly EventEnvelope[]; reduced: boolean; onClose(): void };

export function OrgChart({ state, events, reduced, onClose }: Props) {
  const refs = useRef<Partial<Record<AgentId, HTMLElement | null>>>({});
  const handoffs = useMemo(() => groupHandoffs(state), [state]);
  const approvals = useMemo(() => events.filter((e) => e.seq <= state.lastSeq && e.type === 'plan.approved').length, [events, state.lastSeq]);
  const assigned = useMemo(() => {
    const out: Record<DeptId, number> = { scout: 0, maker: 0, herald: 0 };
    for (const task of Object.values(state.tasks)) if (task.def.enabled && task.status !== 'skipped') out[task.def.owner] += 1;
    return out;
  }, [state.tasks]);
  const tokens = useMemo(() => {
    const out = {} as Record<AgentId, number>;
    for (const id of Object.keys(ROSTER) as AgentId[]) out[id] = 0;
    for (const e of events) if (e.seq <= state.lastSeq && e.type === 'payroll.tick') out[e.data.agent] += (e.data.tokensIn ?? 0) + (e.data.tokensOut ?? 0);
    return out;
  }, [events, state.lastSeq]);

  // FLIP: every node flies from its sim's screen position to its chart slot (PRD §10.4).
  useLayoutEffect(() => {
    if (reduced || matchMedia('(max-width: 760px)').matches) return;
    const sims = getSimPositions();
    if (!sims) return;
    for (const id of Object.keys(ROSTER) as AgentId[]) {
      const el = refs.current[id];
      const from = sims[id];
      if (!el || !from) continue;
      const rect = el.getBoundingClientRect();
      const dx = from.x - (rect.left + rect.width / 2);
      const dy = from.y - (rect.top + rect.height / 2);
      el.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(.2)`, opacity: 0.1 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      ], { duration: 700, easing: 'cubic-bezier(.65, 0, .35, 1)', fill: 'backwards' });
    }
  }, [reduced]);

  const edgeDelay = reduced ? 0 : 520;
  const outCount: Partial<Record<DeptId, number>> = {};
  const inCount: Partial<Record<DeptId, number>> = {};
  const paths = handoffs.map((h, k) => {
    const o = outCount[h.from] ?? 0; outCount[h.from] = o + 1;
    const i = inCount[h.to] ?? 0; inCount[h.to] = i + 1;
    const dir = Math.sign(X[h.to] - X[h.from]) || 1;
    const sx = X[h.from] + (dir > 0 ? 50 - 80 * o : -50 + 80 * o);
    const ex = X[h.to] + (dir > 0 ? -40 + 20 * i : 40 - 20 * i);
    const bottom = Y.dept + NODE_H;
    const y = bottom + 46 + 60 * k;
    return { h, sx, ex, dir, y, bottom, d: `M${sx} ${bottom} V${y - 18} Q${sx} ${y} ${sx + dir * 18} ${y} H${ex - dir * 18} Q${ex} ${y} ${ex} ${y - 18} V${bottom + ARROW}` };
  });
  const height = Math.max(Y.dept + NODE_H + 90, ...paths.map((p) => p.y + 40));

  const nodeMeta = (id: AgentId) => {
    const person = ROSTER[id];
    const pay = state.payroll.byAgent[id];
    const sub = id === 'founder' ? 'Founder · Home' : id === 'mayor' ? 'Mayor · StepFun Step 5' : `${id === 'scout' ? 'Scout' : id === 'maker' ? 'Maker' : 'Herald'} · CREAO agent`;
    const chips: JSX.Element[] = [];
    if (id === 'founder') chips.push(<span className="hc-org-chip" key="p">{approvals} plan{approvals === 1 ? '' : 's'} approved</span>);
    if (id === 'mayor' && tokens.mayor > 0) chips.push(<span className="hc-org-chip" key="t">{KILO(tokens.mayor)} tok</span>);
    if (id !== 'founder' && id !== 'mayor') chips.push(<span className="hc-org-chip" key="n">{assigned[id as DeptId]} task{assigned[id as DeptId] === 1 ? '' : 's'}</span>);
    const spend = [pay.credits > 0 ? `${pay.credits.toFixed(0)} cr` : '', id !== 'mayor' && pay.usd > 0 ? `$${pay.usd.toFixed(2)}` : ''].filter(Boolean).join(' · ');
    if (id !== 'founder' && spend) chips.push(<span className="hc-org-chip" key="c"><IconCoin size={12} />{spend}</span>);
    return { person, sub, chips };
  };

  return <div className="hc-org" role="dialog" aria-label="Org chart" aria-modal="false">
    <div className="hc-org-title">
      <span className="hc-kicker hc-kicker--light">ORG CHART</span>
      <h2>{state.title || 'This company'}</h2>
      <p>Who assigned what, and who handed work to whom.</p>
    </div>
    <button className="hc-btn hc-org-close" type="button" onClick={onClose}><IconClose size={14} /><span>Close</span><kbd>Esc</kbd></button>

    <div className="hc-org-chart" style={{ width: CHART_W, height }}>
      <svg className="hc-org-edges" width={CHART_W} height={height} viewBox={`0 0 ${CHART_W} ${height}`} aria-hidden="true" style={{ animationDelay: `${edgeDelay}ms` }}>
        <path d={`M${X.founder} ${Y.founder + NODE_H} V${Y.mayor - ARROW}`} className="hc-edge" />
        <polygon points={arrowDown(X.mayor, Y.mayor)} className="hc-arrow" />
        <path d={`M${X.mayor} ${Y.mayor + NODE_H} V${BUS} M${X.scout} ${BUS} H${X.herald} M${X.scout} ${BUS} V${Y.dept - ARROW} M${X.maker} ${BUS} V${Y.dept - ARROW} M${X.herald} ${BUS} V${Y.dept - ARROW}`} className="hc-edge" />
        {DEPARTMENTS.map((id) => <polygon key={id} points={arrowDown(X[id], Y.dept)} className="hc-arrow" />)}
        {paths.map((p) => <g key={`${p.h.from}>${p.h.to}`}>
          <path d={p.d} className="hc-edge hc-edge--dashed" />
          <polygon points={arrowUp(p.ex, p.bottom)} className="hc-arrow" />
        </g>)}
      </svg>
      <div className="hc-org-labels" style={{ animationDelay: `${edgeDelay}ms` }}>
        <span className="hc-edge-label" style={{ left: X.founder, top: (Y.founder + NODE_H + Y.mayor) / 2 }}>approves · {approvals}</span>
        {DEPARTMENTS.map((id) => <span key={id} className="hc-edge-label" style={{ left: X[id], top: BUS + 29 }}>assigns · {assigned[id]}</span>)}
        {paths.map((p) => <span key={`${p.h.from}>${p.h.to}`} className="hc-edge-label" style={{ left: (p.sx + p.ex) / 2, top: p.y }}>handoff · {p.h.count}</span>)}
      </div>
      {(['founder', 'mayor', 'scout', 'maker', 'herald'] as AgentId[]).map((id) => {
        const { person, sub, chips } = nodeMeta(id);
        return <div key={id} ref={(el) => { refs.current[id] = el; }} className="hc-org-node" style={{ left: X[id] - NODE_W / 2, top: nodeTop(id), width: NODE_W, height: NODE_H, borderColor: person.color }}>
          <div className="hc-org-node-in">
            <div className="hc-org-node-head">
              <span className="hc-org-avatar" style={{ background: person.color }}>{id === 'founder' ? 'YOU' : person.initials === 'MM' ? 'MA' : person.initials}</span>
              <span className="hc-org-name"><strong>{person.name.replace('Mayor ', '')}</strong><small>{sub}</small></span>
            </div>
            <div className="hc-org-chips">{chips}</div>
          </div>
        </div>;
      })}
    </div>

    <div className="hc-org-handoff-list">
      <h3>Recorded handoffs</h3>
      {handoffs.length ? handoffs.map((h) => <p key={`${h.from}>${h.to}`}>
        {ROSTER[h.from].name} → {ROSTER[h.to].name} · {h.count} handoff{h.count === 1 ? '' : 's'}
      </p>) : <p>No department handoffs yet.</p>}
    </div>

    <div className="hc-org-legend">
      <span><svg width="32" height="6" aria-hidden="true"><path d="M0 3H32" className="hc-edge" /></svg>assigns or approves</span>
      <span><svg width="32" height="6" aria-hidden="true"><path d="M0 3H32" className="hc-edge hc-edge--dashed" /></svg>handoff of finished work</span>
      <span><i className="hc-legend-ring" />ring color = identity</span>
    </div>
  </div>;
}
