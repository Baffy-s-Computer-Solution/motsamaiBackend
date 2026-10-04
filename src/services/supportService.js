const BaseService = require('./base.service');
const supportRepository = require('../repositories/support.repository');
const { v4: uuidv4 } = require('uuid');

class SupportService extends BaseService {
  constructor() {
    super(supportRepository);
  }

  /**
   * Creates a new ticket with a generated tracking number
   */
  async createTicket(data) {
    const trackingNumber = `TKT-${new Date().getFullYear()}-${uuidv4().split('-')[0].toUpperCase()}`;
    return await this.create({
      ...data,
      tracking_number: trackingNumber,
      status: 'open'
    });
  }

  /**
   * Fetches all tickets with pagination handled by repository/controller
   */
  async listTickets(query = {}) {
    return await this.getAll(query);
  }

  /**
   * Escalates a ticket to a specific team
   */
  async escalateTicket(id, reason, team = 'management') {
    return await this.update(id, {
      priority: 'urgent',
      metadata: { escalationReason: reason, escalatedTo: team, escalatedAt: new Date() }
    });
  }
}

module.exports = new SupportService();