const BaseRepository = require('./base.repository');
const { User } = require('../models');

class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  async findByEmail(email) {
    return await this.model.findOne({ where: { email } });
  }

  async findByPhone(phone) {
    return await this.model.findOne({ where: { phone } });
  }
}

module.exports = new UserRepository();