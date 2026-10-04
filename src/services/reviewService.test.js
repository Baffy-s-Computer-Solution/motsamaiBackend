const reviewService = require('../../../src/services/reviewService');
const { Review, Driver, sequelize } = require('../../../src/models');

jest.mock('../../../src/models', () => ({
  Review: {
    create: jest.fn(),
    findOne: jest.fn(),
  },
  Driver: {
    update: jest.fn(),
  },
  sequelize: {
    transaction: jest.fn(() => ({
      commit: jest.fn(),
      rollback: jest.fn(),
    })),
    literal: jest.fn(val => val),
  },
  Sequelize: {
    fn: jest.fn(),
    col: jest.fn(),
  }
}));

describe('ReviewService Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createReview & Rating Aggregation', () => {
    it('should create a review and update driver rating when reviewer is a rider', async () => {
      const reviewData = {
        target_id: 'drv_123',
        target_type: 'driver',
        reviewer_id: 'rid_456',
        reviewer_role: 'rider',
        rating: 5,
        comment: 'Great service'
      };

      Review.create.mockResolvedValue({ id: 'rev_1', ...reviewData });
      
      // Mock aggregation result
      Review.findOne.mockResolvedValue({
        avgRating: 4.5,
        totalReviews: 10
      });

      const result = await reviewService.createReview(reviewData);

      expect(Review.create).toHaveBeenCalled();
      expect(Review.findOne).toHaveBeenCalledWith(expect.objectContaining({
        where: { target_id: 'drv_123', target_type: 'driver' }
      }));
      expect(Driver.update).toHaveBeenCalledWith(
        expect.objectContaining({
          rating: "4.50"
        }),
        expect.any(Object)
      );
      expect(result.id).toBe('rev_1');
    });

    it('should rollback transaction if driver update fails', async () => {
      const reviewData = { target_type: 'driver', reviewer_role: 'rider', target_id: 'drv_fail' };
      const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
      
      sequelize.transaction.mockResolvedValue(mockTransaction);
      Review.create.mockResolvedValue({ id: 'rev_fail' });
      Review.findOne.mockRejectedValue(new Error('DB Error'));

      await expect(reviewService.createReview(reviewData)).rejects.toThrow('DB Error');
      
      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockTransaction.commit).not.toHaveBeenCalled();
    });
  });
});