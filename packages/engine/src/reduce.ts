import { ROSTER, type AgentId, type EventEnvelope } from '@hc/contracts';
import { initialState, type TownState } from './state.js';

const clone = <T>(x: T): T => structuredClone(x);

function updateProgress(s: TownState): void {
  const enabled = Object.values(s.tasks).filter((task) => task.def.enabled);
  s.progress = enabled.length ? enabled.filter((task) => task.status === 'accepted').length / enabled.length : 0;
  for (const task of Object.values(s.tasks)) {
    if (task.status === 'blocked' && task.def.dependsOn.every((id) => {
      const dependency = s.tasks[id];
      return dependency?.status === 'accepted' || dependency?.status === 'skipped';
    })) task.status = 'ready';
  }
}

function restoreAfterPause(s: TownState): void {
  for (const id of Object.keys(ROSTER) as AgentId[]) {
    s.agents[id].status = 'idle';
    delete s.agents[id].taskId;
  }
  const rank = { idle: 0, waiting: 1, blocked: 2, walking: 3, working: 4 } as const;
  const setAgent = (id: AgentId, status: 'idle' | 'walking' | 'working' | 'waiting' | 'blocked', taskId?: string) => {
    if (rank[status] >= rank[s.agents[id].status as keyof typeof rank]) {
      s.agents[id].status = status;
      if (taskId) s.agents[id].taskId = taskId;
    }
  };
  for (const [taskId, task] of Object.entries(s.tasks)) {
    const owner = task.def.owner;
    if (task.status === 'dispatched') setAgent(owner, 'walking', taskId);
    else if (task.status === 'working' || task.status === 'revising' || task.status === 'covered') setAgent(owner, 'working', taskId);
    else if (task.status === 'submitted' || task.status === 'under_review') setAgent(owner, 'waiting', taskId);
    else if (task.status === 'failed') setAgent(owner, 'blocked', taskId);
    else if (task.status === 'blocked' || (task.status === 'ready' && s.handoffs.some((handoff) => handoff.to === owner))) setAgent(owner, 'waiting', taskId);
  }
  if (s.status === 'finishing' || Object.values(s.tasks).some((task) => task.status === 'submitted' || task.status === 'under_review')) s.agents.mayor.status = 'working';
  else if (s.status === 'awaiting_approval' || s.status === 'awaiting_founder') s.agents.mayor.status = 'waiting';
}

