const retry = require('async-retry');

function withRetry(fn, opts = {}) {
	const retries = opts.retries || 3;
	const minTimeout = opts.minTimeout || 100;
	const factor = opts.factor || 2;
	return (...args) => retry(async (bail) => fn(...args), { retries, minTimeout, factor });
}

module.exports = { withRetry };
