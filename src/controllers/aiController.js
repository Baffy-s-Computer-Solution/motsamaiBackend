const { requestAI } = require('../services/aiGatewayService');

const forward = (path, selectPayload = (body) => body) => async (req, res, next) => {
  try {
    const result = await requestAI(path, {
      ...selectPayload(req.body || {}),
      userId: req.userId,
      role: req.user?.role,
    }, req.requestId);
    return res.status(200).json({ success: true, data: result?.data ?? result, requestId: req.requestId });
  } catch (error) {
    if (error.code === 'AI_SERVICE_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, message: 'AI service is temporarily unavailable', code: error.code, requestId: req.requestId });
    }
    if (error.response) {
      return res.status(502).json({ success: false, message: 'AI service request failed', requestId: req.requestId });
    }
    return next(error);
  }
};

module.exports = {
  assistant: forward('/api/v1/nlp/', (body) => ({ message: body.message, context: body.context, userId: body.userId, role: body.role })),
  route: forward('/api/v1/route-optimize/', (body) => ({ pickup: body.pickup, dropoff: body.dropoff, userId: body.userId, role: body.role })),
  safety: forward('/api/v1/risk-score/', (body) => ({ rideId: body.rideId, event: body.event, metadata: body.metadata, userId: body.userId, role: body.role })),
};
