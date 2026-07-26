// Backend base URL. Dev uses the Vite proxy (see vite.config.ts) so this can
// stay empty in dev; production reads VITE_API_BASE_URL from env.
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function getAccessToken(): string | null {
  return sessionStorage.getItem('accessToken');
}

/**
 * Thin fetch wrapper: attaches the bearer token when present, parses JSON,
 * and throws ApiError on non-2xx so callers can branch on `.status` (401 vs
 * 403 vs other) the way the Frontend Wiring Prompt's error-handling spec
 * requires, instead of every call site re-implementing res.ok checks.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Is the backend running?');
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body && String((body as { error: unknown }).error)) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message, body);
  }

  return body as T;
}

/**
 * Reads a field that may come back camelCase (confirmed shape for
 * /api/auth/login) or snake_case (unconfirmed for /api/cases as of the
 * Frontend Wiring Prompt — verify against a real response before removing
 * this). Delete this helper once every consumed endpoint's real casing is
 * confirmed and hardcode the one true key instead of guessing both.
 */
export function pick<T = unknown>(obj: Record<string, unknown>, camel: string, snake: string): T {
  return (obj[camel] ?? obj[snake]) as T;
}

// ===== Domain API functions =====
// Endpoint shapes below match the confirmed contracts documented in
// caseTypes.ts (verified against backend/src/controllers/cases.controller.js,
// practices.controller.js, reference.controller.js). These were missing
// entirely — CaseQueuePage.tsx, CaseDetailPage.tsx, and NewCaseModal.tsx
// (commit ee0208b) were built to call them, but the functions themselves
// were never added, which is the actual reason those screens could never
// have worked even once routed.
import type {
  CreateCasePayload,
  CreateCaseResponse,
  GetCaseResponse,
  ListCasesQuery,
  ListCasesResponse,
  ListCaseTypesResponse,
  ListPracticesResponse,
} from './caseTypes';

interface GetPracticeResponse {
  practice: import('./caseTypes').Practice;
}

export function listCases(query: ListCasesQuery = {}): Promise<ListCasesResponse> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.practiceId != null) params.set('practiceId', String(query.practiceId));
  if (query.assignedStaffId != null) params.set('assignedStaffId', String(query.assignedStaffId));
  if (query.priority) params.set('priority', query.priority);
  if (query.page != null) params.set('page', String(query.page));
  if (query.limit != null) params.set('limit', String(query.limit));
  const qs = params.toString();
  return apiFetch<ListCasesResponse>(`/api/cases${qs ? `?${qs}` : ''}`);
}

export function getCase(id: string | number): Promise<GetCaseResponse> {
  return apiFetch<GetCaseResponse>(`/api/cases/${id}`);
}

export function createCase(payload: CreateCasePayload): Promise<CreateCaseResponse> {
  return apiFetch<CreateCaseResponse>('/api/cases', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listPractices(): Promise<ListPracticesResponse> {
  return apiFetch<ListPracticesResponse>('/api/practices');
}

export function getPractice(id: string | number): Promise<GetPracticeResponse> {
  return apiFetch<GetPracticeResponse>(`/api/practices/${id}`);
}

export function listCaseTypes(): Promise<ListCaseTypesResponse> {
  return apiFetch<ListCaseTypesResponse>('/api/reference/case-types');
}
