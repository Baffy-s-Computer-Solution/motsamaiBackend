/**
 * Standard API Response Handlers
 */
const sendResponse = (res, statusCode, data, message = 'Success') => {
  res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const sendPagedResponse = (res, statusCode, rows, count, page, limit, message = 'Success') => {
  res.status(statusCode).json({
    success: true,
    message,
    data: rows,
    pagination: {
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / limit),
      limit: parseInt(limit),
    },
  });
};

module.exports = { sendResponse, sendPagedResponse };