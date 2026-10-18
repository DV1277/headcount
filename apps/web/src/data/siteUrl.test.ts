import { describe, expect, it } from 'vitest';
import { absoluteSiteUrl } from './siteUrl';

describe('site links for QR readers', () => {
  it('makes bundled and hosted site paths absolute on the deployment domain', () => {
    expect(absoluteSiteUrl('/sites/run_4hN7Q1M-b-/', 'https://demo.example')).toBe('https://demo.example/sites/run_4hN7Q1M-b-/');
    expect(absoluteSiteUrl('/assets/site.html', 'http://localhost:5173')).toBe('http://localhost:5173/assets/site.html');
    expect(absoluteSiteUrl('https://other.example/site')).toBe('https://other.example/site');
  });
  it('rejects executable and malformed destinations', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', 'http://[', null]) {
      expect(absoluteSiteUrl(value, 'https://demo.example')).toBeNull();
    }
  });
});
