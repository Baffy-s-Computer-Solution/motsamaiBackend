const BaseRepository = require('./base.repository');
const { SupportTicket } = require('../models');

class SupportRepository extends BaseRepository {
  constructor() {
    super(SupportTicket);
  }

  async findOpenTicketsByUser(userId) {
    return await this.model.findAll({
      where: {
        user_id: userId,
        status: ['open', 'in-progress']
      }
    });
  }
}

module.exports = new SupportRepository();