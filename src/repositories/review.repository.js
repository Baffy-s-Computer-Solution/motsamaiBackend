const BaseRepository = require('./base.repository');
const { Review } = require('../models');
const { Sequelize } = require('sequelize');

class ReviewRepository extends BaseRepository {
  constructor() {
    super(Review);
  }

  async getAverageRating(driverId) {
    const result = await this.model.findOne({
      where: { driver_id: driverId },
      attributes: [
        [Sequelize.fn('AVG', Sequelize.col('rating')), 'avgRating'],
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'totalReviews']
      ],
      raw: true
    });
    return result;
  }
}

module.exports = new ReviewRepository();