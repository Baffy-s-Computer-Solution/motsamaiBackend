const request = require('supertest');
const app = require('../../app');
const { Payment, Ride, User, Wallet } = require('../../src/models');

// Mock socketService to prevent networking errors during test execution
jest.mock('../../src/services/socketService', () => ({
  io: {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn()
  }
}));

describe('M-Pesa Webhook Integration Test', () => {
  let user, ride, payment;

  beforeAll(async () => {
    // Create a real user record
    user = await User.create({
      name: 'Integration Tester',
      email: 'tester@motsamai.test',
      phone: '26658123456',
      password_hash: 'hashed_password',
      role: 'user'
    });

    // Create a real ride record
    ride = await Ride.create({
      rider_id: user.id,
      status: 'pending',
      pickup_address: 'Maseru Central',
      dropoff_address: 'Pioneer Mall',
      fare_amount: 150.00
    });

    // Create a pending payment record
    payment = await Payment.create({
      user_id: user.id,
      ride_id: ride.id,
      amount: 150.00,
      currency: 'LSL',
      status: 'PENDING',
      transaction_id: 'WS_CO_123456789', // Simulating CheckoutRequestID
      provider: 'MPESA'
    });
  });

  it('should process successful M-Pesa payment and update database state', async () => {
    const webhookPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID: '12345-6789-0',
          CheckoutRequestID: 'WS_CO_123456789',
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.'
        }
      }
    };

    const response = await request(app)
      .post('/api/v1/payments/webhook/mpesa')
      .send(webhookPayload);

    expect(response.status).toBe(200);

    // Verify Payment status was updated to COMPLETED in the DB
    const updatedPayment = await Payment.findByPk(payment.id);
    expect(updatedPayment.status).toBe('COMPLETED');

    // Verify Ride status was updated to confirmed
    const updatedRide = await Ride.findByPk(ride.id);
    expect(updatedRide.status).toBe('confirmed');

    // Verify Wallet balance was credited
    const wallet = await Wallet.findOne({ where: { user_id: user.id } });
    expect(wallet).not.toBeNull();
    expect(parseFloat(wallet.balance)).toBe(150.00);
  });
});