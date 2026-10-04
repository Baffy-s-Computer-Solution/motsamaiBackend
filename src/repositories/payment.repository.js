const BaseRepository = require('./base.repository');
const { Payment } = require('../models');

class PaymentRepository extends BaseRepository {
  constructor() {
    super(Payment);
  }

  async findByTransactionId(transactionId) {
    return await this.model.findOne({ where: { transaction_id: transactionId } });
  }
}

module.exports = new PaymentRepository();