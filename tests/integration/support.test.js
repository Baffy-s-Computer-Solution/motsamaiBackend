const request = require('supertest');
const app = require('../../../app');
const { User } = require('../../../src/models');
const jwt = require('jsonwebtoken');
const config = require('../../../src/config');

describe('Support API Integration Tests', () => {
  let adminToken;
  let userToken;

  beforeAll(async () => {
    // Generate mock tokens for auth
    adminToken = jwt.sign({ id: 'admin_1', role: 'admin' }, config.JWT.secret);
    userToken = jwt.sign({ id: 'user_1', role: 'user' }, config.JWT.secret);
  });

  describe('POST /api/v1/support/tickets', () => {
    it('should return 201 when valid data is provided', async () => {
      const res = await request(app)
        .post('/api/v1/support/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          subject: 'App crashing',
          description: 'The app crashes when I open history',
          category: 'technical',
          priority: 'medium'
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('tracking_number');
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/v1/support/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          subject: 'Missing info'
        });

      expect(res.statusCode).toEqual(400);
    });
  });

  describe('PATCH /api/v1/support/tickets/:id/status', () => {
    it('should allow admin to update ticket status', async () => {
      const res = await request(app)
        .patch('/api/v1/support/tickets/tkt_mock/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'in-progress',
          notes: 'Agent assigned'
        });

      expect(res.statusCode).not.toBe(401);
      expect(res.statusCode).not.toBe(403);
    });
  });
});