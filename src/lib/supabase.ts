import { createClient } from '@supabase/supabase-js';

const rawUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://uiyonylziiqahrpcajdv.supabase.co';

// Normalize URL in case /rest/v1/ was passed
export const SUPABASE_URL = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpeW9ueWx6aWlxYWhycGNhamR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4OTcyNDEsImV4cCI6MjEwNjQ3MzI0MX0.V07iTTVFrlH7PRpF3xvByxO0-A8MDWEhKaq5zeSbocw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Checks whether the client currently has network connectivity.
 */
export function isDeviceOnline(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

/**
 * Returns today's date string in YYYY-MM-DD format according to school timezone (or local if not provided).
 */
export function getTodayDateString(timezone?: string): string {
  try {
    if (timezone) {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return formatter.format(new Date());
    }
  } catch {
    // Fallback if timezone identifier is invalid
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
