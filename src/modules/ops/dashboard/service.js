const repository = require('./repository');

const getAdminDashboard = async () => {
  const counts = await repository.getSummaryCounts();
  return {
    counts,
    generatedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  };
};

module.exports = { getAdminDashboard };
