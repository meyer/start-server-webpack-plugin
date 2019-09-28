import sysPath from 'path';
import childProcess from 'child_process';
import webpack from 'webpack';

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
  nodeArgs?: string[];
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
      ...options,
      signal: options.signal === true ? 'SIGUSR2' : !!options.signal,
    });

    if (!Array.isArray(this.options.args)) {
      throw new Error('options.args has to be an array of strings');
    }

    // if (this.options.signal === true) {
    //   this.options.signal = 'SIGUSR2';
    //   // this.options.inject = false;
    // }
  }

  private worker: childProcess.ChildProcess | null = null;
  private workerLoaded?: boolean;
  private scriptFile?: string;
  private execArgv?: string[];
  private name = 'StartServerPlugin';
  public readonly options: Readonly<StartServerPluginOptions>;

  private enableRestarting = () => {
    console.log('sswp> Type `rs<Enter>` to restart the worker');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', data => {
      if (data.trim() === 'rs') {
        if (this.worker) {
          console.log('sswp> Killing worker...');
          process.kill(this.worker.pid);
        } else {
          this.runWorker();
        }
      }
    });
  };

  private getScript = (compilation: webpack.compilation.Compilation) => {
    const { entryName } = this.options;
    const map: Map<any, any> | Record<any, any> = compilation.entrypoints;
    const entry = 'get' in map ? map.get(entryName) : map[entryName];
    if (!entry) {
      console.log(compilation);
      throw new Error(
        `Requested entry "${entryName}" does not exist, try one of: ${(map.keys
          ? map.keys()
          : Object.keys(map)
        ).join(' ')}`
      );
    }
    const entryScript = entry.chunks[0].files[0];
    if (!entryScript) {
      console.error('Entry chunk not outputted', entry.chunks[0]);
      return;
    }
    const { path } = compilation.outputOptions;
    return sysPath.resolve(path, entryScript);
  };

  public getArgs = (): string[] => {
    const nodeArgs = this.options.nodeArgs || [];
    const execArgv = [...nodeArgs, ...process.execArgv];
    return execArgv;
  };

  private handleChildExit = (code: number | null, signal: string | null) => {
    if (code) {
      console.error('sswp> script exited with code', code);
    }

    if (signal) {
      console.error('sswp> script exited after signal', signal);
    }

    this.worker = null;

    if (!this.workerLoaded) {
      console.error('sswp> Script did not load or failed HMR, not restarting');
      return;
    }
    if (this.options.once) {
      console.error('sswp> Only running script once, as requested');
      return;
    }

    this.workerLoaded = false;
    this.runWorker();
  };

  private handleChildError = (_err: Error): void => {
    this.worker = null;
  };

  private handleChildMessage = (message: any): void => {
    if (message === 'SSWP_LOADED') {
      this.workerLoaded = true;
      console.error('sswp> Script loaded');
    } else if (message === 'SSWP_HMR_FAIL') {
      this.workerLoaded = false;
    }
  };

  private runWorker = (callback?: () => void): void => {
    if (this.worker) return;

    const {
      scriptFile,
      execArgv,
      options: { args, env },
    } = this;

    const command = [...execArgv!, scriptFile];
    const cmdline =
      command + (args.length === 0 ? '' : [' --', ...args].join(' '));
    console.warn(`sswp> running \`node ${cmdline}\``);

    const worker = childProcess.fork(scriptFile!, args, {
      execArgv,
      env,
      cwd: process.cwd(),
    });
    worker.once('exit', this.handleChildExit);
    worker.once('error', this.handleChildError);
    worker.on('message', this.handleChildMessage);
    this.worker = worker;

    if (callback) {
      callback();
    }
  };

  private hmrWorker = (
    _compilation: webpack.compilation.Compilation,
    callback: () => void
  ) => {
    const {
      worker,
      options: { signal },
    } = this;

    if (signal) {
      process.kill(worker!.pid, signal as any);
    } else if (worker!.send) {
      worker!.send('SSWP_HMR');
    } else {
      console.error('sswp> hot reloaded but no way to tell the worker');
    }

    callback();
  };

  private afterEmit = (
    compilation: webpack.compilation.Compilation,
    callback: () => void
  ) => {
    if (this.worker) {
      return this.hmrWorker(compilation, callback);
    }

    const scriptFile = this.getScript(compilation);
    if (!scriptFile) return;
    const execArgv = this.getArgs();
    this.scriptFile = scriptFile;
    this.execArgv = execArgv;
    this.runWorker(callback);
  };

  public amendEntry = (entry: any): any => {
    if (typeof entry === 'function')
      return (...args: any[]) =>
        Promise.resolve(entry(...args)).then(this.amendEntry.bind(this));

    const loaderPath = require.resolve('../hmr/monitor-loader');
    const monitor = `!!${loaderPath}!${loaderPath}`;

    if (typeof entry === 'string') return [entry, monitor];

    if (Array.isArray(entry)) return [...entry, monitor];

    if (typeof entry === 'object')
      return Object.assign({}, entry, {
        [this.options.entryName]: this.amendEntry(
          entry[this.options.entryName]
        ),
      });

    throw new Error('sswp> Cannot parse webpack `entry` option');
  };

  apply(compiler: webpack.Compiler) {
    compiler.options.entry = this.amendEntry(compiler.options.entry);

    // Use the Webpack 4 Hooks API when available
    if (compiler.hooks) {
      if (this.options.restartable && !this.options.once) {
        compiler.hooks.watchRun.tap(this.name, this.enableRestarting);
      }
      compiler.hooks.afterEmit.tapAsync(this.name, this.afterEmit);
    } else {
      if (this.options.restartable && !this.options.once) {
        compiler.plugin('watchRun', this.enableRestarting);
      }
      compiler.plugin('after-emit', this.afterEmit);
    }
  }
}
