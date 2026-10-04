/**
 * Rides & Payments Seeder - Populate database with sample rides and payments
 * Version: 2.0.0
 * 
 * @module seeders/03-rides-payments
 * @description Creates sample rides and payment records
 */

const { sequelize, testConnection } = require('../config/database');
const { User, Driver, Ride, Payment } = require('../models');
const logger = require('../utils/logger');

/**
 * Calculate distance and duration based on coordinates
 * @param {Object} start - Start coordinates {lat, lng}
 * @param {Object} end - End coordinates {lat, lng}
 * @returns {Object} {distance, duration}
 */
function calculateTripMetrics(start, end) {
  // Simplified haversine formula
  const R = 6371; // km
  const dLat = (end.lat - start.lat) * Math.PI / 180;
  const dLng = (end.lng - start.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(start.lat * Math.PI / 180) * Math.cos(end.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  // Estimate duration (average 40 km/h)
  const duration = Math.round((distance / 40) * 60);
  
  return { distance: parseFloat(distance.toFixed(2)), duration };
}

/**
 * Seed rides and payments
 * @async
 * @returns {Promise<void>}
 */
async function seedRidesAndPayments() {
  try {
    await testConnection();

    const existingRides = await Ride.count();
    if (existingRides > 0) {
      logger.warn(`⚠️  Database already contains ${existingRides} rides. Skipping seed.`);
      return;
    }

    // Get sample riders and drivers
    const riders = await User.findAll({ where: { role: 'rider' }, limit: 5 });
    const drivers = await Driver.findAll({ limit: 5, include: { model: User } });

    logger.info(`\n🚗 Creating rides for ${riders.length} riders with ${drivers.length} drivers...`);

    const locations = [
      { name: 'Downtown Station', lat: 40.7580, lng: -73.9855 },
      { name: 'Airport Terminal', lat: 40.7769, lng: -73.8740 },
      { name: 'Shopping Mall', lat: 40.7282, lng: -73.7949 },
      { name: 'Central Park', lat: 40.7829, lng: -73.9654 },
      { name: 'Times Square', lat: 40.7580, lng: -73.9855 },
      { name: 'Bridge Area', lat: 40.7569, lng: -73.9776 },
      { name: 'Harbor View', lat: 40.6892, lng: -74.0445 },
      { name: 'Museum District', lat: 40.7831, lng: -73.9712 }
    ];

    const rides = [];
    const payments = [];
    const now = new Date();

    // Create 50 sample rides
    for (let i = 0; i < 50; i++) {
      const rider = riders[i % riders.length];
      const driver = drivers[i % drivers.length];
      const startLocation = locations[Math.floor(Math.random() * locations.length)];
      const endLocation = locations[Math.floor(Math.random() * locations.length)];

      if (startLocation.name === endLocation.name) continue;

      const metrics = calculateTripMetrics(
        { lat: startLocation.lat, lng: startLocation.lng },
        { lat: endLocation.lat, lng: endLocation.lng }
      );

      const baseFare = 2.5;
      const distanceFare = metrics.distance * 0.75;
      const timeFare = (metrics.duration / 60) * 0.25;
      const totalFare = parseFloat((baseFare + distanceFare + timeFare).toFixed(2));

      const statuses = ['completed', 'completed', 'completed', 'cancelled', 'no_show'];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      const rideDate = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000); // Last 30 days

      const rideId = i + 1;
      const ride = {
        id: rideId,
        rider_id: rider.id,
        driver_id: driver.id,
        pickup_location: startLocation.name,
        pickup_latitude: startLocation.lat,
        pickup_longitude: startLocation.lng,
        dropoff_location: endLocation.name,
        dropoff_latitude: endLocation.lat,
        dropoff_longitude: endLocation.lng,
        distance: metrics.distance,
        duration: metrics.duration,
        fare_amount: totalFare,
        ride_type: Math.random() > 0.7 ? 'shared' : 'private',
        payment_method: Math.random() > 0.5 ? 'card' : 'wallet',
        status,
        scheduled_for: status === 'scheduled' ? new Date(rideDate.getTime() + 24 * 60 * 60 * 1000) : null,
        started_at: status !== 'cancelled' && status !== 'no_show' ? new Date(rideDate.getTime() + 5 * 60 * 1000) : null,
        ended_at: status === 'completed' ? new Date(rideDate.getTime() + 5 * 60 * 1000 + metrics.duration * 60 * 1000) : null,
        cancelled_at: status === 'cancelled' ? rideDate : null,
        cancellation_reason: status === 'cancelled' ? ['user_requested', 'driver_cancelled', 'system_error'][Math.floor(Math.random() * 3)] : null,
        driver_rating: status === 'completed' ? Math.floor(Math.random() * 5) + 1 : null,
        driver_review: status === 'completed' ? 'Great ride, professional driver!' : null,
        metadata: {
          searchId: `SEARCH${String(i + 1).padStart(8, '0')}`,
          surgeMultiplier: (0.8 + Math.random() * 0.4).toFixed(2),
          routeOptimization: true,
          acceptanceTime: Math.floor(Math.random() * 60) + 5,
          pickupTime: Math.floor(Math.random() * 300) + 30
        },
        createdAt: rideDate,
        updatedAt: rideDate
      };

      rides.push(ride);

      // Create payment record if ride is completed
      if (status === 'completed') {
        const payment = {
          id: i + 1,
          ride_id: rideId,
          amount: totalFare,
          currency: 'USD',
          payment_method: ride.payment_method,
          status: 'completed',
          transaction_id: `TXN${String(i + 1).padStart(12, '0')}`,
          provider_fee: (totalFare * 0.15).toFixed(2),
          driver_earnings: (totalFare * 0.75).toFixed(2),
          metadata: {
            cardLast4: ride.payment_method === 'card' ? '4242' : null,
            walletDeduction: ride.payment_method === 'wallet',
            promoCode: Math.random() > 0.8 ? 'PROMO10' : null,
            discountApplied: Math.random() > 0.8 ? 5.00 : 0
          },
          createdAt: ride.ended_at || rideDate,
          updatedAt: ride.ended_at || rideDate
        };
        payments.push(payment);
      }
    }

    // Bulk create rides and payments
    const createdRides = await Ride.bulkCreate(rides);
    logger.info(`✅ Created ${createdRides.length} ride records`);

    if (payments.length > 0) {
      const createdPayments = await Payment.bulkCreate(payments);
      logger.info(`✅ Created ${createdPayments.length} payment records`);
    }

    // Calculate statistics
    const completedRides = rides.filter(r => r.status === 'completed').length;
    const totalRevenue = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0).toFixed(2);
    const avgRideDistance = (rides.reduce((sum, r) => sum + r.distance, 0) / rides.length).toFixed(2);

    logger.info('\n📊 Ride & Payment Summary:');
    logger.info(`  - Total Rides: ${createdRides.length}`);
    logger.info(`  - Completed Rides: ${completedRides}`);
    logger.info(`  - Total Revenue: $${totalRevenue}`);
    logger.info(`  - Average Distance: ${avgRideDistance} km`);
    logger.info(`  - Payment Records: ${payments.length}`);

  } catch (error) {
    logger.error('❌ Error seeding rides and payments:', error.message);
    if (error.errors) {
      error.errors.forEach(err => logger.error(`  - ${err.message}`));
    }
    throw error;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  seedRidesAndPayments()
    .then(() => {
      logger.info('\n✨ Rides and payments seeding complete!');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('\n💥 Rides and payments seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedRidesAndPayments };
