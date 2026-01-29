// Prevents clawdbot from crashing on transient Telegram API fetch failures.
// Intercepts process.on('unhandledRejection') to suppress fetch failures
// before clawdbot's handler calls process.exit(1).
//
// Strategy: Monkey-patch process.on so that when clawdbot registers its
// unhandledRejection handler, we wrap it to skip fetch failures.

const origOn = process.on.bind(process);
process.on = function(event, listener) {
  if (event === 'unhandledRejection') {
    const wrapped = function(reason, promise) {
      if (reason instanceof TypeError && reason.message === 'fetch failed') {
        console.warn('[clawdbot-fetch-guard] Suppressed transient fetch failure (non-fatal)');
        return; // don't call the original handler (which would exit)
      }
      return listener.call(this, reason, promise);
    };
    return origOn.call(process, event, wrapped);
  }
  return origOn.call(process, event, listener);
};

console.log('[clawdbot-fetch-guard] Installed transient fetch failure guard');
