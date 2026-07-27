import type { Role } from '../../constants/roles';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  practiceId?: string;
  mfaEnrolled: boolean;
}

export interface LoginResponse {
  /** If true, client must complete MFA before tokens are issued (B11). */
  mfaRequired: boolean;
  /** Present only when mfaRequired is true — short-lived, sent back to mfaVerify. */
  mfaChallengeToken?: string;
  /** Present only when mfaRequired is false, i.e. MFA not enrolled or already satisfied. */
  accessToken?: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string; // ISO 8601 — plan calls out confirming this exists (B10)
  user?: UserProfile;
}

export interface MfaVerifyResponse {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: UserProfile;
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'mfaPending'; mfaChallengeToken: string; email: string }
  | { status: 'deviceLockPending'; user: UserProfile }
  | { status: 'signedIn'; user: UserProfile };
