const BaseService = require('./base.service');
const incidentRepository = require('../repositories/incident.repository');

class IncidentService extends BaseService {
  constructor() {
    super(incidentRepository);
  }

  async reportIncident(data) {
    return await this.create({
      ...data,
      status: 'open',
      reported_at: new Date()
    });
  }

  async resolveIncident(id, resolutionData) {
    return await this.update(id, { ...resolutionData, status: 'resolved', resolved_at: new Date() });
  }

  /**
   * Escalates an incident to high priority
   */
  async escalateIncident(id, reason) {
    return await this.update(id, {
      severity: 'critical',
      status: 'investigating',
      metadata: { escalationReason: reason, escalatedAt: new Date() }
    });
  }

  async addComment(incidentId, commentData) {
    const incident = await this.getById(incidentId);
    const comments = incident.metadata?.comments || [];
    const newComment = { ...commentData, id: Date.now(), created_at: new Date() };
    comments.push(newComment);
    
    await this.update(incidentId, { metadata: { ...incident.metadata, comments } });
    return newComment;
  }

  async getComments(incidentId, userRole) {
    const incident = await this.getById(incidentId);
    let comments = incident.metadata?.comments || [];
    // Only admins see internal investigative comments
    if (userRole !== 'admin') {
      comments = comments.filter(c => c.visibility !== 'internal');
    }
    return comments;
  }
}

module.exports = new IncidentService();