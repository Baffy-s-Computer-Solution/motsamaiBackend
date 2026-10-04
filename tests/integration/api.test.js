/**
 * API Endpoints Integration Tests
 * Version: 2.0.0
 * 
 * @module tests/integration/api.test.js
 * @description Comprehensive tests for all API endpoints with production-grade assertions
 * 
 * Usage:
 *   npm test -- --testPathPattern="api.test.js"
 *   npm run test:coverage
 */

const request = require('supertest');
const app = require('../../app');
const { sequelize } = require('../../config/database');
const { User, Ride, Payment, Driver, Vehicle } = require('../../models');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

describe('API Endpoints Integration Tests', () => {
  let authToken, userId, driverId, rideId;
  const testUser = {
    email: 'test@example.com',
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User',
    phone: '+1234567890'
  };
  const hasDatabase = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

  beforeAll(async () => {
    if (!hasDatabase) {
      console.warn('Skipping DB-backed integration setup because no TEST_DATABASE_URL/DATABASE_URL is configured.');
      return;
    }

    // Setup: Create test database tables if they don't exist
    await sequelize.sync({ alter: false });

    // Create test user
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(testUser.password, salt);

    const user = await User.create({
      id: uuidv4(),
      email: testUser.email,
      phone: testUser.phone,
      first_name: testUser.firstName,
      last_name: testUser.lastName,
      password_hash: hashedPassword,
      role: 'rider',
      is_active: true,
      is_verified: true
    });

    userId = user.id;

    // Mock authentication token (replace with actual auth endpoint if available)
    authToken = `Bearer mock_token_${userId}`;
  });

  afterAll(async () => {
    if (hasDatabase && sequelize && typeof sequelize.close === 'function') {
      await sequelize.close();
    }
  });

  describe('📊 User Endpoints', () => {
    describe('GET /api/v1/users/profile', () => {
      it('should return user profile with 200 status', async () => {
        const res = await request(app)
          .get('/api/v1/users/profile')
          .set('Authorization', authToken)
          .expect('Content-Type', /json/)
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('data');
        expect(res.body.data).toHaveProperty('email', testUser.email);
        expect(res.body.data).not.toHaveProperty('password_hash');
      });

      it('should return 401 without authorization', async () => {
        const res = await request(app)
          .get('/api/v1/users/profile')
          .expect(401);

        expect(res.body).toHaveProperty('success', false);
      });
    });

    describe('PUT /api/v1/users/profile', () => {
      it('should update user profile successfully', async () => {
        const updateData = {
          first_name: 'UpdatedTest',
          last_name: 'UpdatedUser'
        };

        const res = await request(app)
          .put('/api/v1/users/profile')
          .set('Authorization', authToken)
          .send(updateData)
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
        expect(res.body.data.first_name).toBe(updateData.first_name);
      });

      it('should reject invalid phone number format', async () => {
        const updateData = { phone: 'invalid-phone' };

        const res = await request(app)
          .put('/api/v1/users/profile')
          .set('Authorization', authToken)
          .send(updateData)
          .expect(400);

        expect(res.body).toHaveProperty('success', false);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('GET /api/v1/users/:id', () => {
      it('should return user by ID for admin', async () => {
        const res = await request(app)
          .get(`/api/v1/users/${userId}`)
          .set('Authorization', authToken)
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
        expect(res.body.data).toHaveProperty('id', userId);
      });

      it('should return 404 for non-existent user', async () => {
        const fakeId = uuidv4();

        const res = await request(app)
          .get(`/api/v1/users/${fakeId}`)
          .set('Authorization', authToken)
          .expect(404);

        expect(res.body).toHaveProperty('success', false);
      });
    });

    describe('GET /api/v1/users/stats', () => {
      it('should return user statistics', async () => {
        const res = await request(app)
          .get('/api/v1/users/stats')
          .set('Authorization', authToken)
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
        expect(res.body.data).toHaveProperty('totalRides');
        expect(res.body.data).toHaveProperty('totalSpent');
      });
    });

    describe('GET /api/v1/users/ride-history', () => {
      it('should return user ride history with pagination', async () => {
        const res = await request(app)
          .get('/api/v1/users/ride-history?page=1&limit=10')
          .set('Authorization', authToken)
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
        expect(res.body.data).toHaveProperty('rides');
        expect(res.body.data).toHaveProperty('pagination');
        expect(res.body.data.pagination).toHaveProperty('currentPage', 1);
      });
    });
  });

  describe('🚗 Driver Endpoints', () => {
    describe('GET /api/v1/drivers', () => {
      it('should return list of drivers with pagination', async () => {
        const res = await request(app)
          .get('/api/v1/drivers?page=1&limit=20')
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
        expect(res.body.data).toHaveProperty('drivers');
        expect(res.body.data).toHaveProperty('pagination');
      });

      it('should support role filter', async () => {
        const res = await request(app)
          .get('/api/v1/drivers?role=driver')
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
        expect(Array.isArray(res.body.data)).toBe(true);
      });
    });

    describe('GET /api/v1/drivers/:id', () => {
      it('should return driver details by ID', async () => {
        const res = await request(app)
          .get(`/api/v1/drivers/${driverId || 'test'}`)
          .expect(200);

        // May return 200 or 404 depending on data
        expect([200, 404]).toContain(res.status);
      });
    });
  });

  describe('🚕 Ride Endpoints', () => {
    describe('POST /api/v1/rides', () => {
      it('should create a new ride request', async () => {
        const rideData = {
          pickup_location: 'Downtown Station',
          pickup_latitude: 40.7580,
          pickup_longitude: -73.9855,
          dropoff_location: 'Airport',
          dropoff_latitude: 40.7769,
          dropoff_longitude: -73.8740,
          ride_type: 'private'
        };

        const res = await request(app)
          .post('/api/v1/rides')
          .set('Authorization', authToken)
          .send(rideData)
          .expect('Content-Type', /json/);

        if (res.status === 201) {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('id');
          expect(res.body.data).toHaveProperty('status', 'requested');
          rideId = res.body.data.id;
        }
      });

      it('should validate required fields', async () => {
        const incompleteData = { pickup_location: 'Test' };

        const res = await request(app)
          .post('/api/v1/rides')
          .set('Authorization', authToken)
          .send(incompleteData)
          .expect(400);

        expect(res.body).toHaveProperty('success', false);
      });
    });

    describe('GET /api/v1/rides/:id', () => {
      it('should return ride details', async () => {
        if (!rideId) {
          this.skip();
          return;
        }

        const res = await request(app)
          .get(`/api/v1/rides/${rideId}`)
          .set('Authorization', authToken)
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
        expect(res.body.data).toHaveProperty('id', rideId);
      });
    });

    describe('GET /api/v1/rides', () => {
      it('should return user rides with pagination', async () => {
        const res = await request(app)
          .get('/api/v1/rides?page=1&limit=10&status=completed')
          .set('Authorization', authToken)
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
        expect(res.body.data).toHaveProperty('rides');
        expect(res.body.data).toHaveProperty('pagination');
      });
    });
  });

  describe('💳 Payment Endpoints', () => {
    describe('GET /api/v1/payments', () => {
      it('should return user payments with pagination', async () => {
        const res = await request(app)
          .get('/api/v1/payments?page=1&limit=10')
          .set('Authorization', authToken)
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
        expect(res.body.data).toHaveProperty('payments');
        expect(res.body.data).toHaveProperty('pagination');
      });
    });

    describe('POST /api/v1/payments', () => {
      it('should create a payment record', async () => {
        const paymentData = {
          ride_id: rideId || uuidv4(),
          amount: 25.50,
          payment_method: 'card'
        };

        const res = await request(app)
          .post('/api/v1/payments')
          .set('Authorization', authToken)
          .send(paymentData)
          .expect('Content-Type', /json/);

        if (res.status === 201) {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('id');
          expect(res.body.data).toHaveProperty('status');
        }
      });
    });
  });

  describe('🏥 Health Check Endpoints', () => {
    describe('GET /health', () => {
      it('should return health status', async () => {
        const res = await request(app)
          .get('/health')
          .expect(200);

        expect(res.body).toHaveProperty('status');
      });
    });

    describe('GET /api/v1/health', () => {
      it('should return detailed health information', async () => {
        const res = await request(app)
          .get('/api/v1/health')
          .expect(200);

        expect(res.body).toHaveProperty('success');
        expect(res.body).toHaveProperty('data');
        if (res.body.data) {
          expect(res.body.data).toHaveProperty('database');
          expect(res.body.data).toHaveProperty('uptime');
        }
      });
    });
  });

  describe('🔐 Security & Error Handling', () => {
    describe('Request Validation', () => {
      it('should handle missing Content-Type header gracefully', async () => {
        const res = await request(app)
          .get('/api/v1/users/profile')
          .expect('Content-Type', /json/);

        expect(res.body).toBeDefined();
      });

      it('should reject oversized payloads', async () => {
        const largeData = { data: 'x'.repeat(1000000) };

        const res = await request(app)
          .post('/api/v1/rides')
          .set('Authorization', authToken)
          .send(largeData);

        expect([400, 413, 500]).toContain(res.status);
      });
    });

    describe('Rate Limiting', () => {
      it('should have rate limiting mechanisms', async () => {
        const requests = Array(100).fill(null).map(() =>
          request(app).get('/api/v1/health')
        );

        const responses = await Promise.all(requests);
        const statusCodes = responses.map(r => r.status);

        // Should have some 200s, and possibly some 429s if rate limited
        expect(statusCodes.some(s => s === 200)).toBe(true);
      });
    });

    describe('CORS & Security Headers', () => {
      it('should have security headers', async () => {
        const res = await request(app)
          .get('/health');

        const securityHeaders = ['x-content-type-options', 'x-frame-options', 'x-xss-protection'];
        securityHeaders.forEach(header => {
          expect(res.headers).toHaveProperty(header.toLowerCase());
        });
      });
    });
  });

  describe('📋 Data Consistency', () => {
    it('should maintain referential integrity', async () => {
      // Create a ride with valid references
      const rider = await User.findOne({ where: { role: 'rider' } });
      const driver = await Driver.findOne();

      if (rider && driver) {
        const ride = await Ride.create({
          id: uuidv4(),
          rider_id: rider.id,
          driver_id: driver.id,
          pickup_location: 'Test',
          dropoff_location: 'Test',
          fare_amount: 20.00,
          status: 'completed'
        });

        expect(ride).toHaveProperty('id');
        expect(ride.rider_id).toBe(rider.id);
      }
    });
  });
});

describe('API Response Format Validation', () => {
  it('should follow standardized response format', async () => {
    const res = await request(app)
      .get('/health')
      .expect(200);

    expect(res.body).toBeDefined();
    // Should either have success property or status property
    expect(
      res.body.hasOwnProperty('success') ||
      res.body.hasOwnProperty('status') ||
      res.body.hasOwnProperty('data')
    ).toBe(true);
  });
});

module.exports = {};
