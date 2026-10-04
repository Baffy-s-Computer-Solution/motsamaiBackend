const promClient = require('prom-client');

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 5, 15, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000]
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(httpRequestsTotal);

const dynamicCounters = new Map();
const dynamicHistograms = new Map();

const sanitizeMetricName = (name) => String(name || 'metric')
  .replace(/[^a-zA-Z0-9_:]/g, '_')
  .replace(/^[^a-zA-Z_:]/, '_');

const getCounter = (name) => {
  const metricName = sanitizeMetricName(name);
  if (!dynamicCounters.has(metricName)) {
    dynamicCounters.set(metricName, new promClient.Counter({
      name: metricName,
      help: `Dynamic counter ${metricName}`,
    }));
    register.registerMetric(dynamicCounters.get(metricName));
  }
  return dynamicCounters.get(metricName);
};

const getHistogram = (name) => {
  const metricName = sanitizeMetricName(name);
  if (!dynamicHistograms.has(metricName)) {
    dynamicHistograms.set(metricName, new promClient.Histogram({
      name: metricName,
      help: `Dynamic histogram ${metricName}`,
      buckets: [1, 5, 15, 50, 100, 250, 500, 1000, 2500, 5000],
    }));
    register.registerMetric(dynamicHistograms.get(metricName));
  }
  return dynamicHistograms.get(metricName);
};

const metrics = {
  incrementCounter(name, value = 1) {
    try {
      getCounter(name).inc(value);
    } catch {
      // Metrics must never break request handling.
    }
  },

  histogramObserve(name, value) {
    try {
      getHistogram(name).observe(Number(value) || 0);
    } catch {
      // Metrics must never break request handling.
    }
  },
};

module.exports = {
  register,
  httpRequestDurationMicroseconds,
  httpRequestsTotal,
  metrics
};
