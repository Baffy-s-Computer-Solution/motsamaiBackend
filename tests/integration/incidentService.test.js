const incidentService = require('../../../src/services/incidentService');
const incidentRepository = require('../../../src/repositories/incident.repository');

jest.mock('../../../src/repositories/incident.repository');

describe('IncidentService Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('reportIncident', () => {
    it('should create an incident with status "open" and current timestamp', async () => {
      const data = { type: 'accident', severity: 'high', description: 'Fender bender' };
      incidentRepository.create.mockResolvedValue({ ...data, status: 'open', reported_at: new Date() });

      const result = await incidentService.reportIncident(data);

      expect(result.status).toBe('open');
      expect(incidentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'open',
          reported_at: expect.any(Date)
        })
      );
    });
  });

  describe('resolveIncident', () => {
    it('should mark incident as resolved with resolution details', async () => {
      const incidentId = 'inc_123';
      const resolutionData = { notes: 'Settled between parties' };

      incidentRepository.findById.mockResolvedValue({ id: incidentId });
      incidentRepository.update.mockResolvedValue({ id: incidentId, status: 'resolved' });

      await incidentService.resolveIncident(incidentId, resolutionData);

      expect(incidentRepository.update).toHaveBeenCalledWith(
        incidentId,
        expect.objectContaining({
          status: 'resolved',
          resolved_at: expect.any(Date)
        })
      );
    });
  });

  describe('escalateIncident', () => {
    it('should set severity to critical and status to investigating', async () => {
      const incidentId = 'inc_123';
      incidentRepository.findById.mockResolvedValue({ id: incidentId });
      incidentRepository.update.mockResolvedValue({ id: incidentId, severity: 'critical' });

      await incidentService.escalateIncident(incidentId, 'Police involvement required');

      expect(incidentRepository.update).toHaveBeenCalledWith(incidentId, expect.objectContaining({
        severity: 'critical',
        status: 'investigating'
      }));
    });
  });
});