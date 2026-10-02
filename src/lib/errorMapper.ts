const ERROR_MAP: Record<string, string> = {
  NOT_AUTHENTICATED: 'Please login again.',
  PROFILE_NOT_FOUND: 'Your account profile was not found.',
  STUDENT_NOT_FOUND: 'Student QR is invalid or inactive.',
  PARENT_NOT_LINKED_TO_STUDENT: 'This student is not linked to your parent account.',
  ONLY_PARENT_ALLOWED: 'This action is available only to parents.',
  ONLY_TEACHER_ALLOWED: 'This action is available only to teachers.',
  ONLY_SECURITY_ALLOWED: 'This action is available only to security staff.',
  TEACHER_NOT_ASSIGNED_TO_CLASS: "You are not assigned to this student's class.",
  HOME_EXIT_ALREADY_SCANNED: 'Home exit has already been recorded.',
  SCHOOL_ARRIVAL_ALREADY_SCANNED: 'School arrival has already been recorded.',
  CLASS_ARRIVAL_ALREADY_SCANNED: 'Class arrival has already been recorded.',
  SCHOOL_EXIT_ALREADY_SCANNED: 'School exit has already been recorded.',
  HOME_ARRIVAL_ALREADY_SCANNED: 'Home arrival has already been recorded.',
  INVALID_SEQUENCE_HOME_EXIT_REQUIRED: 'Home exit must be recorded first.',
  INVALID_SEQUENCE_SCHOOL_ARRIVAL_REQUIRED: 'School arrival must be recorded first.',
  INVALID_SEQUENCE_CLASS_ARRIVAL_REQUIRED: 'Class arrival must be recorded first.',
  INVALID_SEQUENCE_SCHOOL_EXIT_REQUIRED: 'School exit must be recorded first.',
  SCHOOL_MISMATCH: 'This student belongs to another school.',
  INACTIVE_USER: 'Your account is currently inactive. Please contact the school administrator.',
  INACTIVE_SCHOOL: 'Your school account is currently inactive.',
};

/**
 * Converts any Supabase / PostgreSQL / RPC error into a friendly, non-technical message for end users.
 * Never exposes raw SQL, stack traces, or internal table names.
 */
export function mapBackendError(error: unknown): string {
  if (!error) {
    return 'Something went wrong. Please try again.';
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'No internet connection. Scan was not recorded.';
  }

  const rawText = extractErrorText(error);
  const upperText = rawText.toUpperCase();

  if (
    upperText.includes('FAILED TO FETCH') ||
    upperText.includes('NETWORKERROR') ||
    upperText.includes('NETWORK REQUEST FAILED') ||
    upperText.includes('LOAD FAILED')
  ) {
    return 'No internet connection. Scan was not recorded.';
  }

  // Match known backend error codes first
  for (const [code, friendlyMessage] of Object.entries(ERROR_MAP)) {
    if (upperText.includes(code)) {
      return friendlyMessage;
    }
  }

  // Auth specific errors
  if (upperText.includes('INVALID LOGIN CREDENTIALS')) {
    return 'Incorrect email or password. Please try again.';
  }
  if (upperText.includes('EMAIL NOT CONFIRMED')) {
    return 'Please verify your email address before signing in.';
  }
  if (upperText.includes('JWT EXPIRED') || upperText.includes('INVALID JWT')) {
    return 'Your session has expired. Please login again.';
  }
  if (upperText.includes('ROW-LEVEL SECURITY') || upperText.includes('PERMISSION DENIED')) {
    return 'You do not have permission to perform this action.';
  }

  // Additional natural-language sequence/duplicate fallbacks if RPC returns descriptive strings
  if (upperText.includes('ALREADY') && upperText.includes('HOME_EXIT')) {
    return ERROR_MAP.HOME_EXIT_ALREADY_SCANNED;
  }
  if (upperText.includes('ALREADY') && upperText.includes('SCHOOL_ARRIVAL')) {
    return ERROR_MAP.SCHOOL_ARRIVAL_ALREADY_SCANNED;
  }
  if (upperText.includes('ALREADY') && upperText.includes('CLASS_ARRIVAL')) {
    return ERROR_MAP.CLASS_ARRIVAL_ALREADY_SCANNED;
  }
  if (upperText.includes('ALREADY') && upperText.includes('SCHOOL_EXIT')) {
    return ERROR_MAP.SCHOOL_EXIT_ALREADY_SCANNED;
  }
  if (upperText.includes('ALREADY') && upperText.includes('HOME_ARRIVAL')) {
    return ERROR_MAP.HOME_ARRIVAL_ALREADY_SCANNED;
  }

  return 'Unable to complete the request right now. Please verify the student status and try again.';
}

function extractErrorText(err: unknown): string {
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof obj.code === 'string') parts.push(obj.code);
    if (typeof obj.error === 'string') parts.push(obj.error);
    if (typeof obj.message === 'string') parts.push(obj.message);
    if (typeof obj.details === 'string') parts.push(obj.details);
    if (typeof obj.hint === 'string') parts.push(obj.hint);
    if (parts.length > 0) return parts.join(' ');
  }
  return String(err);
}
