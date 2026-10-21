const mockGetRiderHistory = jest.fn();
const mockListRiderRecords = jest.fn();
const mockOk = jest.fn((response, data) => {
  response.data = data;
  return response;
});

jest.mock('../../src/services/rideService', () => ({
  getRiderHistory: mockGetRiderHistory,
}));

jest.mock('../../src/services/pricingService', () => ({}));
jest.mock('../../src/services/fraudDetection.service', () => ({}));
jest.mock('../../src/services/trackingService', () => ({}));
jest.mock('../../src/models', () => ({
  Ride: {},
  Payment: {},
  Review: {},
  Promotion: {},
  sequelize: {},
}));
jest.mock('../../src/utils/apiResponse', () => ({ ok: mockOk }));
jest.mock('../../src/services/firestoreRiderRecordService', () => ({
  listRiderRecords: mockListRiderRecords,
}));

const { getRideHistory } = require('../../src/controllers/rideController');

const invokeHandler = async (handler, req, res, next) => {
  handler(req, res, next);
  await new Promise((resolve) => setImmediate(resolve));
};

describe('ride history Firestore fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns Firestore rider bookings when PostgreSQL is unavailable', async () => {
    mockGetRiderHistory.mockRejectedValue({ code: '42P01', message: 'relation does not exist' });
    mockListRiderRecords.mockResolvedValue([
      {
        id: 'booking-1',
        firebase_uid: 'firebase-rider',
        status: 'completed',
        created_at: '2026-10-01T10:00:00.000Z',
        source_updated_at: '2026-10-01T11:00:00.000Z',
        payload: {
          serviceType: 'passenger_transport',
          pickup: { address: 'Maseru', lat: -29.31, lng: 27.48 },
          destination: { address: 'Roma', lat: -29.45, lng: 27.72 },
          fare: 42,
          fareSnapshot: { distanceKm: 18.2 },
          transportMode: 'taxi',
          paymentMethod: 'cash',
        },
      },
      {
        id: 'booking-2',
        firebase_uid: 'firebase-rider',
        status: 'delivered',
        payload: { serviceType: 'logistics' },
      },
    ]);

    const req = { user: { id: 'database-id', firebase_uid: 'firebase-rider' } };
    const res = {};
    const next = jest.fn();
    await invokeHandler(getRideHistory, req, res, next);

    expect(mockListRiderRecords).toHaveBeenCalledWith('firebase-rider', 'booking');
    expect(res.data).toEqual([expect.objectContaining({
      id: 'booking-1',
      rider_id: 'firebase-rider',
      pickup_address: 'Maseru',
      pickup_lat: -29.31,
      dropoff_address: 'Roma',
      fare_amount: 42,
      distance_km: 18.2,
      vehicle_type: 'taxi',
      payment_method: 'cash',
      status: 'completed',
    })]);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes unrelated database errors to Express error handling', async () => {
    const error = new Error('unexpected query failure');
    mockGetRiderHistory.mockRejectedValue(error);
    const next = jest.fn();

    await invokeHandler(getRideHistory, { user: { id: 'database-id' } }, {}, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(mockListRiderRecords).not.toHaveBeenCalled();
  });
});
