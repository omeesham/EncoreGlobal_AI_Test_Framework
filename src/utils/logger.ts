import * as path from 'path';
import * as fs from 'fs';

export class Logger {
  private static logFile = path.join(process.cwd(), 'logs', 'test-execution.log');
  private static specContext = 'global';

  static setSpecContext(specFile: string): void {
    this.specContext = path.basename(specFile, '.spec.ts');
    const specLogDir = path.join(process.cwd(), 'logs', this.specContext);
    if (!fs.existsSync(specLogDir)) {
      fs.mkdirSync(specLogDir, { recursive: true });
    }
  }

  private static get currentLogFile(): string {
    if (this.specContext === 'global') {
      return this.logFile;
    }
    return path.join(process.cwd(), 'logs', this.specContext, 'test-execution.log');
  }

  private static write(level: string, message: string): void {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const line = `${timestamp} [${process.pid}] ${level.padEnd(5)} AutomationFramework - ${message}`;
    console.log(line);
    const logPath = this.currentLogFile;
    const logsDir = path.dirname(logPath);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    fs.appendFileSync(logPath, line + '\n', 'utf-8');
  }

  static info(message: string): void {
    this.write('INFO', message);
  }

  static error(message: string): void {
    this.write('ERROR', message);
  }

  static warn(message: string): void {
    this.write('WARN', message);
  }

  static debug(message: string): void {
    if (process.env.LOG_LEVEL === 'debug') {
      this.write('DEBUG', message);
    }
  }
}

export const Log = Logger;
