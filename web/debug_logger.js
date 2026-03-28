/**
 * Debug Logger for DazzleCommand
 *
 * Enable debug: localStorage.setItem('DEBUG_DAZZLE_COMMAND', 'true')
 * Enable verbose: localStorage.setItem('VERBOSE_DAZZLE_COMMAND', 'true')
 * Disable: localStorage.removeItem('DEBUG_DAZZLE_COMMAND')
 *
 * URL Parameters:
 * - ?debug=dazzle-cmd - Enable debug mode
 * - ?verbose=dazzle-cmd - Enable verbose mode
 */
export class DebugLogger {
    constructor(name) {
        this.name = name;
        this.debugEnabled = localStorage.getItem('DEBUG_DAZZLE_COMMAND') === 'true' ||
                           window.location.search.includes('debug=dazzle-cmd');
        this.verboseEnabled = localStorage.getItem('VERBOSE_DAZZLE_COMMAND') === 'true' ||
                             window.location.search.includes('verbose=dazzle-cmd');
        if (this.verboseEnabled) {
            console.log(`[${this.name}] Verbose mode enabled`);
        } else if (this.debugEnabled) {
            console.log(`[${this.name}] Debug mode enabled`);
        }
    }

    verbose(...args) {
        if (this.verboseEnabled) console.log(`[${this.name}] VERBOSE:`, ...args);
    }

    debug(...args) {
        if (this.debugEnabled || this.verboseEnabled) console.log(`[${this.name}]`, ...args);
    }

    info(...args) {
        if (this.debugEnabled || this.verboseEnabled) console.log(`[${this.name}]`, ...args);
    }

    error(...args) {
        console.error(`[${this.name}] ERROR:`, ...args);
    }
}

export const logger = new DebugLogger('DazzleCommand');
