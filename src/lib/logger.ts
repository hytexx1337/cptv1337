/**
 * Sistema de logging configurable
 * Control mediante: NEXT_PUBLIC_DEBUG=true/false
 */

// Si NEXT_PUBLIC_DEBUG está definido, usarlo. Si no, usar NODE_ENV === 'development' como fallback
const IS_DEBUG = process.env.NEXT_PUBLIC_DEBUG !== undefined 
  ? process.env.NEXT_PUBLIC_DEBUG === 'true'
  : process.env.NODE_ENV === 'development';

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

class Logger {
  private enabled: boolean;

  constructor() {
    this.enabled = IS_DEBUG;
  }

  private formatMessage(prefix: string, ...args: any[]): any[] {
    return [prefix, ...args];
  }

  log(...args: any[]) {
    if (this.enabled) {
      console.log(...args);
    }
  }

  info(...args: any[]) {
    if (this.enabled) {
      console.info(...args);
    }
  }

  warn(...args: any[]) {
    if (this.enabled) {
      console.warn(...args);
    }
  }

  error(...args: any[]) {
    // Los errores SIEMPRE se muestran
    console.error(...args);
  }

  debug(...args: any[]) {
    if (this.enabled) {
      console.debug(...args);
    }
  }

  // Método para crear loggers con prefijo
  createLogger(prefix: string) {
    return {
      log: (...args: any[]) => this.log(...this.formatMessage(prefix, ...args)),
      info: (...args: any[]) => this.info(...this.formatMessage(prefix, ...args)),
      warn: (...args: any[]) => this.warn(...this.formatMessage(prefix, ...args)),
      error: (...args: any[]) => this.error(...this.formatMessage(prefix, ...args)),
      debug: (...args: any[]) => this.debug(...this.formatMessage(prefix, ...args)),
    };
  }

  // Activar/desactivar en runtime
  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  isEnabled() {
    return this.enabled;
  }
}

// Exportar instancia singleton
export const logger = new Logger();

// Loggers con prefijos comunes
export const streamLogger = logger.createLogger('🎬 [STREAM]');
export const subtitleLogger = logger.createLogger('📝 [SUBTITLES]');
export const cacheLogger = logger.createLogger('💾 [CACHE]');
export const playerLogger = logger.createLogger('▶️ [PLAYER]');
export const torrentLogger = logger.createLogger('📡 [TORRENT]');

// Export default
export default logger;

