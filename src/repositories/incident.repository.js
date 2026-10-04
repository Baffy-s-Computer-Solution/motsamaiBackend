const BaseRepository = require('./base.repository');
const { Incident } = require('../models');

class IncidentRepository extends BaseRepository {
  constructor() {
    super(Incident);
  }

  async findOpenIncidents() {
    return await this.model.findAll({ where: { status: 'open' } });
  }
}

module.exports = new IncidentRepository();