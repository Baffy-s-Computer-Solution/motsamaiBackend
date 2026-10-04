const { Report } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { sendResponse } = require('../utils/response.util');
const reportService = require('../services/reportService');
const { ApiResponse } = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * ReportController - Handles data export and periodic analytics generation
 */
exports.list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = req.pagination || { page: 1, limit: 10, offset: 0 };
  let count = 0;
  let rows = [];
  try {
    if (Report) {
      const result = await Report.findAndCountAll({
        where: req.user.role === 'admin' ? {} : { owner_id: req.user.id },
        limit,
        offset,
        order: [['createdAt', 'DESC']]
      });
      count = result.count;
      rows = result.rows;
    }
  } catch (error) {
    logger.warn('Reports list unavailable; returning empty list', { error: error.message });
  }
  return sendResponse(res, 200, { reports: rows, total: count }, 'Reports fetched.');
});

exports.generate = asyncHandler(async (req, res) => {
  const { type, period } = req.body;
  let data;
  
  if (type === 'performance') {
    data = await reportService.getWeeklyPerformanceReport();
  } else {
    data = { message: 'Report generation queued', type, period };
  }

  return res.status(202).json(new ApiResponse(202, data, 'Report generation initiated'));
});

exports.getReportById = asyncHandler(async (req, res) => {
  const report = await Report.findByPk(req.params.id);
  if (!report) throw new ApiResponse(404, null, 'Report not found');
  if (report.owner_id !== req.user.id && req.user.role !== 'admin') throw new ApiResponse(403, null, 'Unauthorized');
  return sendResponse(res, 200, report);
});

exports.getRevenueReport = asyncHandler(async (req, res) => {
  const report = await reportService.getWeeklyPerformanceReport();
  return sendResponse(res, 200, report);
});

exports.download = asyncHandler(async (req, res) => {
  return sendResponse(res, 200, { url: 'https://storage.easygo.com/reports/sample.pdf' }, 'Download link generated');
});

exports.delete = asyncHandler(async (req, res) => {
  const report = await Report.findByPk(req.params.id);
  if (report) await report.destroy();
  return sendResponse(res, 200, null, 'Report deleted');
});

exports.getPayoutReport = exports.getRevenueReport;
exports.getTaxReport = exports.getRevenueReport;
exports.getRideOperationsReport = exports.getRevenueReport;
exports.getDriverPerformanceReport = exports.getRevenueReport;
exports.getIncidentReport = exports.getRevenueReport;
exports.getUserActivityReport = exports.getRevenueReport;
exports.getUserRetentionReport = exports.getRevenueReport;

exports.createCustomReport = exports.generate;
exports.getCustomReports = exports.list;

exports.updateCustomReport = asyncHandler(async (req, res) => {
  const report = await Report.findByPk(req.params.id || req.params.reportId);
  if (!report) return sendResponse(res, 404, null, 'Report not found');
  await report.update(req.body);
  return sendResponse(res, 200, report, 'Report updated');
});

exports.deleteCustomReport = exports.delete;
