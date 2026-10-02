import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Loader2,
  LogOut,
  QrCode,
  RefreshCw,
  ShieldCheck,
  User,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, getTodayDateString } from '../lib/supabase';
import { mapBackendError } from '../lib/errorMapper';
import {
  determineNextParentEvent,
  EVENT_LABELS,
  formatReadableDate,
  getStudentCurrentStatus,
} from '../lib/trackingRpc';
import { useRealtimeTracking } from '../hooks/useRealtimeTracking';
import { StudentAvatar } from '../components/StudentAvatar';
import { TimelineFiveStep } from '../components/TimelineFiveStep';
import { QrScannerView } from '../components/QrScannerView';
import { StudentQrIdCard } from '../components/StudentQrIdCard';
import { BottomNav } from '../components/BottomNav';
import type {
  DailyTracking,
  Student,
  StudentWithTracking,
} from '../types/database';

export function ParentDashboard() {
  const { profile, school, selectedSchoolId, isOnline, signOut } = useAuth();

  const [activeTab, setActiveTab] = useState<string>('home');
  const [childrenWithTracking, setChildrenWithTracking] = useState<
    StudentWithTracking[]
  >([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // History tab state
  const [historyDate, setHistoryDate] = useState<string>(() =>
    getTodayDateString(school?.timezone)
  );
  const [historyTrackingMap, setHistoryTrackingMap] = useState<
    Record<string, DailyTracking>
  >({});
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Selected student for Digital QR ID Card modal
  const [qrModalStudent, setQrModalStudent] = useState<Student | null>(null);

  /**
   * CRITICAL PARENT SECURITY RULE:
   * A parent can only see students linked through `public.parent_students`.
   * Never use `students.parent_id` as the main authorization mechanism.
   */
  const fetchLinkedChildrenAndTracking = useCallback(async () => {
    if (!profile) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Fetch linked student UUIDs from `public.parent_students`
      const { data: linkRows, error: linkError } = await supabase
        .from('parent_students')
        .select('student_id')
        .eq('parent_id', profile.id);

      if (linkError) {
        throw linkError;
      }

      const studentIds = (linkRows || []).map(
        (r: { student_id: string }) => r.student_id
      );

      if (studentIds.length === 0) {
        setChildrenWithTracking([]);
        setLoading(false);
        return;
      }

      // 2. Fetch student details for those linked student UUIDs
      let studentsQuery = supabase
        .from('students')
        .select(
          'id, school_id, student_id, full_name, student_class, roll_number, parent_id, photo_url, qr_token, active, created_at'
        )
        .in('id', studentIds)
        .eq('active', true)
        .order('full_name', { ascending: true });

      if (selectedSchoolId) {
        studentsQuery = studentsQuery.eq('school_id', selectedSchoolId);
      }

      const { data: studentsData, error: studentsError } = await studentsQuery;

      if (studentsError) {
        throw studentsError;
      }

      const studentsList = (studentsData || []) as Student[];
      const todayDate = getTodayDateString(school?.timezone);

      // 3. Fetch today's `daily_tracking` row for each linked student (1 row per student per day)
      const { data: trackingData, error: trackingError } = await supabase
        .from('daily_tracking')
        .select('*')
        .in('student_id', studentIds)
        .eq('tracking_date', todayDate);

      if (trackingError) {
        throw trackingError;
      }

      const trackingByStudent: Record<string, DailyTracking> = {};
      for (const row of (trackingData || []) as DailyTracking[]) {
        trackingByStudent[row.student_id] = row;
      }

      const combined: StudentWithTracking[] = studentsList.map((stu) => ({
        student: stu,
        tracking: trackingByStudent[stu.id] || null,
      }));

      setChildrenWithTracking(combined);
    } catch (err) {
      setError(mapBackendError(err));
    } finally {
      setLoading(false);
    }
  }, [profile, school?.timezone, selectedSchoolId]);

  useEffect(() => {
    fetchLinkedChildrenAndTracking();
  }, [fetchLinkedChildrenAndTracking]);

  useRealtimeTracking(selectedSchoolId, fetchLinkedChildrenAndTracking);

  // Load history when on history tab
  const fetchHistoryForDate = useCallback(async () => {
    const studentIds = childrenWithTracking.map((c) => c.student.id);
    if (studentIds.length === 0) return;

    setLoadingHistory(true);
    try {
      const { data, error: histErr } = await supabase
        .from('daily_tracking')
        .select('*')
        .in('student_id', studentIds)
        .eq('tracking_date', historyDate);

      if (histErr) throw histErr;

      const map: Record<string, DailyTracking> = {};
      for (const row of (data || []) as DailyTracking[]) {
        map[row.student_id] = row;
      }
      setHistoryTrackingMap(map);
    } catch {
      // Keep existing state on error
    } finally {
      setLoadingHistory(false);
    }
  }, [childrenWithTracking, historyDate]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistoryForDate();
    }
  }, [activeTab, fetchHistoryForDate]);

  const linkedStudents = childrenWithTracking.map((c) => c.student);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Top App Header */}
      <header className="bg-indigo-950 text-white px-5 pt-6 pb-6 rounded-b-3xl shadow-xs">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
              {school?.school_name || 'School Portal'}
            </p>
            <h1 className="text-xl font-bold mt-0.5">
              Hello, {profile?.full_name || 'Parent'}
            </h1>
          </div>
          <button
            type="button"
            onClick={fetchLinkedChildrenAndTracking}
            disabled={loading}
            className="w-10 h-10 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            aria-label="Refresh tracking"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 mt-5 space-y-4">
        {!isOnline && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-rose-800 text-sm font-medium">
            <WifiOff className="w-5 h-5 text-rose-600 shrink-0" />
            <span>
              No internet connection. Showing last synced tracking status.
            </span>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Unable to load tracking</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* TAB 1: HOME (STUDENT CARDS + VERTICAL TIMELINE) */}
        {activeTab === 'home' && (
          <>
            {loading && childrenWithTracking.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-10 flex flex-col items-center justify-center text-slate-500">
                <Loader2 className="w-7 h-7 animate-spin text-indigo-600 mb-2.5" />
                <p className="text-sm font-medium">
                  Loading today&apos;s student tracking...
                </p>
              </div>
            ) : childrenWithTracking.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center">
                <ShieldCheck className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <h2 className="text-base font-bold text-slate-900">
                  No Linked Students Found
                </h2>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  Your parent account is not linked to any active student yet.
                  Please contact your school administrator.
                </p>
              </div>
            ) : (
              childrenWithTracking.map(({ student, tracking }) => {
                const status = getStudentCurrentStatus(tracking);
                const nextParentAction = determineNextParentEvent(tracking);

                const badgeStyles = {
                  emerald:
                    'bg-emerald-50 text-emerald-700 border-emerald-200',
                  blue: 'bg-blue-50 text-blue-700 border-blue-200',
                  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                  amber: 'bg-amber-50 text-amber-800 border-amber-200',
                  slate: 'bg-slate-100 text-slate-700 border-slate-200',
                }[status.badgeColor];

                return (
                  <div
                    key={student.id}
                    className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden"
                  >
                    {/* Student Card Header */}
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <StudentAvatar
                          photoUrl={student.photo_url}
                          fullName={student.full_name}
                          size="lg"
                        />
                        <div className="min-w-0">
                          <h2 className="text-lg font-bold text-slate-900 truncate">
                            {student.full_name}
                          </h2>
                          <p className="text-xs font-medium text-slate-500 mt-0.5">
                            Class {student.student_class} • Roll{' '}
                            {student.roll_number}
                          </p>
                          <span
                            className={`mt-2 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${badgeStyles}`}
                          >
                            {status.label}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setQrModalStudent(student)}
                        className="shrink-0 flex flex-col items-center justify-center p-2.5 rounded-2xl bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 transition-colors"
                        title="View Digital QR ID Card"
                      >
                        <QrCode className="w-5 h-5" />
                        <span className="text-[10px] font-semibold mt-1">
                          ID Card
                        </span>
                      </button>
                    </div>

                    {/* Today's 5-Step Vertical Timeline */}
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Today&apos;s Movement Timeline
                        </h3>
                        <span className="text-xs font-medium text-slate-500">
                          {formatReadableDate(
                            getTodayDateString(school?.timezone)
                          )}
                        </span>
                      </div>

                      <TimelineFiveStep
                        tracking={tracking}
                        timezone={school?.timezone}
                        showRoleBadge={true}
                      />

                      {/* Quick Action Callout if Home Exit or Home Arrival is due */}
                      {nextParentAction.event && (
                        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-slate-800">
                              Next Parent Checkpoint Ready
                            </p>
                            <p className="text-xs text-slate-500">
                              Scan student QR to record{' '}
                              <span className="font-semibold text-indigo-700">
                                {EVENT_LABELS[nextParentAction.event]}
                              </span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab('scan')}
                            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 shadow-xs transition-colors"
                          >
                            <QrCode className="w-4 h-4" />
                            Scan Now
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* TAB 2: PARENT QR SCANNER */}
        {activeTab === 'scan' && (
          <QrScannerView
            role="parent"
            schoolId={selectedSchoolId}
            schoolTimezone={school?.timezone}
            allowedStudents={linkedStudents}
            onScanSuccess={async () => {
              await fetchLinkedChildrenAndTracking();
            }}
            onClose={() => setActiveTab('home')}
          />
        )}

        {/* TAB 3: HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl border border-slate-200 p-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Calendar className="w-5 h-5 text-indigo-600" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Tracking History
                  </h2>
                  <p className="text-xs text-slate-500">
                    Select date to view daily checkpoints
                  </p>
                </div>
              </div>
              <input
                type="date"
                value={historyDate}
                max={getTodayDateString(school?.timezone)}
                onChange={(e) => setHistoryDate(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            {loadingHistory ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : (
              childrenWithTracking.map(({ student }) => {
                const dayRecord = historyTrackingMap[student.id] || null;
                return (
                  <div
                    key={student.id}
                    className="bg-white rounded-3xl border border-slate-200 p-5"
                  >
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <StudentAvatar
                          photoUrl={student.photo_url}
                          fullName={student.full_name}
                          size="sm"
                        />
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">
                            {student.full_name}
                          </h3>
                          <p className="text-xs text-slate-500">
                            {formatReadableDate(historyDate)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <TimelineFiveStep
                      tracking={dayRecord}
                      timezone={school?.timezone}
                      showRoleBadge={true}
                    />
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 4: PROFILE */}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg">
                <User className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Parent Account
                </span>
                <h2 className="text-lg font-bold text-slate-900 mt-1">
                  {profile?.full_name}
                </h2>
                <p className="text-xs text-slate-500">
                  {school?.school_name || 'Verified School'}
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-600">
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">School Code</span>
                <span className="font-semibold text-slate-900">
                  {school?.school_code || '—'}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Linked Children</span>
                <span className="font-semibold text-slate-900">
                  {childrenWithTracking.length}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={signOut}
              className="w-full py-3.5 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        )}
      </main>

      {/* Digital QR Student ID Card Modal */}
      {qrModalStudent && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <StudentQrIdCard
            student={qrModalStudent}
            school={school}
            onClose={() => setQrModalStudent(null)}
          />
        </div>
      )}

      <BottomNav
        role="parent"
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />
    </div>
  );
}
