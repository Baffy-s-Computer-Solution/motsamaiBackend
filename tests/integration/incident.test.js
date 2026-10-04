const request = require('supertest');
const app = require('../../../app');
const jwt = require('jsonwebtoken');
const config = require('../../../src/config');

describe('Incident API Integration Tests', () => {
  let userToken;

  beforeAll(() => {
    userToken = jwt.sign({ id: 'user_1', role: 'rider' }, config.JWT.secret);
  });

  describe('POST /api/v1/incidents', () => {
    it('should successfully create a new incident report', async () => {
      const res = await request(app)
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          type: 'dispute',
          severity: 'medium',
          description: 'Fare disagreement',
          location: { latitude: -29.31, longitude: 27.48 }
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
    });

    it('should fail if latitude/longitude are missing when location is provided', async () => {
      const res = await request(app)
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          type: 'other',
          severity: 'low',
          description: 'Testing',
          location: { address: 'Maseru' }
        });

      expect(res.statusCode).toEqual(400);
    });
  });

  describe('GET /api/v1/incidents/health', () => {
    it('should return healthy status without auth', async () => {
      const res = await request(app).get('/api/v1/incidents/health');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toBe('healthy');
    });
  });
});