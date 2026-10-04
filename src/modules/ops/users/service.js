const repository = require('./repository');
const { parsePagination } = require('../shared/pagination');

const listUsers = async (query) => {
  const { page, limit, offset } = parsePagination(query);
  const search = query.search ? String(query.search).trim() : '';
  const result = await repository.listUsers({ search, limit, offset });
  return {
    items: result.rows,
    page,
    limit,
    total: result.count,
    totalPages: Math.ceil(result.count / limit) || 1,
  };
};

module.exports = { listUsers };
