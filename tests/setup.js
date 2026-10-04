if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const { sequelize } = require('../src/models');
const logger = require('../src/utils/logger');
const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL);

/**
 * Global Jest Setup
 * Handles database synchronization and connection management for integration tests.
 */

beforeAll(async () => {
  if (!hasTestDatabase) return;

  try {
    // Never force-reset a shared Supabase or Render database from Jest.
    await sequelize.sync({ alter: false });
  } catch (error) {
    logger.error('Test DB Sync Error:', error);
    throw error;
  }
});

afterAll(async () => {
  if (!hasTestDatabase) return;

  // Close database connection to allow Jest to exit gracefully
  await sequelize.close();
});

// You can add global mocks or environment overrides here