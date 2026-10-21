const { supabase, config } = require('../config/supabase');
const logger = require('../utils/logger');

const hasPrivilegedKey = Boolean(config.serviceRoleKey || config.secretKey);

const syncBookingToSupabase = async (record) => {
  if (record.record_type !== 'booking') return true;
  if (!supabase || !hasPrivilegedKey) {
    logger.warn('Supabase rider realtime mirror is not configured with a privileged server key', {
      recordId: record.id,
    });
    return false;
  }

  if (record.status === 'deleted') {
    const bookingResult = await supabase
      .from('bookings')
      .delete()
      .eq('id', record.id)
      .eq('rider_id', record.firebase_uid);
    if (bookingResult.error) throw bookingResult.error;

    const tripResult = await supabase
      .from('trips')
      .delete()
      .eq('id', record.id)
      .eq('rider_id', record.firebase_uid);
    if (tripResult.error) throw tripResult.error;
    return true;
  }

  const payload = record.payload || {};
  const booking = {
    id: record.id,
    rider_id: record.firebase_uid,
    trip_id: record.id,
    status: record.status,
    pickup: payload.pickup,
    destination: payload.destination,
    service_type: payload.serviceType,
    transport_mode: payload.transportMode || null,
    passenger_count: payload.passengerCount || 1,
    seats_requested: payload.seatsRequested || 1,
    fare: payload.fare,
    currency: payload.currency || 'LSL',
    scheduled_time: payload.scheduledTime || null,
    payload,
    created_at: record.created_at,
    updated_at: record.source_updated_at,
  };
  const bookingResult = await supabase.from('bookings').upsert(booking);
  if (bookingResult.error) throw bookingResult.error;

  const trip = {
    id: record.id,
    rider_id: record.firebase_uid,
    booking_id: record.id,
    status: record.status,
    pickup: payload.pickup,
    destination: payload.destination,
    fare: payload.fare,
    currency: payload.currency || 'LSL',
    payload,
    created_at: record.created_at,
    updated_at: record.source_updated_at,
  };
  const tripResult = await supabase.from('trips').upsert(trip);
  if (tripResult.error) throw tripResult.error;
  return true;
};

module.exports = { syncBookingToSupabase };
