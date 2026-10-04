const BaseRepository = require('./base.repository');
const { Promotion } = require('../models');
const { Op } = require('sequelize');

class PromotionRepository extends BaseRepository {
  constructor() {
    super(Promotion);
  }

  async findActiveByCode(code) {
    return await this.model.findOne({
      where: {
        code,
        is_active: true,
        expires_at: { [Op.gt]: new Date() }
      }
    });
  }
}

module.exports = new PromotionRepository();