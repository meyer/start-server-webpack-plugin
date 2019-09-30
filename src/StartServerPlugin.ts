import childProcess from 'child_process';
import webpack from 'webpack';
import { getScriptFromCompilation } from './utils';
import chalk from 'chalk';
import util from 'util';

export interface StartServerPluginOptions {
  /** What to run */
  entryName: string;
  /** Arguments for worker */
  args: string[];
  /** Send a signal instead of a message */
  signal: string | number | undefined;
  /** Arguments passed to node */
  nodeArgs: string[];
  /** Environment passed to the child process. Defaults to `process.env`. */
  env: NodeJS.ProcessEnv;
}

const pluginName = 'StartServerPlugin';

const colors = {
  error: 'red',
  info: 'green',
  warn: 'yellow',
} as const;

const log = <T extends keyof typeof colors>(
  level: T,
  message: string,
  ...args: any[]
) => {
  console[level](
    chalk[colors[level]].bold(
      `\n${pluginName} > ` + util.format(message, ...args)
    )
  );
};

export class StartServerPlugin implements webpack.Plugin {
  constructor(options: string | Partial<StartServerPluginOptions> = {}) {
    if (typeof options === 'string') {
      options = { entryName: options };
    }

    this.options = Object.freeze({
      entryName: 'main',
      args: [],
      env: process.env,
      nodeArgs: [],
      signal: 'SIGUSR2',
      ...options,
    });

    if (!Array.isArray(this.options.args)) {
      throw new Error('options.args has to be an array of strings');
    }
  }

  public readonly options: Readonly<StartServerPluginOptions>;
  private worker: childProcess.ChildProcess | null = null;

  private killServer = () => {
    if (!this.worker || this.worker.killed) {
      return;
    }

    log('info', 'Killing worker...');

    try {
      // ChildProcess.kill types are inaccurate
      this.worker.kill(this.options.signal as any);
    } catch (err) {
      if (err.code === 'ESRCH') {
        log('warn', 'Process has already been killed');
      } else {
        log('error', 'Error killing process:', err);
      }
    }

    this.worker = null;
  };

  private onAfterEmitHook = async (
    compilation: webpack.compilation.Compilation
  ): Promise<void> => {
    // ensure the existing process has been killed
    this.killServer();

    // get the path to the new JS file
    const scriptFile = getScriptFromCompilation(
      this.options.entryName,
      compilation
    );

    if (!scriptFile) {
      log('error', 'No script file');
      return;
    }

    const execArgv = [...this.options.nodeArgs, ...process.execArgv];
    const { args, env } = this.options;

    const command = [...execArgv, scriptFile];
    const cmdline =
      command + (args.length === 0 ? '' : [' --', ...args].join(' '));
    log('info', 'running `node %s`', cmdline);

    // create a new worker
    const worker = childProcess.fork(scriptFile, args, {
      execArgv,
      env,
      cwd: process.cwd(),
    });

    worker.once('exit', (code, signal) => {
      if (code) log('warn', 'script exited with code', code);
      if (signal) log('warn', 'script exited after signal', signal);
      this.worker = null;
    });

    worker.once('error', err => {
      log('error', 'Worker error:', err);
    });

    this.worker = worker;
  };

  apply(compiler: webpack.Compiler) {
    let hooksApplied = false;

    // only enable plugin for watch mode
    compiler.hooks.watchRun.tap(pluginName, () => {
      if (hooksApplied) {
        return;
      }

      log('info', 'plugin registered');

      // Kill the server when compilation is invalidated
      compiler.hooks.invalid.tap(pluginName, () => this.killServer());

      compiler.hooks.afterEmit.tapPromise(pluginName, this.onAfterEmitHook);

      // copied from NoEmitOnErrorsPlugin
      compiler.hooks.shouldEmit.tap(pluginName, compilation => {
        const shouldEmit = !compilation.getStats().hasErrors();
        if (!shouldEmit) {
          log('error', 'compilation error');
        }
        return shouldEmit;
      });

      compiler.hooks.compilation.tap(pluginName, compilation => {
        compilation.hooks.shouldRecord.tap(
          pluginName,
          () => !compilation.getStats().hasErrors()
        );
      });

      hooksApplied = true;
    });
  }
}
