const Joi = require('joi');

const updateStatus = {
  body: Joi.object().keys({
    status: Joi.string().valid('online', 'offline', 'busy').required(),
    is_available: Joi.boolean(),
    timestamp: Joi.date(),
    location: Joi.object().keys({
      latitude: Joi.number().required(),
      longitude: Joi.number().required(),
      accuracy: Joi.number(),
      heading: Joi.number(),
      speed: Joi.number(),
    }),
  }),
};

const updateProfile = {
  body: Joi.object().unknown(true).min(1),
};

const updateVehicle = {
  body: Joi.object().keys({
    make: Joi.string(),
    model: Joi.string(),
    year: Joi.string(),
    licensePlate: Joi.string(),
    color: Joi.string(),
    capacity: Joi.number().integer().min(1),
  }).min(1),
};

const acceptRide = {
  params: Joi.object().keys({
    rideId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    location: Joi.object().keys({
      latitude: Joi.number().required(),
      longitude: Joi.number().required(),
    }),
  }),
};

const completeRide = {
  params: Joi.object().keys({
    rideId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    distance: Joi.number(),
    duration: Joi.number(),
    distance_km: Joi.number(),
    duration_minutes: Joi.number(),
    final_fare: Joi.number(),
    fare: Joi.number(),
    location: Joi.object().unknown(true),
  }).unknown(true),
};

const rideIdParam = {
  params: Joi.object().keys({
    rideId: Joi.string().required(),
  }),
};

const documentIdParam = {
  params: Joi.object().keys({
    id: Joi.string().required(),
  }),
};

const optionalQuery = {
  query: Joi.object().unknown(true),
};

const optionalBody = {
  body: Joi.object().unknown(true),
};

const updateLocation = {
  body: Joi.object().keys({
    latitude: Joi.number().required(),
    longitude: Joi.number().required(),
    accuracy: Joi.number(),
    heading: Joi.number(),
    speed: Joi.number(),
  }).unknown(true),
};

const checkGeofence = {
  query: Joi.object().keys({
    latitude: Joi.number(),
    longitude: Joi.number(),
    zoneId: Joi.string(),
  }).unknown(true),
  body: Joi.object().unknown(true),
};

module.exports = {
  updateProfile,
  updateStatus,
  updateVehicle,
  uploadDocuments: optionalBody,
  getRideHistory: optionalQuery,
  acceptRide,
  startRide: rideIdParam,
  completeRide,
  cancelRide: {
    ...rideIdParam,
    body: Joi.object().keys({ reason: Joi.string().allow('', null) }).unknown(true),
  },
  getAvailableRides: optionalQuery,
  getMatchingSuggestions: optionalBody,
  getEarnings: optionalQuery,
  getEarningsDetails: optionalQuery,
  getPayoutHistory: optionalQuery,
  getReviews: optionalQuery,
  deleteDocument: documentIdParam,
  getNotifications: optionalQuery,
  markNotificationRead: documentIdParam,
  updateSettings: optionalBody,
  updateLocation,
  checkGeofence,
  getStatistics: optionalQuery,
};

// Enhanced driver routes use additional operation-specific validation keys.
// Keep these permissive at the boundary until each operation has a dedicated schema.
const enhancedRouteValidation = {
  uploadAvatar: optionalBody,
  partialUpdateProfile: optionalBody,
  getStatusHistory: optionalQuery,
  getRideById: rideIdParam,
  getRideTracking: rideIdParam,
  declineRide: { ...rideIdParam, body: Joi.object().unknown(true) },
  arriveRide: { ...rideIdParam, body: Joi.object().unknown(true) },
  rerouteRide: { ...rideIdParam, body: Joi.object().unknown(true) },
  updateWaitTime: { ...rideIdParam, body: Joi.object().unknown(true) },
  getEarningsChart: optionalQuery,
  requestPayout: optionalBody,
  addPayoutMethod: optionalBody,
  removePayoutMethod: { params: Joi.object().unknown(true) },
  partialUpdateVehicle: optionalBody,
  uploadVehiclePhotos: optionalBody,
  uploadVehicleDocuments: optionalBody,
  getVehicleDocuments: optionalQuery,
  deleteVehicleDocument: { params: Joi.object().unknown(true) },
  verifyVehicleDocument: { params: Joi.object().unknown(true), body: Joi.object().unknown(true) },
  getMatchingSuggestions: optionalQuery,
  getAvailabilityStats: optionalQuery,
  getLocationHistory: optionalQuery,
  batchUpdateLocations: optionalBody,
  getNearbyZones: optionalQuery,
  respondToReview: { params: Joi.object().unknown(true), body: Joi.object().unknown(true) },
  deleteReviewResponse: { params: Joi.object().unknown(true) },
  getDocumentById: { params: Joi.object().unknown(true) },
  renameDocument: { params: Joi.object().unknown(true), body: Joi.object().unknown(true) },
  shareDocument: { params: Joi.object().unknown(true), body: Joi.object().unknown(true) },
  partialUpdateSettings: optionalBody,
  deleteNotification: { params: Joi.object().unknown(true) },
  getPerformanceStats: optionalQuery,
  getComparisonStats: optionalQuery,
  getInsights: optionalQuery,
  addFleetVehicle: optionalBody,
  removeFleetVehicle: { params: Joi.object().unknown(true) },
  listDrivers: optionalQuery,
  exportDrivers: optionalQuery,
  getDriverById: { params: Joi.object().unknown(true) },
  verifyDriver: { params: Joi.object().unknown(true), body: Joi.object().unknown(true) },
  suspendDriver: { params: Joi.object().unknown(true), body: Joi.object().unknown(true) },
  activateDriver: { params: Joi.object().unknown(true), body: Joi.object().unknown(true) },
  deleteDriver: { params: Joi.object().unknown(true), body: Joi.object().unknown(true) },
};

Object.assign(module.exports, enhancedRouteValidation);
