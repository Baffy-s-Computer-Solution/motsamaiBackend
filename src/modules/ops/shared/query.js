const parseDateRange = (query) => ({
  from: query.from ? new Date(query.from) : null,
  to: query.to ? new Date(query.to) : null,
});

module.exports = { parseDateRange };