export function reduce(state: TownState, e: EventEnvelope): TownState {
  const s = clone(state);
  if (e.seq <= s.lastSeq) return s;
  s.lastSeq = e.seq;
  s.t = e.t;
  const pushLog = (agent: AgentId, text: string) => {
    s.agents[agent].log.push({ seq: e.seq, t: e.t, text, kind: e.type });
    s.agents[agent].log = s.agents[agent].log.slice(-20);
  };

  switch (e.type) {
    case 'run.created':
      s.runId = e.runId; s.idea = e.data.idea; s.title = e.data.idea; s.mode = e.data.mode; s.status = 'drafting';
      break;
    case 'mayor.thinking':
      if (e.data.phase === 'plan') s.status = 'drafting';
      s.agents.mayor.status = 'working'; pushLog('mayor', `Thinking: ${e.data.phase}`);
      break;
    case 'founder.question':
      s.status = 'awaiting_founder'; s.questions.push({ qid: e.data.qid, text: e.data.text, answered: false });
      s.agents.mayor.status = 'waiting'; pushLog('mayor', e.data.text);
      break;
    case 'founder.answer': {
      const question = s.questions.find((item) => item.qid === e.data.qid);
      if (question) question.answered = true;
      s.status = 'drafting'; pushLog('founder', e.data.text);
      break;
    }
    case 'plan.proposed':
      s.plan = e.data.plan; s.planSource = e.data.source; s.title = e.data.plan.title; s.status = 'awaiting_approval';
      s.agents.mayor.status = 'waiting';
      s.tasks = Object.fromEntries(e.data.plan.tasks.map((task) => [task.id, {
        def: task, status: task.enabled ? (task.dependsOn.length ? 'blocked' : 'ready') : 'skipped', attempt: 0, revised: false,
      }]));
      pushLog('mayor', 'Plan ready for approval');
      break;
    case 'plan.approved':
      s.plan = e.data.plan; s.status = 'running';
      s.tasks = Object.fromEntries(e.data.plan.tasks.map(def => {
        const task = s.tasks[def.id] ?? { def, status: 'ready' as const, attempt: 0, revised: false };
        task.def = def;
        if (!def.enabled) task.status = 'skipped';
        else if (task.status === 'skipped') task.status = def.dependsOn.length ? 'blocked' : 'ready';
        return [def.id, task];
      }));
      pushLog('founder', 'Plan approved');
      break;
    case 'task.dispatched': {
      const task = s.tasks[e.data.taskId];
      if (task) {
        task.status = e.data.via === 'mayor-cover' ? 'covered' : 'dispatched';
        task.attempt = e.data.attempt; task.via = e.data.via;
        s.agents[e.data.agent].status = 'walking'; s.agents[e.data.agent].taskId = e.data.taskId;
        pushLog(e.data.agent, `Dispatched: ${task.def.title}`);
      }
      break;
    }
    case 'task.started': {
      const task = s.tasks[e.data.taskId];
      if (task) task.status = 'working';
      s.agents[e.data.agent].status = 'working'; s.agents[e.data.agent].taskId = e.data.taskId;
      pushLog(e.data.agent, 'Started work');
      break;
    }
    case 'agent.tool': pushLog(e.data.agent, e.data.label); break;
    case 'agent.progress': pushLog(e.data.agent, e.data.note); break;
    case 'agent.say': pushLog(e.data.agent, e.data.text); break;
    case 'artifact.created': {
      const artifact = e.data.artifact;
      s.artifacts[artifact.id] = { ...artifact };
      if (artifact.taskId && s.tasks[artifact.taskId]) {
        const task = s.tasks[artifact.taskId];
        if (task.artifactId && task.artifactId !== artifact.id && s.artifacts[task.artifactId]) s.artifacts[task.artifactId].stale = true;
        task.artifactId = artifact.id;
      }
      pushLog(artifact.agent, `Created ${artifact.title}`);
      break;
    }
    case 'handoff':
      s.handoffs.push({ from: e.data.from, to: e.data.to, artifactId: e.data.artifactId, t: e.t });
      s.agents[e.data.to].status = 'waiting'; pushLog(e.data.from, e.data.summary);
      break;
    case 'task.submitted': {
      const task = s.tasks[e.data.taskId];
      if (task) { task.status = 'submitted'; task.artifactId = e.data.artifactId; }
      break;
    }
    case 'review.verdict': {
      const task = s.tasks[e.data.taskId];
      if (task) task.status = e.data.verdict === 'accept' ? 'under_review' : 'revising';
      const artifact = s.artifacts[e.data.artifactId];
      if (artifact) artifact.review = { verdict: e.data.verdict, note: e.data.note };
      s.agents.mayor.status = 'waiting'; pushLog('mayor', `${e.data.verdict}: ${e.data.note}`);
      break;
    }
    case 'task.revising': {
      const task = s.tasks[e.data.taskId];
      if (task) {
        task.status = 'revising'; task.revised = true;
        s.agents[task.def.owner].status = 'working'; pushLog(task.def.owner, e.data.note);
      }
      break;
    }
    case 'task.completed': {
      const task = s.tasks[e.data.taskId];
      if (task) {
        task.status = 'accepted'; task.artifactId = e.data.artifactId; task.revised ||= e.data.revised;
        s.agents[task.def.owner].status = 'idle'; delete s.agents[task.def.owner].taskId;
        pushLog(task.def.owner, 'Task accepted');
      }
      break;
    }
    case 'task.failed': {
      const task = s.tasks[e.data.taskId];
      if (task) {
        task.status = 'failed'; s.agents[task.def.owner].status = 'blocked';
        pushLog(task.def.owner, e.data.error.message);
      }
      break;
    }
    case 'task.skipped': {
      const task = s.tasks[e.data.taskId];
      if (task) { task.status = 'skipped'; s.agents[task.def.owner].status = 'idle'; pushLog(task.def.owner, `Skipped: ${e.data.reason}`); }
      break;
    }
    case 'founder.redirect': {
      const task = s.tasks[e.data.taskId];
      if (task) {
        task.status = 'revising'; task.revised = true;
        s.agents[e.data.agent].status = 'working'; pushLog(e.data.agent, e.data.note);
      }
      break;
    }
    case 'run.paused':
      s.status = 'paused';
      for (const agent of Object.values(s.agents)) if (agent.status !== 'idle') agent.status = 'paused';
      break;
    case 'run.resumed':
      s.status = 'running'; restoreAfterPause(s);
      break;
    case 'payroll.tick': {
      const amount = e.data.credits ?? 0;
      const byAgent = s.payroll.byAgent[e.data.agent];
      byAgent.credits += amount; byAgent.usd += e.data.usd;
      s.payroll.credits += amount; s.payroll.usd += e.data.usd;
      s.agents[e.data.agent].credits += amount; s.agents[e.data.agent].usd += e.data.usd;
      break;
    }
    case 'run.finishing': s.status = 'finishing'; s.agents.mayor.status = 'working'; break;
    case 'brief.ready': pushLog('mayor', 'Founder brief ready'); break;
    case 'run.completed': s.status = 'completed'; for (const agent of Object.values(s.agents)) agent.status = 'idle'; break;
    case 'run.failed': s.status = 'failed'; for (const agent of Object.values(s.agents)) if (agent.status !== 'idle') agent.status = 'blocked'; break;
  }
  updateProgress(s);
  return s;
}

