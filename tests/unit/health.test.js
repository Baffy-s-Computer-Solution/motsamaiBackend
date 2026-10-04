const request = require('supertest');
const { sequelize } = require('../../src/models');
const app = require('../../app');

describe('Health API', () => {
  beforeEach(() => {
    jest.spyOn(sequelize, 'authenticate').mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('responds with 200 and correct payload for /api/v1/health', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        service: 'Motsamai Web Backend',
        environment: expect.any(String),
        timestamp: expect.any(String),
      }),
    );
  });
});
