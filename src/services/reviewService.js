const BaseService = require('./base.service');
const { Review, Driver, sequelize } = require('../models');
const { Sequelize } = require('sequelize');

class ReviewService extends BaseService {
  constructor() {
    super(Review);
  }

  /**
   * Creates a review and updates the target's aggregate rating
   */
  async createReview(data) {
    const t = await sequelize.transaction();
    try {
      const review = await Review.create(data, { transaction: t });

      // If target is a driver, update their average rating and total reviews
      if (data.target_type === 'driver' || data.reviewer_role === 'rider') {
        await this._updateDriverRating(data.target_id, t);
      }

      await t.commit();
      return review;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  /**
   * Recalculates and persists the average rating for a driver
   * @private
   */
  async _updateDriverRating(driverId, transaction) {
    const stats = await Review.findOne({
      where: { target_id: driverId, target_type: 'driver' },
      attributes: [
        [Sequelize.fn('AVG', Sequelize.col('rating')), 'avgRating'],
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'totalReviews']
      ],
      raw: true,
      transaction
    });

    await Driver.update(
      {
        rating: parseFloat(stats.avgRating || 0).toFixed(2),
        metadata: sequelize.literal(`jsonb_set(metadata, '{total_reviews}', '${stats.totalReviews || 0}')`)
      },
      { 
        where: { id: driverId },
        transaction 
      }
    );
  }
}

module.exports = new ReviewService();