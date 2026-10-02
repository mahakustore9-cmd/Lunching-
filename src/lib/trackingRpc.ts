import { supabase, isDeviceOnline } from './supabase';
import { getDeviceId } from './device';
import { mapBackendError } from './errorMapper';
import type { DailyTracking, TrackingEventType, UserRole } from '../types/database';

export const EVENT_LABELS: Record<TrackingEventType, string> = {
  home_exit: 'Home Exit',
  school_arrival: 'School Arrival',
  class_arrival: 'Class Arrival',
  school_exit: 'School Exit',
  home_arrival: 'Home Arrival',
};

export const EVENT_ROLE_LABELS: Record<TrackingEventType, string> = {
  home_exit: 'Parent',
  school_arrival: 'Security',
  class_arrival: 'Teacher',
  school_exit: 'Security',
  home_arrival: 'Parent',
};

export const ORDERED_EVENTS: TrackingEventType[] = [
  'home_exit',
  'school_arrival',
  'class_arrival',
  'school_exit',
  'home_arrival',
];

/**
 * Determines the current human-readable status summary of a student from today's tracking row.
 */
export function getStudentCurrentStatus(tracking: DailyTracking | null): {
  label: string;
  badgeColor: 'emerald' | 'blue' | 'amber' | 'slate' | 'indigo';
  lastTimestamp: string | null;
  nextExpectedEvent: TrackingEventType | null;
} {
  if (!tracking || !tracking.home_exit_at) {
    return {
      label: 'At Home (Not Left)',
      badgeColor: 'slate',
      lastTimestamp: null,
      nextExpectedEvent: 'home_exit',
    };
  }

  if (tracking.home_arrival_at) {
    return {
      label: 'Arrived Home Safely',
      badgeColor: 'emerald',
      lastTimestamp: tracking.home_arrival_at,
      nextExpectedEvent: null,
    };
  }

  if (tracking.school_exit_at) {
    return {
      label: 'Left School • On Way Home',
      badgeColor: 'amber',
      lastTimestamp: tracking.school_exit_at,
      nextExpectedEvent: 'home_arrival',
    };
  }

  if (tracking.class_arrival_at) {
    return {
      label: 'In Classroom',
      badgeColor: 'emerald',
      lastTimestamp: tracking.class_arrival_at,
      nextExpectedEvent: 'school_exit',
    };
  }

  if (tracking.school_arrival_at) {
    return {
      label: 'Arrived at School Gate',
      badgeColor: 'blue',
      lastTimestamp: tracking.school_arrival_at,
      nextExpectedEvent: 'class_arrival',
    };
  }

  return {
    label: 'Left Home • To School',
    badgeColor: 'indigo',
    lastTimestamp: tracking.home_exit_at,
    nextExpectedEvent: 'school_arrival',
  };
}

/**
 * Determines the valid next event for a PARENT scanning their linked child.
 * Sequence rules:
 * - If home_exit_at is null AND no earlier parent event exists -> home_exit
 * - If school_exit_at exists AND home_arrival_at is null -> home_arrival
 * - Otherwise -> null ("No parent scan is required right now.")
 */
export function determineNextParentEvent(
  tracking: DailyTracking | null
): { event: TrackingEventType | null; reason: string } {
  if (!tracking || (!tracking.home_exit_at && !tracking.school_arrival_at && !tracking.class_arrival_at && !tracking.school_exit_at && !tracking.home_arrival_at)) {
    return { event: 'home_exit', reason: 'Ready to record Home Exit' };
  }

  if (tracking.school_exit_at && !tracking.home_arrival_at) {
    return { event: 'home_arrival', reason: 'Ready to record Home Arrival' };
  }

  return {
    event: null,
    reason: 'No parent scan is required right now.',
  };
}

/**
 * Determines the valid next event for SECURITY staff based on today's tracking row.
 * Sequence rules:
 * - If home_exit_at present AND school_arrival_at null -> school_arrival
 * - If class_arrival_at present AND school_exit_at null -> school_exit
 * - Otherwise -> null with appropriate message
 */
