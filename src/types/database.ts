export type UserRole =
  | 'super_admin'
  | 'school_admin'
  | 'teacher'
  | 'security'
  | 'parent';

export type TrackingEventType =
  | 'home_exit'
  | 'school_arrival'
  | 'class_arrival'
  | 'school_exit'
  | 'home_arrival';

export interface School {
  id: string;
  school_code: string;
  school_name: string;
  active: boolean;
  timezone: string;
}

export interface Profile {
  id: string;
  school_id: string | null;
  full_name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
}

export interface Student {
  id: string;
  school_id: string;
  student_id: string;
  full_name: string;
  student_class: string;
  roll_number: string;
  parent_id: string | null;
  photo_url: string | null;
  qr_token: string;
  active: boolean;
  created_at: string;
}

export interface DailyTracking {
  id: string;
  school_id: string;
  student_id: string;
  tracking_date: string;

  home_exit_at: string | null;
  school_arrival_at: string | null;
  class_arrival_at: string | null;
  school_exit_at: string | null;
  home_arrival_at: string | null;

  home_exit_by: string | null;
  school_arrival_by: string | null;
  class_arrival_by: string | null;
  school_exit_by: string | null;
  home_arrival_by: string | null;

  created_at: string;
  updated_at: string;
}

export interface ScanLog {
  id: string;
  school_id: string;
  student_id: string;
  tracking_id: string;
  event_type: TrackingEventType;
  scanned_by: string;
  scanned_at: string;
  device_id: string;
}

export interface ParentStudent {
  id: string;
  parent_id: string;
  student_id: string;
  created_at: string;
}

export interface TeacherClass {
  id: string;
  teacher_id: string;
  school_id: string;
  class_name: string;
  active: boolean;
  created_at: string;
}

export interface StudentWithTracking {
  student: Student;
  tracking: DailyTracking | null;
}

export interface ScanStudentEventResult {
  success?: boolean;
  status?: string;
  message?: string;
  error?: string;
  code?: string;
  event_type?: TrackingEventType;
  scanned_at?: string;
  student_name?: string;
  student_id?: string;
  tracking_id?: string;
  [key: string]: unknown;
}
