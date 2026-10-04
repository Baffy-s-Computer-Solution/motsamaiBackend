/**
 * Master Seeder - Run all database seeders in sequence
 * Version: 2.0.0
 *
 * @module seeders/index
 * @description Orchestrates execution of all seed files in correct order
 *
 * Usage:
 *   node src/seeders/index.js
 *   npm run seed:all
 */

const path = require('path');
const logger = require('../utils/logger');
const { sequelize, testConnection } = require('../config/database');

/**
 * Run all seeders in sequence
 * @async
 * @returns {Promise<void>}
 */
async function runAllSeeders() {
  const startTime = Date.now();

  try {
    // Test database connection first
    logger.info('\n🔌 Testing database connection...');
    await testConnection();

    logger.info('\n' + '='.repeat(80));
    logger.info('🌱 DATABASE SEEDING PROCESS STARTED');
    logger.info('='.repeat(80));

    const seeders = [
      { name: 'Users', file: './01-users.seeder.js' },
      { name: 'Drivers & Vehicles', file: './02-drivers-vehicles.seeder.js' },
      { name: 'Rides & Payments', file: './03-rides-payments.seeder.js' }
    ];

    for (const seeder of seeders) {
      try {
        logger.info(`\n🚀 Running ${seeder.name} seeder...`);
        const { default: seedFunction } = await import(seeder.file);

        // Get the main export function (usually named like seedUsers, seedDriversAndVehicles, etc.)
        const seederModule = require(path.join(__dirname, seeder.file));
        const functionsInModule = Object.keys(seederModule);
        const seedFunction_fn = functionsInModule[0]; // Get first exported function

        if (seederModule[seedFunction_fn]) {
          await seederModule[seedFunction_fn]();
          logger.info(`✅ ${seeder.name} seeding completed successfully`);
        }
      } catch (error) {
        logger.error(`❌ ${seeder.name} seeding failed: ${error.message}`);
        throw error;
      }
    }

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

    logger.info('\n' + '='.repeat(80));
    logger.info('✨ DATABASE SEEDING COMPLETED SUCCESSFULLY');
    logger.info('='.repeat(80));
    logger.info(`\n⏱️  Total time: ${elapsedTime}s`);
    logger.info('\n📊 Database Status:');
    logger.info('  ✅ Users seeded');
    logger.info('  ✅ Drivers & Vehicles seeded');
    logger.info('  ✅ Rides & Payments seeded');
    logger.info('\n🎉 Your database is ready for development and testing!');
    logger.info('\n🔐 Test Credentials:');




  } catch (error) {
    logger.error('\n' + '='.repeat(80));
    logger.error('💥 DATABASE SEEDING FAILED');
    logger.error('='.repeat(80));
    logger.error(`\nError: ${error.message}`);
    logger.error('\nPlease check:');
    logger.error('  1. Database connection is working');
    logger.error('  2. All required models are properly initialized');
    logger.error('  3. Database credentials are correct in .env file');

    process.exit(1);
  } finally {
    try {
      await sequelize.close();
      logger.info('\n✅ Database connection closed');
    } catch (err) {
      logger.warn('⚠️  Could not close database connection:', err.message);
    }
  }
}

// Run if executed directly
if (require.main === module) {
  runAllSeeders()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { runAllSeeders };
