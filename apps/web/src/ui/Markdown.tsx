import type { ReactNode } from 'react';

const INLINE = /\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const key = `${keyBase}-i${index++}`;
    if (match[1] !== undefined) nodes.push(<strong key={key}>{match[1]}</strong>);
    else if (match[2] !== undefined) nodes.push(<em key={key}>{match[2]}</em>);
    else if (match[3] !== undefined) nodes.push(<code key={key}>{match[3]}</code>);
    else if (match[4] !== undefined && match[5] !== undefined) nodes.push(<a key={key} href={match[5]} target="_blank" rel="noopener noreferrer nofollow">{match[4]}</a>);
    last = INLINE.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const key = `l${blocks.length}`;
    const items = list.items.map((item, i) => <li key={i}>{inline(item, `${key}-${i}`)}</li>);
    blocks.push(list.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
    list = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      const content = inline(heading[2], `h${blocks.length}`);
      if (level <= 1) blocks.push(<h3 key={`h${blocks.length}`} className="hc-md-h1">{content}</h3>);
      else if (level === 2) blocks.push(<h4 key={`h${blocks.length}`} className="hc-md-h2">{content}</h4>);
      else blocks.push(<h5 key={`h${blocks.length}`} className="hc-md-h3">{content}</h5>);
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (list && list.ordered) flush();
      list = list && !list.ordered ? list : { ordered: false, items: [] };
      list.items.push(bullet[1]);
      continue;
    }
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ordered) {
      if (list && !list.ordered) flush();
      list = list && list.ordered ? list : { ordered: true, items: [] };
      list.items.push(ordered[1]);
      continue;
    }
    flush();
    blocks.push(<p key={`p${blocks.length}`}>{inline(line, `p${blocks.length}`)}</p>);
  }
  flush();
  return <div className="hc-markdown">{blocks}</div>;
}
