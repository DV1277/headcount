/**
 * HC-N-021 sanitizer: one explicit allowlist for Maker HTML. Scripts, event handlers,
 * frames and unsafe URL schemes never reach the published file; inline <style>,
 * Google Fonts link tags, mailto form actions and data: images are preserved.
 */
import sanitizeHtml from 'sanitize-html';

const TAGS = [
  'html', 'head', 'body', 'style', 'link', 'meta', 'title', 'section', 'header', 'footer', 'main', 'nav', 'article',
  'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'ul', 'ol', 'li', 'img', 'form', 'input', 'button',
  'label', 'strong', 'em', 'br', 'hr', 'small', 'blockquote', 'details', 'summary',
];
const ATTRIBUTES = ['class', 'id', 'style', 'href', 'src', 'alt', 'action', 'method', 'type', 'name', 'placeholder', 'rel', 'content', 'charset'];
const BASIC_SCHEMES = ['http', 'https', 'mailto', 'data'] as const;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: TAGS,
  allowedAttributes: { '*': ATTRIBUTES },
  allowedSchemes: [...BASIC_SCHEMES],
  allowedSchemesByTag: { a: ['http', 'https', 'mailto'], img: ['http', 'https', 'data'], link: ['https'], form: ['mailto'] },
  allowVulnerableTags: true,
  allowProtocolRelative: false,
  nonTextTags: ['script', 'iframe', 'object', 'embed', 'noscript', 'textarea', 'option', 'noembed', 'noframes', 'style'],
};

const RESIDUAL = /<\s*(?:script|iframe|object|embed)\b|(?:\shref|\ssrc|\saction)\s*=\s*(?:"|')?\s*javascript:/i;
const RESIDUAL_EVENT = /<[^>]*\s+on[a-z]+\s*=/i;

function assertResidualFree(html: string): void {
  if (RESIDUAL.test(html) || RESIDUAL_EVENT.test(html)) {
    throw new Error('Sanitizer output failed the residual-content check; site not published.');
  }
}

/** Validate and neutralize untrusted Maker HTML into the publishable form. Idempotent. */
export function sanitizeSiteHtml(html: string): string {
  const clean = sanitizeHtml(html, OPTIONS);
  assertResidualFree(clean);
  return clean;
}
