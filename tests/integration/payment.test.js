const request = require('supertest');
const app = require('../../src/app');

describe('Payment Integration Flow', () => {
  it('should prevent payment initiation without authentication', async () => {
    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .send({
        provider: 'MPESA',
        phoneNumber: '+26658000000',
        amount: 50.00
      });
    
    expect(res.statusCode).toEqual(401);
  });

  it('should validate provider type', async () => {
    // Assuming we have a test token
    const res = await request(app)
      .post('/api/v1/payments/initiate')
      .set('Authorization', 'Bearer TEST_TOKEN')
      .send({
        provider: 'INVALID_PROVIDER',
        phoneNumber: '+26658000000',
        amount: 50.00
      });
    
    expect(res.statusCode).toEqual(400);
  });
});