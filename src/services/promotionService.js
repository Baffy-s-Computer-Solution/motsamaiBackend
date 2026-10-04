const BaseService = require('./base.service');
const promotionRepository = require('../repositories/promotion.repository');
const { redisClient } = require('../config/redis');

class PromotionService extends BaseService {
  constructor() {
    super(promotionRepository);
  }

  async validatePromotion(code) {
    const cacheKey = `promo:${code}`;
    
    // Try Redis first
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Fallback to DB
    const promo = await this.repository.findActiveByCode(code);
    if (!promo) return null;

    // Cache for 10 minutes
    await redisClient.set(cacheKey, JSON.stringify(promo), {
      EX: 600
    });

    return promo;
  }

  async listPromotions() {
    return await this.getAll({ order: [['created_at', 'DESC']] });
  }

  async createPromotion(data) {
    return await this.create(data);
  }
}

module.exports = new PromotionService();
