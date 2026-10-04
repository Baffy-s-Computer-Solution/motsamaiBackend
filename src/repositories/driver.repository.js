const BaseRepository = require('./base.repository');
const { Driver } = require('../models');

class DriverRepository extends BaseRepository {
  constructor() {
    super(Driver);
  }

  async findOnlineDrivers() {
    return await this.model.findAll({ where: { is_online: true } });
  }
}

module.exports = new DriverRepository();