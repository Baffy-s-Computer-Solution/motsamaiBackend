const BaseRepository = require('./base.repository');
const { Report } = require('../models');

class ReportRepository extends BaseRepository {
  constructor() {
    super(Report);
  }

  async findByOwner(ownerId, options = {}) {
    return await this.model.findAll({ where: { owner_id: ownerId }, ...options });
  }
}

module.exports = new ReportRepository();