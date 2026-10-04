const BaseRepository = require('./base.repository');
const { Fleet } = require('../models');

class FleetRepository extends BaseRepository {
  constructor() {
    super(Fleet);
  }

  async findByOwner(ownerId) {
    return await this.model.findAll({ where: { owner_id: ownerId } });
  }
}

module.exports = new FleetRepository();