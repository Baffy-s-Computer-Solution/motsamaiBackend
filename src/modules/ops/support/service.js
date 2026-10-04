const repository = require('./repository');
const { parsePagination } = require('../shared/pagination');

const listTickets = async (query) => {
  const { page, limit, offset } = parsePagination(query);
  const status = query.status ? String(query.status).trim() : '';
  const priority = query.priority ? String(query.priority).trim() : '';
  const search = query.search ? String(query.search).trim() : '';

  const result = await repository.listTickets({ status, priority, search, limit, offset });
  return {
    items: result.rows,
    page,
    limit,
    total: result.count,
    totalPages: Math.ceil(result.count / limit) || 1,
  };
};

module.exports = { listTickets };
