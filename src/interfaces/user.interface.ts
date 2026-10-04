export type UserRole = 'admin' | 'driver' | 'rider' | 'support';
export type UserStatus = 'active' | 'suspended' | 'pending';

export interface User {
	id: number;
	firebase_uid?: string | null;
	name: string;
	email: string;
	password_hash?: string | null;
	role: UserRole;
	phone?: string | null;
	avatar_url?: string | null;
	status: UserStatus;
	last_login?: string | Date | null;
	createdAt?: string | Date;
	updatedAt?: string | Date;
}
