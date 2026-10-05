const CONNECTION_ERROR_NAMES = new Set([
  'SequelizeConnectionError',
  'SequelizeConnectionRefusedError',
  'SequelizeHostNotFoundError',
  'SequelizeHostNotReachableError',
  'SequelizeInvalidConnectionError',
  'SequelizeConnectionTimedOutError',
  'SequelizeConnectionAcquireTimeoutError',
  'SequelizeTimeoutError',
]);

const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  '57P01',
  '57P02',
  '57P03',
  '53300',
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
]);

const isDatabaseUnavailable = (error) => {
  const pending = [error];
  const visited = new Set();

  while (pending.length) {
    const current = pending.pop();
    if (current && !visited.has(current)) {
      visited.add(current);

      if (CONNECTION_ERROR_NAMES.has(current.name) || CONNECTION_ERROR_CODES.has(current.code)) {
        return true;
      }

      pending.push(current.original, current.parent, current.cause, ...(current.errors || []));
    }
  }

  return false;
};

module.exports = isDatabaseUnavailable;
