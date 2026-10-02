import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  LogOut,
  QrCode,
  RefreshCw,
  Shield,
  User,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, getTodayDateString } from '../lib/supabase';
import { mapBackendError } from '../lib/errorMapper';
import { EVENT_LABELS, formatTime } from '../lib/trackingRpc';
import { useRealtimeTracking } from '../hooks/useRealtimeTracking';
import { QrScannerView } from '../components/QrScannerView';
import { BottomNav } from '../components/BottomNav';
import { StudentAvatar } from '../components/StudentAvatar';
import type { DailyTracking, ScanLog, Student } from '../types/database';

interface EnrichedScanLog {
  log: ScanLog;
  student: Student | null;
}

export function SecurityDashboard() {
  const { profile, school, selectedSchoolId, isOnline, signOut } = useAuth();

  const [activeTab, setActiveTab] = useState<string>('home');
  const [arrivalsCount, setArrivalsCount] = useState<number>(0);
  const [exitsCount, setExitsCount] = useState<number>(0);
  const [recentScans, setRecentScans] = useState<EnrichedScanLog[]>([]);
  const [schoolStudents, setSchoolStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSecurityData = useCallback(async () => {
    if (!selectedSchoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const todayDate = getTodayDateString(school?.timezone);

      // 1. Fetch today's tracking rows for this school
      const { data: trackingData, error: trackingErr } = await supabase
        .from('daily_tracking')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .eq('tracking_date', todayDate);

      if (trackingErr) throw trackingErr;

      const rows = (trackingData || []) as DailyTracking[];
      const arrivals = rows.filter((r) => Boolean(r.school_arrival_at)).length;
      const exits = rows.filter((r) => Boolean(r.school_exit_at)).length;

      setArrivalsCount(arrivals);
      setExitsCount(exits);

      // 2. Fetch active students in the security guard's school
      const { data: studentsData } = await supabase
        .from('students')
        .select(
          'id, school_id, student_id, full_name, student_class, roll_number, parent_id, photo_url, qr_token, active, created_at'
        )
        .eq('school_id', selectedSchoolId)
        .eq('active', true)
        .order('full_name', { ascending: true });

      const studentList = (studentsData || []) as Student[];
      setSchoolStudents(studentList);

      const studentMap: Record<string, Student> = {};
      for (const s of studentList) {
        studentMap[s.id] = s;
      }

      // 3. Fetch recent scan logs for this school
      const { data: logsData } = await supabase
        .from('scan_logs')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .order('scanned_at', { ascending: false })
        .limit(25);

      const enriched: EnrichedScanLog[] = ((logsData || []) as ScanLog[]).map(
        (log) => ({
          log,
          student: studentMap[log.student_id] || null,
        })
      );

      setRecentScans(enriched);
    } catch (err) {
      setError(mapBackendError(err));
    } finally {
      setLoading(false);
    }
  }, [school?.timezone, selectedSchoolId]);

  useEffect(() => {
    fetchSecurityData();
  }, [fetchSecurityData]);

  useRealtimeTracking(selectedSchoolId, fetchSecurityData);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <header className="bg-slate-900 text-white px-5 pt-6 pb-6 rounded-b-3xl shadow-xs">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
              <Shield className="w-6 h-6 text-indigo-300" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-300">
                Security Gate Control
              </span>
              <h1 className="text-lg font-bold text-white">
                {school?.school_name || 'School Security'}
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchSecurityData}
            disabled={loading}
            className="w-10 h-10 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            aria-label="Refresh security data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 mt-5 space-y-4">
        {!isOnline && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-rose-800 text-sm font-medium">
            <WifiOff className="w-5 h-5 text-rose-600 shrink-0" />
            <span>No internet connection. Scan was not recorded.</span>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
            {error}
          </div>
        )}

        {/* TAB 1: SECURITY HOME */}
        {activeTab === 'home' && (
          <>
            {/* Large Primary Scan Button */}
            <button
              type="button"
              onClick={() => setActiveTab('scan')}
              className="w-full py-6 px-6 rounded-3xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white shadow-md flex items-center justify-between transition-all"
            >
              <div className="text-left">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-200">
                  Gate Checkpoint Scanner
                </span>
                <h2 className="text-xl font-bold mt-1">SCAN STUDENT QR</h2>
                <p className="text-xs text-indigo-100 mt-0.5">
                  Automatically detects School Arrival or School Exit
                </p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                <QrCode className="w-8 h-8 text-white" />
              </div>
            </button>

            {/* Today's Arrivals & Exits Counters */}
            <div className="grid grid-cols-2 gap-3.5">
              <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">
                    Today&apos;s Arrivals
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <ArrowDownLeft className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {arrivalsCount}
                </p>
                <p className="text-[11px] text-emerald-700 font-medium mt-1">
                  School Arrival Recorded
                </p>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">
                    Today&apos;s Exits
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {exitsCount}
                </p>
                <p className="text-[11px] text-amber-700 font-medium mt-1">
                  School Exit Recorded
                </p>
              </div>
            </div>

            {/* Recent Scans List */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Recent Gate Scans
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('activity')}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  View All
                </button>
              </div>

              {loading && recentScans.length === 0 ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                </div>
              ) : recentScans.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  No scans recorded yet today.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentScans.slice(0, 8).map(({ log, student }) => (
                    <div
                      key={log.id}
                      className="py-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <StudentAvatar
                          photoUrl={student?.photo_url}
                          fullName={student?.full_name || 'Student'}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {student?.full_name || 'Verified Student'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {student
                              ? `Class ${student.student_class} • Roll ${student.roll_number}`
                              : log.event_type}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800">
                          {EVENT_LABELS[log.event_type] || log.event_type}
                        </span>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {formatTime(log.scanned_at, school?.timezone)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 2: SECURITY SCANNER */}
        {activeTab === 'scan' && (
          <QrScannerView
            role="security"
            schoolId={selectedSchoolId}
            schoolTimezone={school?.timezone}
            allowedStudents={schoolStudents}
            onScanSuccess={async () => {
              await fetchSecurityData();
            }}
            onClose={() => setActiveTab('home')}
          />
        )}

        {/* TAB 3: ACTIVITY LOG */}
        {activeTab === 'activity' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <Activity className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-bold text-slate-900">
                School Scan Activity
              </h2>
            </div>

            {recentScans.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">
                No scan activity recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentScans.map(({ log, student }) => (
                  <div
                    key={log.id}
                    className="py-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <StudentAvatar
                        photoUrl={student?.photo_url}
                        fullName={student?.full_name || 'Student'}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {student?.full_name || 'Student'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {student
                            ? `Class ${student.student_class} • ID ${student.student_id}`
                            : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700">
                        {EVENT_LABELS[log.event_type] || log.event_type}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {formatTime(log.scanned_at, school?.timezone)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PROFILE */}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                <User className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800">
                  Security Staff
                </span>
                <h2 className="text-lg font-bold text-slate-900 mt-1">
                  {profile?.full_name}
                </h2>
                <p className="text-xs text-slate-500">
                  {school?.school_name || 'Assigned School'}
                </p>
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

      <BottomNav
        role="security"
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />
    </div>
  );
}
