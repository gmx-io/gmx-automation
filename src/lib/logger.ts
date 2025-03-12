/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */

class DebugLogger {
  log(...args: any[]) {
    console.log(...args);
  }

  debug(...args: any[]) {
    console.debug(...args);
  }

  info(...args: any[]) {
    console.info(...args);
  }

  warn(...args: any[]) {
    console.warn(...args);
  }

  error(...args: any[]) {
    console.error(...args);
  }

  fatal(...args: any[]) {
    console.error(...args);
  }
}

class GelatoLogger {
  log(..._args: any[]) {
    // noop
  }

  debug(..._args: any[]) {
    // noop
  }

  info(..._args: any[]) {
    // noop
  }

  warn(..._args: any[]) {
    // noop
  }

  error(..._args: any[]) {
    // noop
  }

  fatal(..._args: any[]) {
    // noop
  }
}

export type Logger = DebugLogger | GelatoLogger;

export const getLogger = (isGelatoEnvironment: boolean) => {
  if (isGelatoEnvironment) {
    return new GelatoLogger();
  }

  return new DebugLogger();
};
