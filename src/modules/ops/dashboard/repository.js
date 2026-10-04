const { Ride, Payment, User, Driver, SupportTicket } = require('../../../models');

const getSummaryCounts = async () => {
  const [rides, payments, users, drivers, tickets] = await Promise.all([
    Ride.count(),
    Payment.count(),
    User.count(),
    Driver.count(),
    SupportTicket.count(),
  ]);

  return { rides, payments, users, drivers, tickets };
};

module.exports = { getSummaryCounts };
