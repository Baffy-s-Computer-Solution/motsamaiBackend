const supportService = require('../../../src/services/supportService');
const supportRepository = require('../../../src/repositories/support.repository');

jest.mock('../../../src/repositories/support.repository');

describe('SupportService Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createTicket', () => {
    it('should create a ticket with a generated tracking number', async () => {
      const ticketData = {
        subject: 'Payment failed',
        description: 'M-Pesa transaction didn\'t reflect',
        user_id: 'user_123',
        category: 'payment',
        priority: 'high'
      };

      supportRepository.create.mockResolvedValue({
        id: 'tkt_123',
        ...ticketData,
        tracking_number: 'TKT-2024-XXXX',
        status: 'open'
      });

      const result = await supportService.createTicket(ticketData);

      expect(result.tracking_number).toMatch(/TKT-\d{4}-[A-Z0-9]+/);
      expect(supportRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'open',
          tracking_number: expect.stringMatching(/TKT-\d{4}-[A-Z0-9]+/)
        })
      );
    });
  });

  describe('escalateTicket', () => {
    it('should update ticket priority to urgent and add escalation metadata', async () => {
      const ticketId = 'tkt_123';
      const reason = 'High value customer';
      const team = 'finance_leads';

      supportRepository.findById.mockResolvedValue({ id: ticketId });
      supportRepository.update.mockResolvedValue({
        id: ticketId,
        priority: 'urgent',
        metadata: { escalationReason: reason, escalatedTo: team }
      });

      const result = await supportService.escalateTicket(ticketId, reason, team);

      expect(result.priority).toBe('urgent');
      expect(supportRepository.update).toHaveBeenCalledWith(
        ticketId,
        expect.objectContaining({
          priority: 'urgent',
          metadata: expect.objectContaining({
            escalationReason: reason,
            escalatedTo: team
          })
        })
      );
    });
  });
});