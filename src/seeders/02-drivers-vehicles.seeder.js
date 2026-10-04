/**
 * Drivers & Vehicles Seeder - Populate database with sample drivers and vehicles
 * Version: 2.0.0
 * 
 * @module seeders/02-drivers-vehicles
 * @description Creates sample drivers and associated vehicles
 */

const { sequelize, testConnection } = require('../config/database');
const { User, Driver, Vehicle } = require('../models');
const logger = require('../utils/logger');

/**
 * Create driver records linked to driver users
 * @async
 * @returns {Promise<Array>} Array of created drivers
 */
async function seedDriversAndVehicles() {
  try {
    await testConnection();

    const existingDrivers = await Driver.count();
    if (existingDrivers > 0) {
      logger.warn(`⚠️  Database already contains ${existingDrivers} drivers. Skipping seed.`);
      return;
    }

    // Get all driver users
    const driverUsers = await User.findAll({
      where: { role: 'driver' },
      attributes: ['id', 'first_name', 'last_name', 'email']
    });

    logger.info(`\n🚗 Found ${driverUsers.length} driver users`);

    // Create drivers
    const drivers = driverUsers.map((user, index) => ({
      id: index + 1,
      user_id: user.id,
      license_number: `DL${String(index + 1).padStart(8, '0')}`,
      license_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      date_of_birth: new Date('1990-01-15'),
      gender: index % 2 === 0 ? 'M' : 'F',
      address: `${index + 1} Driver Street, City, State 12345`,
      city: 'Sample City',
      state: 'Sample State',
      country: 'Sample Country',
      postal_code: '12345',
      rating: (4.5 + Math.random() * 0.5).toFixed(1),
      total_rides: Math.floor(Math.random() * 500) + 50,
      total_earnings: (Math.random() * 50000 + 5000).toFixed(2),
      verification_status: index < 8 ? 'verified' : 'pending',
      is_active: true,
      is_available: index % 3 !== 0, // Some drivers offline
      background_check: index < 8 ? 'approved' : 'pending',
      insurance_verified: true,
      is_on_trip: false,
      metadata: {
        bankAccount: {
          accountName: `${user.first_name} ${user.last_name}`,
          accountNumber: `ACCT${String(index + 1).padStart(10, '0')}`,
          bankCode: `BANK${String(index + 1).padStart(3, '0')}`,
          swiftCode: 'SAMPLESWIFT'
        },
        emergencyContact: {
          name: `Emergency Contact ${index + 1}`,
          relationship: 'Family',
          phone: `+1234567${String(index + 1).padStart(3, '0')}`
        },
        documents: {
          driverLicense: { verified: true, expiryDate: '2025-12-31' },
          insurance: { verified: true, expiryDate: '2025-06-30' },
          registration: { verified: true, expiryDate: '2025-03-31' },
          backgroundCheck: { verified: true, date: '2024-01-15' }
        },
        preferences: {
          preferredRideTypes: ['economy', 'comfort'],
          acceptsSharedRides: true,
          maxDistanceFromHome: 30,
          preferredWorkingHours: { start: '06:00', end: '23:00' }
        },
        acceptanceRate: (0.85 + Math.random() * 0.15).toFixed(2),
        cancellationRate: (0.01 + Math.random() * 0.04).toFixed(2)
      }
    }));

    const createdDrivers = await Driver.bulkCreate(drivers);
    logger.info(`✅ Created ${createdDrivers.length} driver records`);

    // Create vehicles for each driver
    const vehicles = createdDrivers.flatMap((driver, index) => {
      const vehicleCount = Math.floor(Math.random() * 2) + 1; // 1-2 vehicles per driver
      return Array.from({ length: vehicleCount }, (_, vehicleIndex) => ({
        id: (index + 1) * 100 + vehicleIndex + 1,
        driver_id: driver.id,
        plate_number: `PLATE${String(index * 2 + vehicleIndex + 1).padStart(6, '0')}`,
        make: ['Toyota', 'Honda', 'Ford', 'Hyundai', 'Nissan'][Math.floor(Math.random() * 5)],
        model: ['Camry', 'Corolla', 'Accord', 'Civic', 'Fusion', 'Elantra', 'Altima'][Math.floor(Math.random() * 7)],
        year: 2020 + Math.floor(Math.random() * 4),
        color: ['White', 'Black', 'Silver', 'Blue', 'Gray'][Math.floor(Math.random() * 5)],
        vin: `VIN${String(index * 2 + vehicleIndex + 1).padStart(14, '0')}`,
        registration_number: `REG${String(index * 2 + vehicleIndex + 1).padStart(8, '0')}`,
        registration_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        insurance_provider: 'Sample Insurance Co',
        insurance_policy_number: `POL${String(index * 2 + vehicleIndex + 1).padStart(10, '0')}`,
        insurance_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        vehicle_type: vehicleIndex === 0 ? 'sedan' : 'suv',
        seating_capacity: vehicleIndex === 0 ? 4 : 7,
        fuel_type: 'petrol',
        transmission: 'automatic',
        mileage: Math.floor(Math.random() * 100000) + 10000,
        is_active: true,
        verification_status: 'verified',
        metadata: {
          lastInspection: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          nextInspection: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          documents: {
            registrationCertificate: true,
            insuranceCertificate: true,
            roadTax: true,
            emissionTest: true
          },
          maintenanceHistory: [
            { date: '2024-01-15', type: 'Oil Change', cost: 50 },
            { date: '2024-03-20', type: 'Tire Rotation', cost: 80 }
          ],
          accessories: ['GPS', 'Dash Camera', 'Air Freshener', 'Phone Holder']
        }
      }));
    });

    const createdVehicles = await Vehicle.bulkCreate(vehicles);
    logger.info(`✅ Created ${createdVehicles.length} vehicle records`);

    logger.info('\n🚗 Driver & Vehicle Summary:');
    logger.info(`  - Total Drivers: ${createdDrivers.length}`);
    logger.info(`  - Total Vehicles: ${createdVehicles.length}`);

    return { drivers: createdDrivers, vehicles: createdVehicles };

  } catch (error) {
    logger.error('❌ Error seeding drivers and vehicles:', error.message);
    if (error.errors) {
      error.errors.forEach(err => logger.error(`  - ${err.message}`));
    }
    throw error;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  seedDriversAndVehicles()
    .then(() => {
      logger.info('\n✨ Drivers and vehicles seeding complete!');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('\n💥 Drivers and vehicles seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedDriversAndVehicles };
