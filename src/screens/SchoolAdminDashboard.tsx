import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Building2,
  Camera,
  CheckCircle2,
  ChevronRight,
  Home,
  Loader2,
  LogOut,
  QrCode,
  RefreshCw,
  Search,
  Shield,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, getTodayDateString } from '../lib/supabase';
import { mapBackendError } from '../lib/errorMapper';
import { uploadStudentPhoto } from '../lib/photoStorage';
import {
  EVENT_LABELS,
  EVENT_ROLE_LABELS,
  ORDERED_EVENTS,
  formatReadableDate,
  formatTime,
  getStudentCurrentStatus,
} from '../lib/trackingRpc';
import { useRealtimeTracking } from '../hooks/useRealtimeTracking';
import { StudentAvatar } from '../components/StudentAvatar';
import { TimelineFiveStep } from '../components/TimelineFiveStep';
import { StudentQrIdCard } from '../components/StudentQrIdCard';
import { BottomNav } from '../components/BottomNav';
import type {
  DailyTracking,
  Profile,
  ScanLog,
  Student,
} from '../types/database';

export function SchoolAdminDashboard() {
  const {
    profile,
    school,
    availableSchools,
    selectedSchoolId,
    setSuperAdminSchoolId,
    isOnline,
    signOut,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [staffFilterRole, setStaffFilterRole] = useState<
    'all' | 'teacher' | 'parent' | 'security'
  >('all');

  const [students, setStudents] = useState<Student[]>([]);
  const [todayTrackingMap, setTodayTrackingMap] = useState<
    Record<string, DailyTracking>
  >({});
  const [staffProfiles, setStaffProfiles] = useState<Profile[]>([]);
  const [todayScansCount, setTodayScansCount] = useState<number>(0);
  const [recentScanLogs, setRecentScanLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Admin Student Screen filters
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Selected Student Detail Drawer
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedStudentHistory, setSelectedStudentHistory] = useState<
    DailyTracking[]
  >([]);
  const [loadingStudentHistory, setLoadingStudentHistory] =
    useState<boolean>(false);
  const [showQrIdModal, setShowQrIdModal] = useState<boolean>(false);
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);
  const [photoUploadMessage, setPhotoUploadMessage] = useState<string | null>(
    null
  );

  // Tracking Screen filters (Date, Class, Student)
  const [trackingDate, setTrackingDate] = useState<string>(() =>
    getTodayDateString(school?.timezone)
  );
  const [trackingClassFilter, setTrackingClassFilter] = useState<string>('ALL');
  const [trackingStudentId, setTrackingStudentId] = useState<string>('');
  const [dateTrackingMap, setDateTrackingMap] = useState<
    Record<string, DailyTracking>
  >({});
  const [loadingDateTracking, setLoadingDateTracking] =
    useState<boolean>(false);

  const fetchAdminOverview = useCallback(async () => {
    if (!selectedSchoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const todayDate = getTodayDateString(school?.timezone);

      // 1. Fetch school students
      const { data: stuData, error: stuErr } = await supabase
        .from('students')
        .select(
          'id, school_id, student_id, full_name, student_class, roll_number, parent_id, photo_url, qr_token, active, created_at'
        )
        .eq('school_id', selectedSchoolId)
        .order('student_class', { ascending: true })
        .order('roll_number', { ascending: true });

      if (stuErr) throw stuErr;
      const studentsList = (stuData || []) as Student[];
      setStudents(studentsList);

      if (!trackingStudentId && studentsList.length > 0) {
        setTrackingStudentId(studentsList[0].id);
      }

      // 2. Fetch today's tracking rows for this school
      const { data: trackData, error: trackErr } = await supabase
        .from('daily_tracking')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .eq('tracking_date', todayDate);

      if (trackErr) throw trackErr;
      const tMap: Record<string, DailyTracking> = {};
      for (const row of (trackData || []) as DailyTracking[]) {
        tMap[row.student_id] = row;
      }
      setTodayTrackingMap(tMap);

      // 3. Fetch school profiles (teachers, parents, security, school_admin)
      const { data: profData } = await supabase
        .from('profiles')
        .select('id, school_id, full_name, role, active, created_at')
        .eq('school_id', selectedSchoolId)
        .order('full_name', { ascending: true });

      setStaffProfiles((profData || []) as Profile[]);

      // 4. Fetch today's scan logs
      const { data: scansData } = await supabase
        .from('scan_logs')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .order('scanned_at', { ascending: false })
        .limit(100);

      const scanRows = (scansData || []) as ScanLog[];
      const todayScans = scanRows.filter((s) =>
        s.scanned_at?.startsWith(todayDate)
      );
      setTodayScansCount(todayScans.length || scanRows.length);
      setRecentScanLogs(scanRows);
    } catch (err) {
      setError(mapBackendError(err));
    } finally {
      setLoading(false);
    }
  }, [school?.timezone, selectedSchoolId, trackingStudentId]);

  useEffect(() => {
    fetchAdminOverview();
  }, [fetchAdminOverview]);

  useRealtimeTracking(selectedSchoolId, fetchAdminOverview);

  // Fetch tracking rows for selected `trackingDate` in Tracking Screen
  const fetchTrackingByDate = useCallback(async () => {
    if (!selectedSchoolId) return;
    setLoadingDateTracking(true);
    try {
      const { data, error: err } = await supabase
        .from('daily_tracking')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .eq('tracking_date', trackingDate);

      if (err) throw err;
      const map: Record<string, DailyTracking> = {};
      for (const r of (data || []) as DailyTracking[]) {
        map[r.student_id] = r;
      }
      setDateTrackingMap(map);
    } catch {
      // Keep existing
    } finally {
      setLoadingDateTracking(false);
    }
  }, [selectedSchoolId, trackingDate]);

  useEffect(() => {
    if (activeTab === 'tracking' || activeTab === 'reports') {
      fetchTrackingByDate();
    }
  }, [activeTab, fetchTrackingByDate]);

  // Open Student detail & fetch their tracking history
  const handleOpenStudentDetail = async (student: Student) => {
    setSelectedStudent(student);
    setPhotoUploadMessage(null);
    setLoadingStudentHistory(true);
    try {
      const { data } = await supabase
        .from('daily_tracking')
        .select('*')
        .eq('school_id', student.school_id)
        .eq('student_id', student.id)
        .order('tracking_date', { ascending: false })
        .limit(14);
      setSelectedStudentHistory((data || []) as DailyTracking[]);
    } finally {
      setLoadingStudentHistory(false);
    }
  };

  // Compress and upload student photo to Supabase Storage (never Base64 in PostgreSQL)
  const handlePhotoFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !selectedStudent) return;

    setUploadingPhoto(true);
    setPhotoUploadMessage(null);
    try {
      const newPhotoUrl = await uploadStudentPhoto(
        selectedStudent.school_id,
        selectedStudent.id,
        file
      );
      setSelectedStudent({ ...selectedStudent, photo_url: newPhotoUrl });
      setStudents((prev) =>
        prev.map((s) =>
          s.id === selectedStudent.id ? { ...s, photo_url: newPhotoUrl } : s
        )
      );
      setPhotoUploadMessage('Student photo uploaded to Supabase Storage.');
    } catch (err) {
      setPhotoUploadMessage(mapBackendError(err));
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Computed metrics for Dashboard Cards
  const metrics = useMemo(() => {
    const totalStudents = students.length;
    let presentInSchool = 0;
    let atHome = 0;

    for (const s of students) {
      const t = todayTrackingMap[s.id];
      if (t && (t.school_arrival_at || t.class_arrival_at) && !t.school_exit_at) {
        presentInSchool++;
      } else {
        atHome++;
      }
    }

    const teachersCount = staffProfiles.filter(
      (p) => p.role === 'teacher'
    ).length;
    const parentsCount = staffProfiles.filter(
      (p) => p.role === 'parent'
    ).length;
    const securityCount = staffProfiles.filter(
      (p) => p.role === 'security'
    ).length;

    return {
      totalStudents,
      presentInSchool,
      atHome,
      teachersCount,
      parentsCount,
      securityCount,
    };
  }, [students, todayTrackingMap, staffProfiles]);

  const distinctClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.student_class) set.add(s.student_class);
    });
    return Array.from(set).sort();
  }, [students]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (classFilter !== 'ALL' && s.student_class !== classFilter) {
        return false;
      }

      const q = studentSearch.trim().toLowerCase();
      if (
        q &&
        !s.full_name.toLowerCase().includes(q) &&
        !s.student_id.toLowerCase().includes(q) &&
        !s.roll_number.toLowerCase().includes(q)
      ) {
        return false;
      }

      if (statusFilter !== 'ALL') {
        const t = todayTrackingMap[s.id];
        if (statusFilter === 'IN_SCHOOL') {
          return Boolean(
            t && (t.school_arrival_at || t.class_arrival_at) && !t.school_exit_at
          );
        }
        if (statusFilter === 'IN_CLASS') {
          return Boolean(t?.class_arrival_at && !t?.school_exit_at);
        }
        if (statusFilter === 'AT_HOME') {
          return Boolean(!t || !t.home_exit_at || t.home_arrival_at);
        }
        if (statusFilter === 'IN_TRANSIT') {
          return Boolean(
            (t?.home_exit_at && !t?.school_arrival_at) ||
              (t?.school_exit_at && !t?.home_arrival_at)
          );
        }
      }

      return true;
    });
  }, [students, classFilter, studentSearch, statusFilter, todayTrackingMap]);

  const trackingFilteredStudents = useMemo(() => {
    return students.filter(
      (s) =>
        trackingClassFilter === 'ALL' || s.student_class === trackingClassFilter
    );
  }, [students, trackingClassFilter]);

  const activeTrackingStudent = useMemo(() => {
    return (
      trackingFilteredStudents.find((s) => s.id === trackingStudentId) ||
      trackingFilteredStudents[0] ||
      null
    );
  }, [trackingFilteredStudents, trackingStudentId]);

  const activeStudentDateTracking = activeTrackingStudent
    ? dateTrackingMap[activeTrackingStudent.id] || null
    : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Admin Header */}
      <header className="bg-indigo-950 text-white px-5 pt-6 pb-6 rounded-b-3xl shadow-xs">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-300">
                {profile?.role === 'super_admin'
                  ? 'Super Admin Console'
                  : 'School Administration'}
              </span>
            </div>
            <h1 className="text-xl font-bold mt-0.5">
              {school?.school_name || 'School Dashboard'}
            </h1>
            <p className="text-xs text-indigo-200 mt-0.5">
              {profile?.full_name} • Code: {school?.school_code || '—'}
            </p>
          </div>

          <button
            type="button"
            onClick={fetchAdminOverview}
            disabled={loading}
            className="w-10 h-10 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            aria-label="Refresh school data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Super Admin Only: Multi-School Switcher */}
        {profile?.role === 'super_admin' && availableSchools.length > 1 && (
          <div className="max-w-xl mx-auto mt-4 pt-3 border-t border-indigo-900 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-indigo-200 flex items-center gap-1.5">
              <Building2 className="w-4 h-4" />
              Active School:
            </span>
            <select
              value={selectedSchoolId || ''}
              onChange={(e) => setSuperAdminSchoolId(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-indigo-900 text-white text-xs font-semibold border border-indigo-700 focus:outline-none"
            >
              {availableSchools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.school_name} ({s.school_code})
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      <main className="max-w-xl mx-auto px-4 mt-5 space-y-4">
        {!isOnline && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-rose-800 text-sm font-medium">
            <WifiOff className="w-5 h-5 text-rose-600 shrink-0" />
            <span>No internet connection. Showing last synced school data.</span>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
            {error}
          </div>
        )}

        {/* TAB 1: DASHBOARD OVERVIEW */}
        {activeTab === 'dashboard' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('ALL');
                  setActiveTab('students');
                }}
                className="bg-white rounded-3xl border border-slate-200 p-4 text-left hover:border-indigo-300 transition-colors shadow-2xs"
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-slate-900 mt-3">
                  {metrics.totalStudents}
                </p>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                  Students
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilter('IN_SCHOOL');
                  setActiveTab('students');
                }}
                className="bg-white rounded-3xl border border-slate-200 p-4 text-left hover:border-emerald-300 transition-colors shadow-2xs"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-emerald-700 mt-3">
                  {metrics.presentInSchool}
                </p>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                  Present / In School
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilter('AT_HOME');
                  setActiveTab('students');
                }}
                className="bg-white rounded-3xl border border-slate-200 p-4 text-left hover:border-slate-300 transition-colors shadow-2xs"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                  <Home className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-slate-900 mt-3">
                  {metrics.atHome}
                </p>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                  At Home
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStaffFilterRole('teacher');
                  setActiveTab('staff');
                }}
                className="bg-white rounded-3xl border border-slate-200 p-4 text-left hover:border-indigo-300 transition-colors shadow-2xs"
              >
                <p className="text-xs font-semibold text-slate-500">Teachers</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {metrics.teachersCount}
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStaffFilterRole('parent');
                  setActiveTab('staff');
                }}
                className="bg-white rounded-3xl border border-slate-200 p-4 text-left hover:border-indigo-300 transition-colors shadow-2xs"
              >
                <p className="text-xs font-semibold text-slate-500">Parents</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {metrics.parentsCount}
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStaffFilterRole('security');
                  setActiveTab('staff');
                }}
                className="bg-white rounded-3xl border border-slate-200 p-4 text-left hover:border-indigo-300 transition-colors shadow-2xs"
              >
                <p className="text-xs font-semibold text-slate-500">Security</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {metrics.securityCount}
                </p>
              </button>
            </div>

            {/* Today's Scans Summary Card */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">
                    Today&apos;s Scans
                  </p>
                  <p className="text-2xl font-bold text-slate-900">
                    {todayScansCount}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('tracking')}
                className="px-4 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors"
              >
                Inspect Tracking
              </button>
            </div>

            {/* Quick Student Movement List */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-900">
                  Today&apos;s Student Status
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('students')}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  View All ({students.length})
                </button>
              </div>

              {loading && students.length === 0 ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                </div>
              ) : students.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  No students registered in this school yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {students.slice(0, 6).map((stu) => {
                    const t = todayTrackingMap[stu.id] || null;
                    const status = getStudentCurrentStatus(t);
                    return (
                      <button
                        key={stu.id}
                        type="button"
                        onClick={() => handleOpenStudentDetail(stu)}
                        className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 rounded-xl px-2 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <StudentAvatar
                            photoUrl={stu.photo_url}
                            fullName={stu.full_name}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {stu.full_name}
                            </p>
                            <p className="text-xs text-slate-500">
                              Class {stu.student_class} • Roll {stu.roll_number}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                            {status.label}
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 2: ADMIN STUDENT SCREEN */}
        {activeTab === 'students' && (
          <div className="space-y-4">
            {/* Search, Class Filter, Status Filter */}
            <div className="bg-white rounded-3xl border border-slate-200 p-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search by student name, ID, or roll number..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 bg-white"
                >
                  <option value="ALL">All Classes</option>
                  {distinctClasses.map((cls) => (
                    <option key={cls} value={cls}>
                      Class {cls}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 bg-white"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="IN_SCHOOL">Present / In School</option>
                  <option value="IN_CLASS">In Classroom</option>
                  <option value="IN_TRANSIT">In Transit</option>
                  <option value="AT_HOME">At Home</option>
                </select>
              </div>
            </div>

            {/* Filtered Student Cards */}
            <div className="space-y-2.5">
              {filteredStudents.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                  No students match the selected filters.
                </div>
              ) : (
                filteredStudents.map((stu) => {
                  const tracking = todayTrackingMap[stu.id] || null;
                  const status = getStudentCurrentStatus(tracking);
                  return (
                    <button
                      key={stu.id}
                      type="button"
                      onClick={() => handleOpenStudentDetail(stu)}
                      className="w-full bg-white rounded-3xl border border-slate-200 p-4 flex items-center justify-between gap-3 text-left hover:border-indigo-300 transition-colors shadow-2xs"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <StudentAvatar
                          photoUrl={stu.photo_url}
                          fullName={stu.full_name}
                          size="md"
                        />
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 truncate">
                            {stu.full_name}
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            ID: {stu.student_id} • Class {stu.student_class} •
                            Roll {stu.roll_number}
                          </p>
                          <span className="mt-1.5 inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-700">
                            {status.label}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 3: TRACKING SCREEN (Date, Class, Student -> Five-step timeline) */}
        {activeTab === 'tracking' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3.5">
              <h2 className="text-base font-bold text-slate-900">
                Daily Checkpoint Inspector
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={trackingDate}
                    max={getTodayDateString(school?.timezone)}
                    onChange={(e) => setTrackingDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Class
                  </label>
                  <select
                    value={trackingClassFilter}
                    onChange={(e) => {
                      setTrackingClassFilter(e.target.value);
                      setTrackingStudentId('');
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white"
                  >
                    <option value="ALL">All Classes</option>
                    {distinctClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        Class {cls}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Student
                  </label>
                  <select
                    value={activeTrackingStudent?.id || ''}
                    onChange={(e) => setTrackingStudentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white"
                  >
                    {trackingFilteredStudents.map((stu) => (
                      <option key={stu.id} value={stu.id}>
                        {stu.full_name} ({stu.student_class} - Roll{' '}
                        {stu.roll_number})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {loadingDateTracking ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : activeTrackingStudent ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-5">
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <StudentAvatar
                      photoUrl={activeTrackingStudent.photo_url}
                      fullName={activeTrackingStudent.full_name}
                      size="md"
                    />
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {activeTrackingStudent.full_name}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Class {activeTrackingStudent.student_class} • Roll{' '}
                        {activeTrackingStudent.roll_number} •{' '}
                        {formatReadableDate(trackingDate)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Detailed 5-step display with timestamp, status, and scan role */}
                <div className="space-y-3">
                  {ORDERED_EVENTS.map((event) => {
                    const timestamp = activeStudentDateTracking
                      ? ({
                          home_exit: activeStudentDateTracking.home_exit_at,
                          school_arrival:
                            activeStudentDateTracking.school_arrival_at,
                          class_arrival:
                            activeStudentDateTracking.class_arrival_at,
                          school_exit: activeStudentDateTracking.school_exit_at,
                          home_arrival:
                            activeStudentDateTracking.home_arrival_at,
                        }[event] ?? null)
                      : null;

                    const completed = Boolean(timestamp);

                    return (
                      <div
                        key={event}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                          completed
                            ? 'bg-emerald-50/40 border-emerald-200'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {EVENT_LABELS[event]}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Role: {EVENT_ROLE_LABELS[event]}
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className={`text-sm font-bold ${
                              completed ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                          >
                            {formatTime(timestamp, school?.timezone)}
                          </p>
                          <span
                            className={`text-[11px] font-semibold ${
                              completed ? 'text-emerald-600' : 'text-slate-400'
                            }`}
                          >
                            {completed ? 'Completed' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                Select a student to view their five-step tracking timeline.
              </div>
            )}
          </div>
        )}

        {/* TAB 4: STAFF & PARENTS DIRECTORY (Teachers, Parents, Security) */}
        {activeTab === 'staff' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-base font-bold text-slate-900">
                School Users Directory
              </h2>
              <div className="flex gap-1.5">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'teacher', label: 'Teachers' },
                    { id: 'parent', label: 'Parents' },
                    { id: 'security', label: 'Security' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStaffFilterRole(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      staffFilterRole === tab.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {staffProfiles
                .filter(
                  (p) =>
                    staffFilterRole === 'all' || p.role === staffFilterRole
                )
                .map((member) => (
                  <div
                    key={member.id}
                    className="py-3.5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {member.full_name}
                      </p>
                      <p className="text-xs text-slate-500 capitalize">
                        Role: {member.role.replace('_', ' ')}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
                        member.active
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {member.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 5: REPORTS */}
        {activeTab === 'reports' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">
                  Daily Checkpoint Summary Report
                </h2>
              </div>
              <input
                type="date"
                value={trackingDate}
                max={getTodayDateString(school?.timezone)}
                onChange={(e) => setTrackingDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold"
              />
            </div>

            <div className="space-y-2.5">
              {ORDERED_EVENTS.map((event) => {
                const rows = Object.values(dateTrackingMap) as DailyTracking[];
                const count = rows.filter((r) => {
                  switch (event) {
                    case 'home_exit':
                      return Boolean(r.home_exit_at);
                    case 'school_arrival':
                      return Boolean(r.school_arrival_at);
                    case 'class_arrival':
                      return Boolean(r.class_arrival_at);
                    case 'school_exit':
                      return Boolean(r.school_exit_at);
                    case 'home_arrival':
                      return Boolean(r.home_arrival_at);
                  }
                }).length;

                const pct =
                  students.length > 0
                    ? Math.round((count / students.length) * 100)
                    : 0;

                return (
                  <div
                    key={event}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-800 mb-1.5">
                      <span>{EVENT_LABELS[event]}</span>
                      <span>
                        {count} / {students.length} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 6: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {school?.school_name || 'School Settings'}
                </h2>
                <p className="text-xs text-slate-500">
                  School Code: {school?.school_code || '—'} • Timezone:{' '}
                  {school?.timezone || 'Local'}
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-2 text-xs">
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Administrator Name</span>
                <span className="font-semibold text-slate-900">
                  {profile?.full_name}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Role</span>
                <span className="font-semibold text-slate-900 uppercase">
                  {profile?.role}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Tracking Engine</span>
                <span className="font-semibold text-emerald-700">
                  scan_student_event RPC Enforced
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

      {/* STUDENT PROFILE + QR + TODAY'S TIMELINE + HISTORY MODAL */}
      {selectedStudent && (
        <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto p-5 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <StudentAvatar
                    photoUrl={selectedStudent.photo_url}
                    fullName={selectedStudent.full_name}
                    size="lg"
                  />
                  <label
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center cursor-pointer shadow-xs"
                    title="Upload photo to Supabase Storage"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Camera className="w-3.5 h-3.5" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoFileChange}
                      disabled={uploadingPhoto}
                      className="hidden"
                    />
                  </label>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {selectedStudent.full_name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    ID: {selectedStudent.student_id} • Class{' '}
                    {selectedStudent.student_class} • Roll{' '}
                    {selectedStudent.roll_number}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {photoUploadMessage && (
              <p className="text-xs font-medium text-indigo-700 bg-indigo-50 px-3 py-2 rounded-xl">
                {photoUploadMessage}
              </p>
            )}

            <button
              type="button"
              onClick={() => setShowQrIdModal(true)}
              className="w-full py-3 px-4 rounded-2xl bg-indigo-950 hover:bg-indigo-900 text-white text-xs font-semibold flex items-center justify-center gap-2"
            >
              <QrCode className="w-4 h-4" />
              Open Digital QR Student ID Card
            </button>

            {/* Today's Tracking Timeline */}
            <div className="pt-3 border-t border-slate-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Today&apos;s Tracking Timeline
              </h4>
              <TimelineFiveStep
                tracking={todayTrackingMap[selectedStudent.id] || null}
                timezone={school?.timezone}
                showRoleBadge={true}
              />
            </div>

            {/* Tracking History */}
            <div className="pt-3 border-t border-slate-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Recent Daily Tracking History
              </h4>
              {loadingStudentHistory ? (
                <div className="py-4 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                </div>
              ) : selectedStudentHistory.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No historical tracking records found.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedStudentHistory.map((row) => (
                    <div
                      key={row.id}
                      className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs"
                    >
                      <p className="font-bold text-slate-800 mb-1.5">
                        {formatReadableDate(row.tracking_date)}
                      </p>
                      <div className="grid grid-cols-5 gap-1 text-[11px] text-center">
                        <div className="bg-white p-1.5 rounded-lg border border-slate-200">
                          <span className="block text-slate-400">H.Exit</span>
                          <span className="font-semibold text-slate-800">
                            {formatTime(row.home_exit_at, school?.timezone)}
                          </span>
                        </div>
                        <div className="bg-white p-1.5 rounded-lg border border-slate-200">
                          <span className="block text-slate-400">S.Arr</span>
                          <span className="font-semibold text-slate-800">
                            {formatTime(row.school_arrival_at, school?.timezone)}
                          </span>
                        </div>
                        <div className="bg-white p-1.5 rounded-lg border border-slate-200">
                          <span className="block text-slate-400">Class</span>
                          <span className="font-semibold text-slate-800">
                            {formatTime(row.class_arrival_at, school?.timezone)}
                          </span>
                        </div>
                        <div className="bg-white p-1.5 rounded-lg border border-slate-200">
                          <span className="block text-slate-400">S.Exit</span>
                          <span className="font-semibold text-slate-800">
                            {formatTime(row.school_exit_at, school?.timezone)}
                          </span>
                        </div>
                        <div className="bg-white p-1.5 rounded-lg border border-slate-200">
                          <span className="block text-slate-400">H.Arr</span>
                          <span className="font-semibold text-slate-800">
                            {formatTime(row.home_arrival_at, school?.timezone)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Digital QR Student ID Card Modal */}
      {showQrIdModal && selectedStudent && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <StudentQrIdCard
            student={selectedStudent}
            school={school}
            onClose={() => setShowQrIdModal(false)}
          />
        </div>
      )}

      <BottomNav
        role={profile?.role || 'school_admin'}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />
    </div>
  );
}
