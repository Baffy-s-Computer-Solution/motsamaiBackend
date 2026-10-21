const request = require('supertest');
const app = require('../../app');
const config = require('../../src/config');

describe('HTTP security headers and CORS', () => {
  it('does not grant CORS access to unconfigured origins', async () => {
    const origin = `https://untrusted-${Date.now()}.example`;
    const response = await request(app).get('/').set('Origin', origin);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('grants credentialed CORS access only to a configured origin', async () => {
    const origin = config.cors.origins.find((configuredOrigin) => configuredOrigin !== '*');

    if (!origin) {
      return;
    }

    const response = await request(app).get('/').set('Origin', origin);

    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe(
      config.cors.credentials ? 'true' : undefined,
    );
  });

  it('uses configured CORS methods and sets a restrictive Permissions-Policy', async () => {
    const origin = config.cors.origins.find((configuredOrigin) => configuredOrigin !== '*');
    const preflight = request(app)
      .options('/')
      .set('Access-Control-Request-Method', 'GET');
    if (origin) {
      preflight.set('Origin', origin);
    }
    const response = await preflight;

    expect(response.headers['access-control-allow-methods']).toBe(
      origin ? config.cors.methods : undefined,
    );
    expect(response.headers['permissions-policy']).toBe(
      'camera=(), microphone=(), geolocation=()',
    );
  });
});
