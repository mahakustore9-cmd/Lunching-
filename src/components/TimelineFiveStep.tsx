import React from 'react';
import { Check, Clock } from 'lucide-react';
import {
  EVENT_LABELS,
  EVENT_ROLE_LABELS,
  ORDERED_EVENTS,
  formatTime,
  getStudentCurrentStatus,
} from '../lib/trackingRpc';
import type { DailyTracking, TrackingEventType } from '../types/database';

interface TimelineFiveStepProps {
  tracking: DailyTracking | null;
  timezone?: string;
  showRoleBadge?: boolean;
  compact?: boolean;
}

export function TimelineFiveStep({
  tracking,
  timezone,
  showRoleBadge = false,
  compact = false,
}: TimelineFiveStepProps) {
  const { nextExpectedEvent } = getStudentCurrentStatus(tracking);

  const getTimestampForEvent = (event: TrackingEventType): string | null => {
    if (!tracking) return null;
    switch (event) {
      case 'home_exit':
        return tracking.home_exit_at;
      case 'school_arrival':
        return tracking.school_arrival_at;
      case 'class_arrival':
        return tracking.class_arrival_at;
      case 'school_exit':
        return tracking.school_exit_at;
      case 'home_arrival':
        return tracking.home_arrival_at;
    }
  };

  return (
    <div className="relative pl-1">
      {ORDERED_EVENTS.map((event, index) => {
        const timestamp = getTimestampForEvent(event);
        const isCompleted = Boolean(timestamp);
        const isCurrentAwaiting = !isCompleted && nextExpectedEvent === event;
        const isLast = index === ORDERED_EVENTS.length - 1;

        return (
          <div
            key={event}
            className={`relative flex items-start gap-3.5 ${
              isLast ? '' : compact ? 'pb-3' : 'pb-4'
            }`}
          >
            {/* Vertical connector line */}
            {!isLast && (
              <div
                className={`absolute left-3.5 top-7 bottom-0 w-0.5 -ml-px transition-colors ${
                  isCompleted ? 'bg-emerald-500' : 'bg-slate-200'
                }`}
              />
            )}

            {/* Status circle */}
            <div
              className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
                isCompleted
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : isCurrentAwaiting
                  ? 'bg-indigo-50 border-2 border-indigo-600 text-indigo-600 ring-4 ring-indigo-50'
                  : 'bg-slate-100 border border-slate-300 text-slate-400'
              }`}
            >
              {isCompleted ? (
                <Check className="w-4 h-4 stroke-[2.5]" />
              ) : isCurrentAwaiting ? (
                <Clock className="w-3.5 h-3.5" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-slate-300" />
              )}
            </div>

            {/* Checkpoint label & timestamp */}
            <div
              className={`flex-1 min-w-0 flex items-center justify-between rounded-xl px-3 py-1.5 transition-colors ${
                isCurrentAwaiting
                  ? 'bg-indigo-50/70 border border-indigo-100'
                  : isCompleted
                  ? 'bg-emerald-50/40'
                  : ''
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${
                      isCompleted
                        ? 'text-slate-900'
                        : isCurrentAwaiting
                        ? 'text-indigo-950 font-semibold'
                        : 'text-slate-500'
                    }`}
                  >
                    {EVENT_LABELS[event]}
                  </span>
                  {isCurrentAwaiting && (
                    <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700">
                      Next
                    </span>
                  )}
                </div>
                {showRoleBadge && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isCompleted
                      ? `Scanned by ${EVENT_ROLE_LABELS[event]}`
                      : `Awaiting ${EVENT_ROLE_LABELS[event]}`}
                  </p>
                )}
              </div>

              <div className="text-right shrink-0 ml-2">
                {isCompleted ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-lg">
                    ✓ {formatTime(timestamp, timezone)}
                  </span>
                ) : (
                  <span className="text-sm font-medium text-slate-400">—</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
