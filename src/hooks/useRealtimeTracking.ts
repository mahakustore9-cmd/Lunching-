import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Subscribes to Supabase Realtime changes on `public.daily_tracking` and `public.scan_logs`
 * for the authenticated school, triggering a data refresh callback automatically.
 * Note: Realtime NEVER replaces `public.scan_student_event` RPC for writes.
 */
export function useRealtimeTracking(
  schoolId: string | null | undefined,
  onTrackingChange: () => void
) {
  useEffect(() => {
    if (!schoolId) return;

    const channel = supabase
      .channel(`school-tracking-${schoolId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_tracking',
          filter: `school_id=eq.${schoolId}`,
        },
        () => {
          onTrackingChange();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scan_logs',
          filter: `school_id=eq.${schoolId}`,
        },
        () => {
          onTrackingChange();
        }
      )
      .subscribe();

    const handleOnlineRefresh = () => {
      onTrackingChange();
    };
    window.addEventListener('online', handleOnlineRefresh);

    return () => {
      window.removeEventListener('online', handleOnlineRefresh);
      supabase.removeChannel(channel);
    };
  }, [schoolId, onTrackingChange]);
}
