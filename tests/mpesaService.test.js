const mpesaService = require('../../../src/services/mpesa.service');
const { Payment, Ride } = require('../../../src/models');
const walletService = require('../../../src/services/walletService');
const socketService = require('../../../src/services/socketService');
const logger = require('../../../src/utils/logger');

// Mock dependencies
jest.mock('../../../src/models');
jest.mock('../../../src/services/walletService');
jest.mock('../../../src/services/socketService', () => ({
  io: {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn()
  }
}));
jest.mock('../../../src/utils/logger');

describe('MpesaService - handleWebhook Unit Tests', () => {
  const checkoutId = 'ws_CO_01012024_000000123';
  
  const mockSuccessPayload = {
    Body: {
      stkCallback: {
        CheckoutRequestID: checkoutId,
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.'
      }
    }
  };

  const mockPayment = {
    id: 'pay_abc',
    user_id: 'user_123',
    amount: 150.50,
    update: jest.fn().mockResolvedValue(true),
    ride: {
      id: 'rid_456',
      rider_id: 'rider_789',
      update: jest.fn().mockResolvedValue(true)
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process successful payment: update status, wallet, ride, and emit socket', async () => {
    Payment.findOne.mockResolvedValue(mockPayment);

    await mpesaService.handleWebhook(mockSuccessPayload);

    // Verify payment status update
    expect(mockPayment.update).toHaveBeenCalledWith({ status: 'COMPLETED' });

    // Verify wallet balance update
    expect(walletService.updateBalance).toHaveBeenCalledWith(
      mockPayment.user_id,
      mockPayment.amount,
      'credit',
      expect.stringContaining(checkoutId),
      mockPayment.id
    );

    // Verify ride status update
    expect(mockPayment.ride.update).toHaveBeenCalledWith({ status: 'confirmed' });

    // Verify real-time notification
    expect(socketService.io.to).toHaveBeenCalledWith(`user:${mockPayment.ride.rider_id}`);
    expect(socketService.io.emit).toHaveBeenCalledWith('payment:confirmed', expect.objectContaining({
      rideId: mockPayment.ride.id,
      method: 'M-Pesa'
    }));
  });

  it('should mark payment as FAILED if ResultCode is non-zero', async () => {
    const failedPayload = {
      Body: {
        stkCallback: {
          CheckoutRequestID: checkoutId,
          ResultCode: 1032, // Cancelled by user
          ResultDesc: 'Request cancelled by user.'
        }
      }
    };
    Payment.findOne.mockResolvedValue(mockPayment);

    await mpesaService.handleWebhook(failedPayload);

    expect(mockPayment.update).toHaveBeenCalledWith({ status: 'FAILED' });
    expect(walletService.updateBalance).not.toHaveBeenCalled();
    expect(mockPayment.ride.update).not.toHaveBeenCalled();
  });

  it('should log a warning if no matching payment record is found', async () => {
    Payment.findOne.mockResolvedValue(null);

    await mpesaService.handleWebhook(mockSuccessPayload);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No payment record found'));
    expect(walletService.updateBalance).not.toHaveBeenCalled();
  });
});