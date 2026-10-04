const request = require('supertest');
const app = require('../../app');

describe('User routes', () => {
  it('returns profile data', async () => {
    const response = await request(app).get('/api/v1/users/profile');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ success: true, profile: expect.any(Object) }));
  });
});
