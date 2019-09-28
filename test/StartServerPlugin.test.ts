import expect from 'expect';
import { StartServerPlugin as Plugin } from '..';

describe('StartServerPlugin', function() {
  it('should accept a string entryName', function() {
    const p = new Plugin('test');
    expect(p.options.entryName).toBe('test');
  });

  it('should accept an options object', function() {
    const p = new Plugin({ entryName: 'hello' });
    expect(p.options.entryName).toBe('hello');
  });
});
