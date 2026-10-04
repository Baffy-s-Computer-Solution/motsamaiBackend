/**
 * Users Seeder - Populate database with sample users
 * Version: 2.0.0
 *
 * @module seeders/01-users
 * @description Creates sample users with different roles for testing
 *
 * Usage:
 *   node src/seeders/01-users.seeder.js
 *   OR
 *   npm run seed:users
 */

const bcrypt = require('bcryptjs');
const { sequelize, testConnection } = require('../config/database');
const { User } = require('../models');
const logger = require('../utils/logger');

/**
 * Generate sample user data with hashed passwords
 * @returns {Promise<Array>} Array of user objects ready for insertion
 */
async function generateUsers() {
  const seedPassword = process.env.SEED_DEFAULT_PASSWORD;
  if (!seedPassword) {
    throw new Error('Set SEED_DEFAULT_PASSWORD before creating sample users.');
  }

  const salt = await bcrypt.genSalt(12);

  const users = [
    // Admin users
    {
      id: 1,
      email: 'admin@motsamai.test',
      phone: '+1234567890',
      first_name: 'Admin',
      last_name: 'System',
      password_hash: await bcrypt.hash(seedPassword, salt),
      role: 'admin',
      is_active: true,
      is_verified: true,
      email_verified_at: new Date(),
      phone_verified_at: new Date(),
      profile_picture: 'https://via.placeholder.com/150?text=Admin',
      preferences: { language: 'en', currency: 'USD', notifications: true },
      metadata: { department: 'Engineering', permissions: ['manage_users', 'view_analytics'] }
    },
    {
      id: 2,
      email: 'support@motsamai.test',
      phone: '+1234567891',
      first_name: 'Support',
      last_name: 'Team',
      password_hash: await bcrypt.hash(seedPassword, salt),
      role: 'support',
      is_active: true,
      is_verified: true,
      email_verified_at: new Date(),
      phone_verified_at: new Date(),
      profile_picture: 'https://via.placeholder.com/150?text=Support',
      preferences: { language: 'en', currency: 'USD', notifications: true },
      metadata: { department: 'Customer Support', maxTickets: 50 }
    },

    // Rider users
    ...Array.from({ length: 10 }, (_, i) => ({
      id: 3 + i,
      email: `rider${i + 1}@motsamai.test`,
      phone: `+123456789${String(i).padStart(2, '0')}`,
      first_name: `Rider`,
      last_name: `User${i + 1}`,
      password_hash: bcrypt.hashSync(seedPassword, salt),
      role: 'rider',
      is_active: true,
      is_verified: true,
      email_verified_at: new Date(),
      phone_verified_at: new Date(),
      profile_picture: `https://via.placeholder.com/150?text=Rider${i + 1}`,
      preferences: { language: 'en', currency: 'USD', notifications: true, paymentMethod: 'card' },
      metadata: {
        preferredDrivers: [],
        blacklistedDrivers: [],
        emergencyContacts: [{ name: `Contact ${i + 1}`, phone: `+987654321${String(i).padStart(2, '0')}` }],
        lastLogin: new Date()
      }
    })),

    // Driver users
    ...Array.from({ length: 10 }, (_, i) => ({
      id: 13 + i,
      email: `driver${i + 1}@motsamai.test`,
      phone: `+234567890${String(i).padStart(2, '0')}`,
      first_name: `Driver`,
      last_name: `User${i + 1}`,
      password_hash: bcrypt.hashSync(seedPassword, salt),
      role: 'driver',
      is_active: true,
      is_verified: true,
      email_verified_at: new Date(),
      phone_verified_at: new Date(),
      profile_picture: `https://via.placeholder.com/150?text=Driver${i + 1}`,
      preferences: { language: 'en', currency: 'USD', notifications: true, earningsAlert: true },
      metadata: {
        licenseNumber: `LICENSE${String(i + 1).padStart(5, '0')}`,
        documents: { driverLicense: true, insuranceCertificate: true, backgroundCheck: true },
        preferredAreas: ['Downtown', 'Suburbs', 'Airport'],
        bankAccount: { accountNumber: `ACCT${String(i + 1).padStart(8, '0')}`, bankName: 'Sample Bank' }
      }
    })),

    // Fleet owner users
    ...Array.from({ length: 3 }, (_, i) => ({
      id: 23 + i,
      email: `fleet${i + 1}@motsamai.test`,
      phone: `+345678901${String(i).padStart(2, '0')}`,
      first_name: `Fleet`,
      last_name: `Owner${i + 1}`,
      password_hash: bcrypt.hashSync(seedPassword, salt),
      role: 'fleet_owner',
      is_active: true,
      is_verified: true,
      email_verified_at: new Date(),
      phone_verified_at: new Date(),
      profile_picture: `https://via.placeholder.com/150?text=Fleet${i + 1}`,
      preferences: { language: 'en', currency: 'USD', notifications: true },
      metadata: {
        companyName: `Fleet Company ${i + 1}`,
        taxId: `TAX${String(i + 1).padStart(8, '0')}`,
        businessLicense: `LICENSE${String(i + 1).padStart(6, '0')}`,
        operators: 5,
        vehicles: 10
      }
    }))
  ];

  return users;
}

/**
 * Seed users into database
 * @async
 * @returns {Promise<void>}
 */
async function seedUsers() {
  try {
    await testConnection();

    const existingUsers = await User.count();
    if (existingUsers > 0) {
      logger.warn(`⚠️  Database already contains ${existingUsers} users. Skipping seed.`);
      logger.info('To reset the database, run: npm run db:reset');
      return;
    }

    const users = await generateUsers();

    logger.info(`\n📝 Seeding ${users.length} users...`);

    const createdUsers = await User.bulkCreate(users, {
      validate: true,
      ignoreDuplicates: false
    });

    logger.info(`✅ Successfully created ${createdUsers.length} users`);
    logger.info('\n📊 User Distribution:');

    logger.info('  - Support: 1');
    logger.info('  - Riders: 10');
    logger.info('  - Drivers: 10');
    logger.info('  - Fleet Owners: 3');
    logger.info('\n🔐 Test Credentials:');




  } catch (error) {
    logger.error('❌ Error seeding users:', error.message);
    if (error.errors) {
      error.errors.forEach(err => logger.error(`  - ${err.message}`));
    }
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run seeder if executed directly
if (require.main === module) {
  seedUsers()
    .then(() => {
      logger.info('\n✨ User seeding complete!');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('\n💥 User seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedUsers, generateUsers };
