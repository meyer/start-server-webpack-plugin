import sysPath from 'path';
import util from 'util';

export class FormattedError extends Error {
  constructor(message: any, ...args: any[]) {
    super(util.format(message, ...args));
  }
}

export const getScriptFromCompilation = (
  entryName: string,
  compilation: import('webpack').compilation.Compilation
): string | null => {
  const map = compilation.entrypoints;
  const entry = map.get(entryName);
  if (!entry) {
    throw new FormattedError(
      `Requested entry "%s" does not exist, try one of the following:\n%s`,
      entryName,
      Array.from(map.keys())
        .map(k => `- "${k}"\n`)
        .join('')
    );
  }

  const entryScript = entry.chunks[0].files[0];

  if (!entryScript) {
    throw new Error('Entry chunk not outputted');
  }

  const { path } = compilation.outputOptions;
  return sysPath.resolve(path, entryScript);
};
