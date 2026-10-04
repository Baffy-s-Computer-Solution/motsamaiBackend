const repository = require('./repository');
const { parsePagination } = require('../shared/pagination');
const { parseDateRange } = require('../shared/query');

const listTrips = async (query) => {
  const { page, limit, offset } = parsePagination(query);
  const { from, to } = parseDateRange(query);
  const status = query.status ? String(query.status).trim() : '';

  const result = await repository.listTrips({ status, from, to, limit, offset });
  return {
    items: result.rows,
    page,
    limit,
    total: result.count,
    totalPages: Math.ceil(result.count / limit) || 1,
  };
};

module.exports = { listTrips };
