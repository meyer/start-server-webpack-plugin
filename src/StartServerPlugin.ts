import childProcess from 'child_process';
import webpack from 'webpack';
import { getScriptFromCompilation } from './utils';

export interface StartServerPluginOptions {
  /** What to run */
  entryName: string;
  /** Arguments for worker */
  args: string[];
  /** Run once and exit when worker exits */
  once: boolean;
  /** Send a signal instead of a message */
  signal: boolean | string;
  /** Only listen on keyboard in development, so the server doesn't hang forever */
  restartable: boolean;
  /** Arguments passed to node */
  nodeArgs: string[];
  /** Environment passed to the child process */
  env: NodeJS.ProcessEnv;
}

export class StartServerPlugin implements webpack.Plugin {
  constructor(options: string | Partial<StartServerPluginOptions> = {}) {
    if (typeof options === 'string') {
      options = { entryName: options };
    }

    this.options = Object.freeze({
      entryName: 'main',
      once: false,
      args: [],
      restartable: process.env.NODE_ENV === 'development',
      env: process.env,
      nodeArgs: [],
      ...options,
      signal: options.signal === true ? 'SIGUSR2' : !!options.signal,
    });

    if (!Array.isArray(this.options.args)) {
      throw new Error('options.args has to be an array of strings');
    }
  }

  private name = 'StartServerPlugin';
  public readonly options: Readonly<StartServerPluginOptions>;
  private worker: childProcess.ChildProcess | null = null;

  private handleChildExit = (code: number | null, signal: string | null) => {
    if (code) {
      console.error('sswp> script exited with code', code);
    }

    if (signal) {
      console.error('sswp> script exited after signal', signal);
    }
  };

  private handleChildError = (err: Error): void => {
    console.error('sswp> ERROR:', err);
  };

  private killServer = () => {
    if (!this.worker) {
      return;
    }
    console.log('sswp> Killing worker...');
    process.kill(this.worker.pid);
    this.worker = null;
  };

  private onInvalidHook = () => {
    this.killServer();
  };

  private onAfterEmitHook = async (
    compilation: webpack.compilation.Compilation
  ): Promise<void> => {
    console.log('sswp> afterEmit!');

    // ensure the existing process has been killed
    this.killServer();

    // get the path to the new JS file
    const scriptFile = getScriptFromCompilation(
      this.options.entryName,
      compilation
    );

    if (!scriptFile) {
      console.error('sswp> ERROR: No script file');
      return;
    }

    const execArgv = [...this.options.nodeArgs, ...process.execArgv];
    const { args, env } = this.options;

    const command = [...execArgv, scriptFile!];
    const cmdline =
      command + (args.length === 0 ? '' : [' --', ...args].join(' '));
    console.warn(`sswp> running \`node ${cmdline}\``);

    // create a new worker
    const worker = childProcess.fork(scriptFile!, args, {
      execArgv,
      env,
      cwd: process.cwd(),
    });

    worker.once('exit', this.handleChildExit);
    worker.once('error', this.handleChildError);

    this.worker = worker;
  };

  apply(compiler: webpack.Compiler) {
    compiler.hooks.invalid.tap(this.name, this.onInvalidHook);
    compiler.hooks.afterEmit.tapPromise(this.name, this.onAfterEmitHook);
  }
}
