import type { Role } from '../../constants/roles';

/**
 * Confirmed against backend/src/controllers/auth.controller.js `login()`
 * response shape — not assumed. Field names (fullName, canApprovePhotos,
 * refreshExpiresIn as a number of seconds — not an ISO expiry timestamp)
 * match the real response exactly.
 */
export interface UserProfile {
  id: number;
  fullName: string;
  email: string;
  role: Role;
  canApprovePhotos: boolean;
  canViewInvoices: boolean;
  canEditPatientInfo: boolean;
  /** Only populated for role === 'dentist_client'; empty array otherwise. */
  practiceIds: number[];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  refreshExpiresIn: number; // seconds
  user: UserProfile;
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'deviceLockPending'; user: UserProfile }
  | { status: 'signedIn'; user: UserProfile };
