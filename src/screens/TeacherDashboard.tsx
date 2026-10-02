import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Loader2,
  LogOut,
  QrCode,
  RefreshCw,
  User,
  Users,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, getTodayDateString } from '../lib/supabase';
import { mapBackendError } from '../lib/errorMapper';
import { formatTime, getStudentCurrentStatus } from '../lib/trackingRpc';
import { useRealtimeTracking } from '../hooks/useRealtimeTracking';
import { QrScannerView } from '../components/QrScannerView';
import { BottomNav } from '../components/BottomNav';
import { StudentAvatar } from '../components/StudentAvatar';
import type {
  DailyTracking,
  Student,
  StudentWithTracking,
  TeacherClass,
} from '../types/database';

export function TeacherDashboard() {
  const { profile, school, selectedSchoolId, isOnline, signOut } = useAuth();

  const [activeTab, setActiveTab] = useState<string>('home');
  const [assignedClasses, setAssignedClasses] = useState<TeacherClass[]>([]);
  const [selectedClassName, setSelectedClassName] = useState<string>('');
  const [classStudents, setClassStudents] = useState<StudentWithTracking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeacherData = useCallback(async () => {
    if (!profile || !selectedSchoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Fetch teacher's assigned classes from `public.teacher_classes`
      const { data: tcData, error: tcError } = await supabase
        .from('teacher_classes')
        .select('id, teacher_id, school_id, class_name, active, created_at')
        .eq('teacher_id', profile.id)
        .eq('school_id', selectedSchoolId)
        .eq('active', true)
        .order('class_name', { ascending: true });

      if (tcError) throw tcError;

      const classesList = (tcData || []) as TeacherClass[];
      setAssignedClasses(classesList);

      const activeClass =
        selectedClassName &&
        classesList.some((c) => c.class_name === selectedClassName)
          ? selectedClassName
          : classesList[0]?.class_name || '';

      setSelectedClassName(activeClass);

      if (!activeClass) {
        setClassStudents([]);
        setLoading(false);
        return;
      }

      // 2. Fetch students belonging to the teacher's assigned class
      const { data: studentsData, error: stuError } = await supabase
        .from('students')
        .select(
          'id, school_id, student_id, full_name, student_class, roll_number, parent_id, photo_url, qr_token, active, created_at'
        )
        .eq('school_id', selectedSchoolId)
        .eq('student_class', activeClass)
        .eq('active', true)
        .order('roll_number', { ascending: true });

      if (stuError) throw stuError;

      const studentsList = (studentsData || []) as Student[];
      const studentIds = studentsList.map((s) => s.id);

      if (studentIds.length === 0) {
        setClassStudents([]);
        setLoading(false);
        return;
      }

      // 3. Fetch today's tracking for these students
      const todayDate = getTodayDateString(school?.timezone);
      const { data: trackingData, error: trackError } = await supabase
        .from('daily_tracking')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .in('student_id', studentIds)
        .eq('tracking_date', todayDate);

      if (trackError) throw trackError;

      const trackingMap: Record<string, DailyTracking> = {};
      for (const row of (trackingData || []) as DailyTracking[]) {
        trackingMap[row.student_id] = row;
      }

      setClassStudents(
        studentsList.map((student) => ({
          student,
          tracking: trackingMap[student.id] || null,
        }))
      );
    } catch (err) {
      setError(mapBackendError(err));
    } finally {
      setLoading(false);
    }
  }, [profile, school?.timezone, selectedClassName, selectedSchoolId]);

  useEffect(() => {
    fetchTeacherData();
  }, [fetchTeacherData]);

  useRealtimeTracking(selectedSchoolId, fetchTeacherData);

  const totalStudents = classStudents.length;
  const classArrivedCount = classStudents.filter((item) =>
    Boolean(item.tracking?.class_arrival_at)
  ).length;
  const waitingCount = Math.max(0, totalStudents - classArrivedCount);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <header className="bg-indigo-950 text-white px-5 pt-6 pb-6 rounded-b-3xl shadow-xs">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
              {school?.school_name || 'Teacher Portal'}
            </p>
            <h1 className="text-xl font-bold mt-0.5">
              Hello, {profile?.full_name || 'Teacher'}
            </h1>
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-xs font-semibold text-indigo-100">
              <BookOpen className="w-3.5 h-3.5" />
              <span>
                Assigned Class:{' '}
                {selectedClassName ? `Class ${selectedClassName}` : 'Unassigned'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchTeacherData}
            disabled={loading}
            className="w-10 h-10 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            aria-label="Refresh class data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Class switcher if teacher is assigned to multiple classes */}
        {assignedClasses.length > 1 && (
          <div className="max-w-xl mx-auto mt-4 flex gap-2 overflow-x-auto pb-1">
            {assignedClasses.map((tc) => (
              <button
                key={tc.id}
                type="button"
                onClick={() => setSelectedClassName(tc.class_name)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  selectedClassName === tc.class_name
                    ? 'bg-white text-indigo-950'
                    : 'bg-white/10 text-indigo-200 hover:bg-white/20'
                }`}
              >
                Class {tc.class_name}
              </button>
            ))}
          </div>
        )}
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

        {/* TAB 1: TEACHER HOME */}
        {activeTab === 'home' && (
          <>
            {/* Statistics Cards: Total students, Class arrived, Waiting */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-3xl border border-slate-200 p-4 text-center shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                  <Users className="w-4 h-4" />
                </div>
                <p className="text-2xl font-bold text-slate-900 mt-2">
                  {totalStudents}
                </p>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                  Total Students
                </p>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 p-4 text-center shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <p className="text-2xl font-bold text-emerald-700 mt-2">
                  {classArrivedCount}
                </p>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                  Class Arrived
                </p>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 p-4 text-center shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                  <Clock className="w-4 h-4" />
                </div>
                <p className="text-2xl font-bold text-amber-700 mt-2">
                  {waitingCount}
                </p>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                  Waiting
                </p>
              </div>
            </div>

            {/* Large SCAN STUDENT QR Button */}
            <button
              type="button"
              onClick={() => setActiveTab('scan')}
              className="w-full py-6 px-6 rounded-3xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white shadow-md flex items-center justify-between transition-all"
            >
              <div className="text-left">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-200">
                  Classroom Checkpoint
                </span>
                <h2 className="text-xl font-bold mt-1">SCAN STUDENT QR</h2>
                <p className="text-xs text-indigo-100 mt-0.5">
                  Records Class Arrival for Class {selectedClassName || '—'}
                </p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                <QrCode className="w-8 h-8 text-white" />
              </div>
            </button>

            {/* Quick Class Roster Status */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Class {selectedClassName || '—'} Attendance Status
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('class')}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Full List
                </button>
              </div>

              {loading && classStudents.length === 0 ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                </div>
              ) : classStudents.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  No students found in your assigned class.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {classStudents.map(({ student, tracking }) => {
                    const arrivedInClass = Boolean(tracking?.class_arrival_at);
                    const arrivedAtSchool = Boolean(tracking?.school_arrival_at);
                    return (
                      <div
                        key={student.id}
                        className="py-3 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <StudentAvatar
                            photoUrl={student.photo_url}
                            fullName={student.full_name}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {student.full_name}
                            </p>
                            <p className="text-xs text-slate-500">
                              Roll {student.roll_number} • ID {student.student_id}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {arrivedInClass ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                              ✓ {formatTime(tracking?.class_arrival_at, school?.timezone)}
                            </span>
                          ) : arrivedAtSchool ? (
                            <span className="inline-block px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 text-xs font-semibold border border-amber-200">
                              At School Gate
                            </span>
                          ) : (
                            <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">
                              Waiting
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 2: TEACHER QR SCANNER */}
        {activeTab === 'scan' && (
          <QrScannerView
            role="teacher"
            schoolId={selectedSchoolId}
            schoolTimezone={school?.timezone}
            allowedStudents={classStudents.map((c) => c.student)}
            onScanSuccess={async () => {
              await fetchTeacherData();
            }}
            onClose={() => setActiveTab('home')}
          />
        )}

        {/* TAB 3: CLASS STUDENT LIST */}
        {activeTab === 'class' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-5">
            <h2 className="text-base font-bold text-slate-900 mb-4">
              Class {selectedClassName || '—'} Students ({totalStudents})
            </h2>
            {classStudents.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">
                No students assigned to this class.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {classStudents.map(({ student, tracking }) => {
                  const status = getStudentCurrentStatus(tracking);
                  return (
                    <div
                      key={student.id}
                      className="py-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <StudentAvatar
                          photoUrl={student.photo_url}
                          fullName={student.full_name}
                          size="md"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {student.full_name}
                          </p>
                          <p className="text-xs text-slate-500">
                            Roll {student.roll_number} • {student.student_id}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 shrink-0">
                        {status.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PROFILE */}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <User className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Class Teacher
                </span>
                <h2 className="text-lg font-bold text-slate-900 mt-1">
                  {profile?.full_name}
                </h2>
                <p className="text-xs text-slate-500">
                  {school?.school_name || 'Verified School'}
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-2 text-xs">
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Assigned Classes</span>
                <span className="font-semibold text-slate-900">
                  {assignedClasses.map((c) => c.class_name).join(', ') || 'None'}
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

      <BottomNav
        role="teacher"
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />
    </div>
  );
}
