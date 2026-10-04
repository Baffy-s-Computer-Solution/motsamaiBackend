export type RideStatus =
	| 'requested'
	| 'accepted'
	| 'arrived'
	| 'in_progress'
	| 'completed'
	| 'cancelled';

export interface Ride {
	id: number;
	rider_id: number;
	driver_id?: number | null;
	pickup_address: string;
	dropoff_address: string;
	pickup_lat?: number | null;
	pickup_lng?: number | null;
	dropoff_lat?: number | null;
	dropoff_lng?: number | null;
	status: RideStatus;
	distance_km?: number | null;
	fare_amount?: number | null;
	createdAt?: string | Date;
	updatedAt?: string | Date;
}

export interface CreateRidePayload {
	riderId: number;
	pickup: { lat: number; lng: number; address?: string };
	dropoff: { lat: number; lng: number; address?: string };
	seats?: number;
	paymentMethod?: 'card' | 'cash';
	promoCode?: string;
}
