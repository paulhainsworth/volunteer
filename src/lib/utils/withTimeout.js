export class TimeoutError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'TimeoutError';
    this.code = 'TIMEOUT';
    this.details = details;
  }
}

export function withTimeout(operation, options = {}) {
  const {
    timeoutMs = 12000,
    label = 'operation'
  } = options;

  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`${label} timed out after ${timeoutMs}ms`, { label, timeoutMs }));
    }, timeoutMs);
  });

  const runOperation = typeof operation === 'function' ? operation() : operation;

  return Promise.race([runOperation, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

export function withSupabaseReadTimeout(operation, label, timeoutMs = 12000) {
  return withTimeout(operation, { label, timeoutMs });
}
