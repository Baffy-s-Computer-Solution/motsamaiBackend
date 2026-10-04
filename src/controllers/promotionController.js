const promotionService = require('../services/promotionService');
const asyncHandler = require('../utils/asyncHandler');
const { sendResponse, sendPagedResponse } = require('../utils/response.util');
const { ApiResponse } = require('../utils/apiResponse');
const { NotFoundError, BadRequestError } = require('../utils/apiError');
const { Promotion, User } = require('../models');
const { Op, Sequelize } = require('sequelize');

/**
 * PromotionController - Handles discounts, campaigns, and user rewards
 */
class PromotionController {
  list = asyncHandler(async (req, res) => {
    const { page, limit, offset } = req.pagination || { page: 1, limit: 20, offset: 0 };
    const { count, rows } = await promotionService.getAll({ 
      ...req.query, 
      limit, 
      offset 
    });
    return sendPagedResponse(res, 200, rows, count, page, limit);
  });

  getById = asyncHandler(async (req, res) => {
    const promotion = await promotionService.getById(req.params.id);
    if (!promotion) throw new NotFoundError('Promotion');
    return sendResponse(res, 200, promotion);
  });

  getAvailable = asyncHandler(async (req, res) => {
    const now = new Date();
    const promotions = await Promotion.findAll({
      where: {
        is_active: true,
        [Op.and]: [
          { [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: now } }] },
          { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gte]: now } }] },
        ],
      },
      order: [['created_at', 'DESC']],
    });
    return sendResponse(res, 200, promotions);
  });

  validate = asyncHandler(async (req, res) => {
    const { code, amount } = req.body;
    const promotion = await Promotion.findOne({ where: { code, is_active: true } });
    if (!promotion) throw new NotFoundError('Promotion');
    const discount = promotion.discount_type === 'percent'
      ? (Number(amount || 0) * Number(promotion.discount_value)) / 100
      : Number(promotion.discount_value);
    const result = { promotion, discountAmount: discount, finalAmount: Math.max(Number(amount || 0) - discount, 0) };
    return sendResponse(res, 200, result, 'Code validated successfully');
  });

  apply = asyncHandler(async (req, res) => {
    const { code, rideId, amount } = req.body;
    const promotion = await Promotion.findOne({ where: { code, is_active: true } });
    if (!promotion) throw new NotFoundError('Promotion');
    const discount = promotion.discount_type === 'percent'
      ? (Number(amount || 0) * Number(promotion.discount_value)) / 100
      : Number(promotion.discount_value);
    const result = { promotionId: promotion.id, rideId, discountAmount: discount, finalAmount: Math.max(Number(amount || 0) - discount, 0) };
    return sendResponse(res, 200, result, 'Promotion applied to ride');
  });

  create = asyncHandler(async (req, res) => {
    const promotion = await promotionService.create(req.body);
    return res.status(201).json(new ApiResponse(201, promotion, 'Promotion campaign created'));
  });

  update = asyncHandler(async (req, res) => {
    const promotion = await promotionService.update(req.params.id, req.body);
    return sendResponse(res, 200, promotion, 'Promotion updated');
  });

  delete = asyncHandler(async (req, res) => {
    await promotionService.delete(req.params.id);
    return sendResponse(res, 200, null, 'Promotion deleted');
  });

  updateStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const promotion = await promotionService.update(req.params.id, { is_active: status === 'active' });
    return sendResponse(res, 200, promotion, `Promotion status set to ${status}`);
  });

  // User Specific History and Saving
  getUserHistory = asyncHandler(async (req, res) => {
    return sendResponse(res, 200, [], 'Promotion usage history requires usage tracking schema');
  });

  savePromotion = asyncHandler(async (req, res) => {
    const { promotionId } = req.body;
    const promotion = await Promotion.findByPk(promotionId);
    if (!promotion) throw new NotFoundError('Promotion');
    const user = await User.findByPk(req.user.id);
    const savedPromotions = Array.from(new Set([...(user.metadata?.savedPromotions || []), promotion.id]));
    await user.update({ metadata: { ...(user.metadata || {}), savedPromotions } });
    return sendResponse(res, 200, savedPromotions, 'Promotion saved');
  });

  unsavePromotion = asyncHandler(async (req, res) => {
    const user = await User.findByPk(req.user.id);
    const savedPromotions = (user.metadata?.savedPromotions || []).filter((id) => String(id) !== String(req.params.promotionId));
    await user.update({ metadata: { ...(user.metadata || {}), savedPromotions } });
    return sendResponse(res, 200, null, 'Promotion removed from saved');
  });

  getSavedPromotions = asyncHandler(async (req, res) => {
    const user = await User.findByPk(req.user.id);
    const ids = user.metadata?.savedPromotions || [];
    const saved = ids.length ? await Promotion.findAll({ where: { id: { [Op.in]: ids } } }) : [];
    return sendResponse(res, 200, saved);
  });

  // Analytics
  getStatistics = asyncHandler(async (req, res) => {
    const stats = await Promotion.findAll({
      attributes: ['is_active', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
      group: ['is_active'],
      raw: true,
    });
    return sendResponse(res, 200, stats);
  });

  getAnalytics = asyncHandler(async (req, res) => {
    const promotion = await Promotion.findByPk(req.params.id);
    if (!promotion) throw new NotFoundError('Promotion');
    return sendResponse(res, 200, { promotion, usageTracking: 'not_configured' });
  });

  getPerformanceComparison = asyncHandler(async (req, res) => {
    const promotions = await Promotion.findAll({ order: [['created_at', 'DESC']] });
    return sendResponse(res, 200, promotions);
  });
}

module.exports = new PromotionController();
