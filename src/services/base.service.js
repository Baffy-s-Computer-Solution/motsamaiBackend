const { NotFoundException } = require('../exceptions/api.exception');

/**
 * Base Service class for business logic
 */
class BaseService {
  constructor(repository) {
    this.repository = repository;
  }

  async getAll(query = {}) {
    return await this.repository.findAll(query);
  }

  async getById(id) {
    const item = await this.repository.findById(id);
    if (!item) {
      throw new NotFoundException(`Resource with ID ${id} not found`);
    }
    return item;
  }

  async create(data) {
    return await this.repository.create(data);
  }

  async update(id, data) {
    const item = await this.repository.update(id, data);
    if (!item) {
      throw new NotFoundException(`Resource with ID ${id} not found`);
    }
    return item;
  }

  async delete(id) {
    const success = await this.repository.delete(id);
    if (!success) {
      throw new NotFoundException(`Resource with ID ${id} not found`);
    }
    return success;
  }
}

module.exports = BaseService;