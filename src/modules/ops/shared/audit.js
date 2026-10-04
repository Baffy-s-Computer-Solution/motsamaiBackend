const logOpsEvent = (event, payload = {}) => {
  if (process.env.OPS_AUDIT_LOG !== 'true') return;
  // eslint-disable-next-line no-console
  console.log(`[OPS_AUDIT] ${event}`, payload);
};

module.exports = { logOpsEvent };
