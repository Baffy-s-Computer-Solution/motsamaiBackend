const rideService = require('../services/rideService');
const asyncHandler = require('../utils/asyncHandler');
const { sendResponse, sendPagedResponse } = require('../utils/response.util');

exports.createRide = asyncHandler(async (req, res) => {
  const rideData = { ...req.body, rider_id: req.user.id };
  const ride = await rideService.create(rideData);
  return sendResponse(res, 201, ride, 'Ride created successfully');
});

exports.getRide = asyncHandler(async (req, res) => {
  const ride = await rideService.getById(req.params.id);
  return sendResponse(res, 200, ride);
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const ride = await rideService.updateRideStatus(req.params.id, status);
  return sendResponse(res, 200, ride, `Ride status updated to ${status}`);
});

exports.getMyRides = asyncHandler(async (req, res) => {
  const { page, limit, offset } = req.pagination;
  const { count, rows } = await rideService.repository.findAndCountAll({
    where: { rider_id: req.user.id },
    limit,
    offset,
    order: [['created_at', 'DESC']]
  });
  return sendPagedResponse(res, 200, rows, count, page, limit);
});