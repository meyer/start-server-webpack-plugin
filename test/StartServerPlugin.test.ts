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

  it('should calculate arguments', function() {
    const p = new Plugin({ nodeArgs: ['meep'], args: ['moop'] });
    const args = p.getArgs();
    expect(args).toEqual(['meep']);
  });

  it('should accept string entry', function() {
    const p = new Plugin();
    const entry = p.amendEntry('meep');
    expect(entry).toBeInstanceOf(Array);
    expect(entry[0]).toEqual('meep');
    expect(entry[1]).toContain('monitor');
  });
  it('should accept array entry', function() {
    const p = new Plugin();
    const entry = p.amendEntry(['meep', 'moop']);
    expect(entry).toBeInstanceOf(Array);
    expect(entry.slice(0, 2)).toEqual(['meep', 'moop']);
    expect(entry[2]).toContain('monitor');
  });
  it('should accept object entry', function() {
    const p = new Plugin({ entryName: 'boom' });
    const entry = p.amendEntry({ boom: 'meep', beep: 'foom' });
    expect(entry.beep).toEqual('foom');
    expect(entry.boom).toBeInstanceOf(Array);
    expect(entry.boom[0]).toEqual('meep');
    expect(entry.boom[1]).toContain('monitor');
  });
  it('should accept function entry', function(cb) {
    const p = new Plugin();
    const entryFn = p.amendEntry((arg: any) => arg);
    expect(entryFn).toBeInstanceOf(Function);
    const entry = entryFn('meep');
    expect(entry).toBeInstanceOf(Promise);
    entry.then((entry: any) => {
      expect(entry[0]).toEqual('meep');
      expect(entry[1]).toContain('monitor');
      cb();
    });
  });
});
