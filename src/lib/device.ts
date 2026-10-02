const DEVICE_ID_STORAGE_KEY = 'school_tracker_android_device_id';

/**
 * Returns a persistent unique device identifier for scan_student_event RPC logs.
 */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.trim().length > 0) {
      return existing;
    }
    const randomPart =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    const deviceId = `ANDROID-${randomPart.slice(0, 18).toUpperCase()}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    return deviceId;
  } catch {
    return 'ANDROID-CLIENT-DEVICE';
  }
}
