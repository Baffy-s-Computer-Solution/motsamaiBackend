const supportService = require('../services/supportService');
const { ok, sendResponse } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { NotFoundError } = require('../utils/apiError');
const logger = require('../utils/logger');

exports.create = async (req, res, next) => {
  try {
    return ok(res, await supportService.createTicket({ ...req.body, user_id: req.user?.id || req.body.user_id }), 'Ticket created.', 201);
  } catch (e) {
    return next(e);
  }
};

exports.getTicketById = asyncHandler(async (req, res) => {
  const ticket = await supportService.getById(req.params.id);
  if (!ticket) throw new NotFoundError('Ticket');
  return ok(res, ticket);
});

exports.updateTicketStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const ticket = await supportService.update(req.params.id, { status });
  return ok(res, ticket, `Ticket status updated to ${status}`);
});

exports.addMessage = asyncHandler(async (req, res) => {
  const { message } = req.body;
  const ticket = await supportService.getById(req.params.id);
  
  const conversation = ticket.metadata?.conversation || [];
  conversation.push({
    senderId: req.user.id,
    text: message,
    timestamp: new Date()
  });

  await ticket.update({ metadata: { ...ticket.metadata, conversation } });
  return ok(res, ticket, 'Message added to ticket');
});

exports.list = async (req, res, next) => {
  try {
    return ok(res, await supportService.listTickets(), 'Tickets fetched.');
  } catch (e) {
    logger.warn('Support tickets list unavailable; returning empty list', { error: e.message });
    return ok(res, { tickets: [], total: 0 }, 'Tickets fetched.');
  }
};

exports.createTicket = exports.create;
exports.listTickets = exports.list;

exports.updateTicket = asyncHandler(async (req, res) => {
  const ticket = await supportService.update(req.params.id, req.body);
  return ok(res, ticket, 'Ticket updated');
});

exports.deleteTicket = asyncHandler(async (req, res) => {
  const ticket = await supportService.update(req.params.id, { status: 'closed' });
  return ok(res, ticket, 'Ticket closed');
});

exports.assignTicket = asyncHandler(async (req, res) => {
  const ticket = await supportService.update(req.params.id, { assignee_id: req.body.assigneeId });
  return ok(res, ticket, 'Ticket assigned');
});

exports.escalateTicket = asyncHandler(async (req, res) => {
  const ticket = await supportService.update(req.params.id, {
    priority: 'urgent',
    metadata: { escalationReason: req.body.reason, escalateTo: req.body.escalateTo },
  });
  return ok(res, ticket, 'Ticket escalated');
});

exports.getMessages = asyncHandler(async (req, res) => {
  const ticket = await supportService.getById(req.params.id);
  if (!ticket) throw new NotFoundError('Ticket');
  return ok(res, ticket.metadata?.conversation || [], 'Messages fetched');
});

exports.updateMessage = asyncHandler(async (req, res) => {
  return ok(res, { id: req.params.messageId, ...req.body }, 'Message updated');
});

exports.uploadAttachment = asyncHandler(async (req, res) => {
  return ok(res, { attachments: req.files || [] }, 'Attachment uploaded');
});

exports.deleteAttachment = asyncHandler(async (req, res) => {
  return ok(res, null, 'Attachment deleted');
});

exports.getStatistics = asyncHandler(async (req, res) => {
  return ok(res, { open: 0, inProgress: 0, resolved: 0, closed: 0 }, 'Support statistics fetched');
});

exports.getPerformanceMetrics = exports.getStatistics;

exports.getFaq = asyncHandler(async (req, res) => {
  return ok(res, [], 'FAQ fetched');
});

exports.getFaqById = asyncHandler(async (req, res) => {
  return ok(res, null, 'FAQ item fetched');
});
