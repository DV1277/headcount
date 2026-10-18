import {describe,it,expect} from 'vitest';
import {isIllustrativeRecording,parseChoices,publicUrlKind,safeWebHref,simClock} from './lib';
describe('deliverable URL handling',()=>{
  it('does not advertise illustrative fixture addresses as public phone targets',()=>{
    for(const value of ['https://demo.example.invalid/sites/a/','https://fixture.example/site','https://example.com/demo','https://www.example.org/'])expect(publicUrlKind(value)).toBe('none');
    expect(publicUrlKind('https://headcount-test.trycloudflare.com/sites/a/')).toBe('public');
    expect(publicUrlKind('http://localhost:8788/sites/a/')).toBe('local');
    expect(publicUrlKind('http://192.168.1.12:8788/sites/a/')).toBe('lan');
    expect(isIllustrativeRecording('fixture:golden-boba')).toBe(true);
    expect(isIllustrativeRecording('fixture:overnight-live')).toBe(false);
  });
  it('never turns a provider-supplied non-web scheme into an active source link',()=>{
    for(const value of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','file:///etc/passwd','//outside.example/source'])expect(safeWebHref(value)).toBeUndefined();
    expect(safeWebHref('https://www.ucla.edu/')).toBe('https://www.ucla.edu/');
  });
});

describe('founder question helpers',()=>{
  it('reads two options out of an either/or question',()=>{
    expect(parseChoices('Juno wants a color for the site. Pink or midnight blue?')).toEqual(['Pink','Midnight blue']);
    expect(parseChoices('Which color: pink, teal or midnight blue?')).toEqual(['Pink','Teal','Midnight blue']);
    expect(parseChoices('Juno wants a color for the site, pink or midnight blue?')).toEqual(['Pink','Midnight blue']);
  });
  it('leaves open-ended questions as free text',()=>{
    expect(parseChoices('What should the shop be called?')).toEqual([]);
    expect(parseChoices('Who is the audience and what do they want to do first or last in the app flow?')).toEqual([]);
  });
  it('maps run time onto the storybook clock',()=>{
    expect(simClock(0)).toBe('9:00');
    expect(simClock(372000)).toBe('11:04');
  });
});
