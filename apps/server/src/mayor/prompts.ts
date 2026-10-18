// Prompt loading and filling. Prompt bodies are O4-owned .md assets (PRD §11.2).
import { readFileSync } from 'node:fs';

type PromptName = 'system' | 'plan' | 'review' | 'brief' | 'say' | 'cover' | 'repair';

const cache = new Map<PromptName, string>();

export function prompt(name: PromptName): string {
  let body = cache.get(name);
  if (body === undefined) {
    body = readFileSync(new URL(`./prompts/${name}.md`, import.meta.url), 'utf8');
    cache.set(name, body);
  }
  return body;
}

/** Fill {TOKENS} in a prompt template. Values are used verbatim; untrusted values must be wrapped before. */
export function fill(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [token, value] of Object.entries(values)) {
    // Function replacement: `$` sequences inside the value (price bands!) stay literal.
    out = out.replace(new RegExp(`\\{${token}\\}`, 'g'), () => value);
  }
  return out;
}

/**
 * Neutralize any closing-tag breakout inside untrusted content: "<\/" cannot terminate our
 * surrounding tag, so an attacker cannot escape the data block.
 */
export function untrusted(text: string): string {
  return text.replaceAll('</', '<\\/');
}