export function determineNextSecurityEvent(
  tracking: DailyTracking | null
): { event: TrackingEventType | null; reason: string } {
  if (!tracking || !tracking.home_exit_at) {
    return {
      event: null,
      reason: 'Home exit must be recorded first.',
    };
  }

  if (tracking.home_exit_at && !tracking.school_arrival_at) {
    return {
      event: 'school_arrival',
      reason: 'Ready to record School Arrival',
    };
  }

  if (tracking.school_arrival_at && !tracking.class_arrival_at) {
    return {
      event: null,
      reason: 'Class arrival must be recorded first.',
    };
  }

  if (tracking.class_arrival_at && !tracking.school_exit_at) {
    return {
      event: 'school_exit',
      reason: 'Ready to record School Exit',
    };
  }

  if (tracking.school_exit_at) {
    return {
      event: null,
      reason: 'School exit has already been recorded.',
    };
  }

  return {
    event: null,
    reason: 'No security scan is required for this student right now.',
  };
}

/**
 * Determines the valid next event for TEACHER based on today's tracking row.
 * Teachers only perform `class_arrival`.
 */
export function determineNextTeacherEvent(
  tracking: DailyTracking | null
): { event: TrackingEventType | null; reason: string } {
  if (!tracking || !tracking.home_exit_at) {
    return {
      event: null,
      reason: 'Home exit must be recorded first.',
    };
  }

  if (!tracking.school_arrival_at) {
    return {
      event: null,
      reason: 'School arrival must be recorded first.',
    };
  }

  if (tracking.class_arrival_at) {
    return {
      event: null,
      reason: 'Class arrival has already been recorded.',
    };
  }

  return {
    event: 'class_arrival',
    reason: 'Ready to record Class Arrival',
  };
}

/**
 * Role-aware helper to determine next event from a student's today tracking state.
 */
export function determineNextEventForRole(
  role: UserRole,
  tracking: DailyTracking | null
): { event: TrackingEventType | null; reason: string } {
  switch (role) {
    case 'parent':
      return determineNextParentEvent(tracking);
    case 'security':
      return determineNextSecurityEvent(tracking);
    case 'teacher':
      return determineNextTeacherEvent(tracking);
    default:
      return {
        event: null,
        reason: 'Scanning is only permitted for Parents, Security, and Teachers.',
      };
  }
}

export interface ExecuteScanOutcome {
  ok: boolean;
  eventType: TrackingEventType;
  message: string;
  scannedAt: string;
  rawResponse?: unknown;
}

/**
 * Strictly calls `public.scan_student_event(p_qr_token, p_event_type, p_device_id)`.
 * NEVER directly inserts/updates `daily_tracking` or `scan_logs`.
 */
export async function executeScanStudentEvent(
  qrToken: string,
  eventType: TrackingEventType
): Promise<ExecuteScanOutcome> {
  if (!isDeviceOnline()) {
    throw new Error('No internet connection. Scan was not recorded.');
  }

  const cleanToken = qrToken.trim();
  if (!cleanToken) {
    throw new Error(mapBackendError('STUDENT_NOT_FOUND'));
  }

  const deviceId = getDeviceId();

  const { data, error } = await supabase.rpc('scan_student_event', {
    p_qr_token: cleanToken,
    p_event_type: eventType,
    p_device_id: deviceId,
  });

  if (error) {
    throw new Error(mapBackendError(error));
  }

  // Handle cases where the RPC returns a JSON payload indicating an error status/code
  if (data && typeof data === 'object') {
    const payload = data as Record<string, unknown>;
    if (
      payload.success === false ||
      payload.status === 'error' ||
      typeof payload.error === 'string' ||
      (typeof payload.code === 'string' && payload.code !== 'SUCCESS' && payload.code !== 'OK')
    ) {
      const errSource = payload.error || payload.code || payload.message || 'Scan failed';
      throw new Error(mapBackendError(errSource));
    }

    const scannedAt =
      typeof payload.scanned_at === 'string'
        ? payload.scanned_at
        : typeof payload.timestamp === 'string'
        ? payload.timestamp
        : new Date().toISOString();

    return {
      ok: true,
      eventType,
      message: `${EVENT_LABELS[eventType]} recorded successfully.`,
      scannedAt,
      rawResponse: data,
    };
  }

  return {
    ok: true,
    eventType,
    message: `${EVENT_LABELS[eventType]} recorded successfully.`,
    scannedAt: new Date().toISOString(),
    rawResponse: data,
  };
}

/**
 * Formats an ISO timestamp string cleanly (e.g., "07:45 AM").
 */
export function formatTime(isoString: string | null | undefined, timezone?: string): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return new Date(isoString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

/**
 * Formats a YYYY-MM-DD date string into a readable label (e.g., "Oct 1, 2026").
 */
export function formatReadableDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
