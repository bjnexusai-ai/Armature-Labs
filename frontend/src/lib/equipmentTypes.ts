// Session 7 Chunk 3 — equipment + technician scheduling types. Confirmed
// against backend/src/controllers/equipment.controller.js and
// planning.controller.js directly, not guessed.

export type EquipmentStatus = 'Active' | 'Under Maintenance' | 'Retired';
export type EquipmentType = 'Milling Machine' | 'Printer' | 'Furnace' | 'Scanner' | 'Other';
export type MaintenanceLogType = 'Routine' | 'Repair' | 'Inspection';

export interface Equipment {
  id: number;
  name: string;
  equipment_type: EquipmentType;
  serial_number: string | null;
  status: EquipmentStatus;
  // Cast to ::text server-side (equipment.controller.js's own comment) —
  // a plain YYYY-MM-DD string, not a full ISO timestamp.
  next_maintenance_due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListEquipmentResponse {
  equipment: Equipment[];
}

export interface GetEquipmentResponse {
  equipment: Equipment;
}

export interface CreateEquipmentPayload {
  name: string;
  equipmentType: EquipmentType;
  serialNumber?: string;
}

export interface CreateEquipmentResponse {
  equipment: Equipment;
}

export interface UpdateEquipmentStatusPayload {
  status: EquipmentStatus;
}

export interface MaintenanceLog {
  id: number;
  equipment_id: number;
  log_type: MaintenanceLogType;
  performed_by: number | null;
  performed_at: string;
  next_due_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface ListMaintenanceLogsResponse {
  maintenanceLogs: MaintenanceLog[];
}

export interface CreateMaintenanceLogPayload {
  logType: MaintenanceLogType;
  nextDueDate?: string;
  notes?: string;
}

export interface CreateMaintenanceLogResponse {
  maintenanceLog: MaintenanceLog;
}

// ── Technician shifts ──────────────────────────────────────────────────

export interface TechnicianShift {
  id: number;
  technician_id: number;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  created_by: number | null;
  created_at: string;
}

export interface ListShiftsResponse {
  shifts: TechnicianShift[];
}

export interface CreateShiftPayload {
  technicianId: number;
  startsAt: string;
  endsAt: string;
  notes?: string;
}

export interface CreateShiftResponse {
  shift: TechnicianShift;
}

// ── Equipment bookings ──────────────────────────────────────────────────

export interface EquipmentBooking {
  id: number;
  equipment_id: number;
  case_id: number | null;
  booked_by: number | null;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  created_at: string;
}

export interface ListBookingsResponse {
  bookings: EquipmentBooking[];
}

export interface CreateBookingPayload {
  equipmentId: number;
  caseId?: number;
  startsAt: string;
  endsAt: string;
  notes?: string;
}

export interface CreateBookingResponse {
  booking: EquipmentBooking;
}
