// Mirrors the CONFIRMED /api/auth/login response shape from
// Armature_Labs_Frontend_Wiring_Prompt.md §2 — camelCase, verified against
// the real controller. Do not add fields here on a guess; confirm against
// the live endpoint first, same rule as everywhere else in this codebase.

export type Role =
  | 'owner'
  | 'office_manager'
  | 'assistant_technician'
  | 'designer'
  | 'dentist_client';

export interface AuthUser {
  id: number;
  fullName: string;
  email: string;
  role: Role;
  canApprovePhotos: boolean;
  canViewInvoices: boolean;
  canEditPatientInfo: boolean;
  practiceIds: number[]; // non-empty only for dentist_client
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
