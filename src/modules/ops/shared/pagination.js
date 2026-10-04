const intFromQuery = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parsePagination = (query) => {
  const page = intFromQuery(query.page, Number(process.env.OPS_DEFAULT_PAGE || 1));
  const limit = Math.min(
    intFromQuery(query.limit, Number(process.env.OPS_DEFAULT_LIMIT || 20)),
    Number(process.env.OPS_MAX_LIMIT || 100),
  );
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

module.exports = { parsePagination };
