const store = new Map();

const toExpiresAt = (ttlSeconds) => {
  const ttl = Number(ttlSeconds);
  return Number.isFinite(ttl) && ttl > 0 ? Date.now() + ttl * 1000 : null;
};

const get = async (key) => {
  const entry = store.get(key);
  if (!entry) return null;

  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }

  return entry.value;
};

const set = async (key, value, ttlSeconds) => {
  store.set(key, {
    value,
    expiresAt: toExpiresAt(ttlSeconds),
  });
  return true;
};

const del = async (key) => {
  store.delete(key);
  return true;
};

const clear = async () => {
  store.clear();
  return true;
};

module.exports = {
  get,
  set,
  del,
  delete: del,
  clear,
};
