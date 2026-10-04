const BaseService = require('./base.service');
const userRepository = require('../repositories/user.repository');
const { BadRequestException } = require('../exceptions/api.exception');

class UserService extends BaseService {
  constructor() {
    super(userRepository);
  }

  async updateProfile(userId, updateData) {
    // Prevent sensitive fields from being updated via standard profile update
    const { password_hash, role, ...safeData } = updateData;
    return await this.update(userId, safeData);
  }

  async getUserByEmail(email) {
    return await this.repository.findByEmail(email);
  }
}

module.exports = new UserService();