/** Return human-readable violations of the event-log invariants in PRD §16.2. */
export function checkInvariants(events: EventEnvelope[]): string[] {
  const errors: string[] = [];
  const acceptedArtifacts = new Set<string>();
  const artifactTask = new Map<string, string>();
  const artifactsByTask = new Map<string, Set<string>>();
  const taskDependencies = new Map<string, string[]>();
  const firstDispatches = new Set<string>();
  const seenHandoffs = new Set<string>();
  const tasks = new Map<string, { enabled: boolean; terminal: boolean; owner: string; dependsOn: string[]; dispatched: boolean; skipped: boolean }>();
  let approved = false;
  let finishing = false;
  let finalized = false;
  let credits = 0;
  let usd = 0;
  let prevSeq = 0;
  let runId: string | null = null;
  let previousT = -1;
  const clearAcceptedArtifacts = (taskId: string) => {
    for (const artifactId of artifactsByTask.get(taskId) ?? []) acceptedArtifacts.delete(artifactId);
  };
  for (const e of events) {
    if (e.seq !== prevSeq + 1) errors.push(`seq ${e.seq}: expected ${prevSeq + 1}`);
    if (runId === null) runId = e.runId;
    else if (e.runId !== runId) errors.push(`seq ${e.seq}: runId ${e.runId} does not match ${runId}`);
    if (!Number.isFinite(e.t) || e.t < 0) errors.push(`seq ${e.seq}: t must be a finite nonnegative timestamp`);
    else if (e.t < previousT) errors.push(`seq ${e.seq}: t ${e.t} precedes prior event time ${previousT}`);
    else previousT = e.t;
    if (!Number.isFinite(Date.parse(e.at))) errors.push(`seq ${e.seq}: at is not a valid timestamp`);
    if (finalized) errors.push(`seq ${e.seq}: event appears after terminal run event`);
    prevSeq = e.seq;
    switch (e.type) {
      case 'plan.proposed':
        tasks.clear();
        for (const task of e.data.plan.tasks) {
          tasks.set(task.id, { enabled: task.enabled, terminal: !task.enabled, owner: task.owner, dependsOn: task.dependsOn, dispatched: false, skipped: !task.enabled });
          taskDependencies.set(task.id, task.dependsOn);
        }
        break;
      case 'plan.approved':
        approved = true;
        tasks.clear();
        for (const task of e.data.plan.tasks) {
          tasks.set(task.id, { enabled: task.enabled, terminal: !task.enabled, owner: task.owner, dependsOn: task.dependsOn, dispatched: false, skipped: !task.enabled });
          taskDependencies.set(task.id, task.dependsOn);
        }
        break;
      case 'task.dispatched': {
        if (!approved) errors.push(`seq ${e.seq}: task dispatched before plan approval`);
        const task = tasks.get(e.data.taskId);
        if (!task) errors.push(`seq ${e.seq}: dispatch references unknown task`);
        else {
          if (!task.enabled) errors.push(`seq ${e.seq}: disabled task ${e.data.taskId} was dispatched`);
          if (task.owner !== e.data.agent) errors.push(`seq ${e.seq}: dispatch owner mismatch`);
          if (!task.dispatched) for (const dep of task.dependsOn) {
            if (!tasks.get(dep)?.skipped && !seenHandoffs.has(`${e.data.taskId}:${dep}`)) errors.push(`seq ${e.seq}: missing dependency handoff ${e.data.taskId}:${dep}`);
          }
          task.terminal = false; task.dispatched = true;
        }
        firstDispatches.add(e.data.taskId);
        clearAcceptedArtifacts(e.data.taskId);
        break;
      }
      case 'task.revising': {
        const task = tasks.get(e.data.taskId);
        if (task) task.terminal = false;
        clearAcceptedArtifacts(e.data.taskId);
        break;
      }
      case 'founder.redirect': {
        const task = tasks.get(e.data.taskId);
        if (task) task.terminal = false;
        clearAcceptedArtifacts(e.data.taskId);
        break;
      }
      case 'handoff': {
        const producer = artifactTask.get(e.data.artifactId);
        const target = tasks.get(e.data.taskId);
        if (!target || target.owner !== e.data.to || !producer || !target.dependsOn.includes(producer) || tasks.get(producer)?.owner !== e.data.from) errors.push(`seq ${e.seq}: handoff does not match the task dependency owners`);
        if (target?.dispatched) errors.push(`seq ${e.seq}: handoff appears after first dispatch`);
        const key = `${e.data.taskId}:${producer ?? e.data.artifactId}`;
        if (seenHandoffs.has(key)) errors.push(`seq ${e.seq}: duplicate handoff ${key}`);
        seenHandoffs.add(key);
        if (!producer || !acceptedArtifacts.has(e.data.artifactId)) errors.push(`seq ${e.seq}: handoff artifact ${e.data.artifactId} is not from an accepted task`);
        if (producer && !(taskDependencies.get(e.data.taskId) ?? []).includes(producer)) errors.push(`seq ${e.seq}: task ${e.data.taskId} does not depend on handoff source task ${producer}`);
        if (firstDispatches.has(e.data.taskId)) errors.push(`seq ${e.seq}: handoff for ${e.data.taskId} occurs after its first dispatch`);
        break;
      }
      case 'artifact.created': {
        const { id, taskId } = e.data.artifact;
        if(e.data.artifact.runId!==e.runId)errors.push(`seq ${e.seq}: artifact runId mismatch`);
        if (taskId) {
          artifactTask.set(id, taskId);
          const ids = artifactsByTask.get(taskId) ?? new Set<string>();
          ids.add(id); artifactsByTask.set(taskId, ids);
        }
        break;
      }
      case 'task.completed': {
        if (artifactTask.get(e.data.artifactId)!==e.data.taskId) errors.push(`seq ${e.seq}: completion artifact does not belong to the task`);
        acceptedArtifacts.add(e.data.artifactId);
        const task = tasks.get(e.data.taskId);
        if (task) task.terminal = true;
        break;
      }
      case 'task.failed': {
        const task = tasks.get(e.data.taskId);
        if (task) task.terminal = !e.data.willRetry && e.data.next === 'skip';
        break;
      }
      case 'task.skipped': {
        const task = tasks.get(e.data.taskId);
        if (task) {task.terminal = true;task.skipped = true;}
        break;
      }
      case 'payroll.tick':
        credits += e.data.credits ?? 0; usd += e.data.usd;
        break;
      case 'run.finishing':
        finishing = true;
        for (const [id, task] of tasks) if (task.enabled && !task.terminal) errors.push(`seq ${e.seq}: task ${id} is not terminal before run.finishing`);
        break;
      case 'run.completed':
        for (const [id, task] of tasks) if (task.enabled && !task.terminal) errors.push(`seq ${e.seq}: task ${id} is not terminal before run.completed`);
        if (!finishing) errors.push(`seq ${e.seq}: run.completed before run.finishing`);
        finalized = true;
        break;
      case 'run.failed':
        finalized = true;
        break;
      default: break;
    }
  }
  if (events.length) {
    const state = events.reduce((current, event) => reduce(current, event), initialState());
    if (Math.abs(state.payroll.usd - usd) > 1e-9 || state.payroll.credits !== credits) errors.push('payroll totals differ from payroll.tick sum');
  }
  return errors;
}
