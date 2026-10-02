import React, { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  Loader2,
  QrCode,
  RefreshCw,
  WifiOff,
  X,
} from 'lucide-react';
import { supabase, getTodayDateString, isDeviceOnline } from '../lib/supabase';
import {
  determineNextEventForRole,
  EVENT_LABELS,
  executeScanStudentEvent,
  formatTime,
} from '../lib/trackingRpc';
import { mapBackendError } from '../lib/errorMapper';
import { StudentAvatar } from './StudentAvatar';
import type {
  DailyTracking,
  Student,
  TrackingEventType,
  UserRole,
} from '../types/database';

interface QrScannerViewProps {
  role: UserRole;
  schoolId: string | null;
  schoolTimezone?: string;
  /**
   * Optional pre-loaded list of allowed students for the current user (e.g. parent's linked children or teacher's class students).
   */
  allowedStudents?: Student[];
  onScanSuccess: () => Promise<void> | void;
  onClose?: () => void;
}

interface PendingConfirmation {
  qrToken: string;
  student: Student | null;
  eventType: TrackingEventType;
}

interface CompletedScanResult {
  studentName: string;
  studentClass?: string;
  eventType: TrackingEventType;
  scannedAt: string;
}

export function QrScannerView({
  role,
  schoolId,
  schoolTimezone,
  allowedStudents,
  onScanSuccess,
  onClose,
}: QrScannerViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraPermissionError, setCameraPermissionError] = useState<string | null>(null);
  const [manualTokenInput, setManualTokenInput] = useState<string>('');
  const [showManualEntry, setShowManualEntry] = useState<boolean>(false);

  const [inspectingToken, setInspectingToken] = useState<boolean>(false);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [submittingScan, setSubmittingScan] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [completedScan, setCompletedScan] = useState<CompletedScanResult | null>(
    null
  );

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  /**
   * Inspects a scanned QR token against today's state before submitting to RPC:
   * 1. Reads QR token.
   * 2. Looks up the student and today's `daily_tracking` row (if accessible via RLS) to determine the next valid event for the current user's role.
   * 3. Displays confirmation card before calling `public.scan_student_event()`.
   */
  const handleDetectedToken = useCallback(
    async (rawToken: string) => {
      const token = rawToken.trim();
      if (!token || inspectingToken || submittingScan || pendingConfirmation) {
        return;
      }

      if (!isDeviceOnline()) {
        setScanError('No internet connection. Scan was not recorded.');
        return;
      }

      stopCamera();
      setInspectingToken(true);
      setScanError(null);

      try {
        // 1. Resolve student by qr_token (scoped by RLS and school)
        let matchedStudent: Student | null =
          allowedStudents?.find((s) => s.qr_token === token) ?? null;

        if (!matchedStudent) {
          let query = supabase
            .from('students')
            .select(
              'id, school_id, student_id, full_name, student_class, roll_number, parent_id, photo_url, qr_token, active, created_at'
            )
            .eq('qr_token', token)
            .eq('active', true);

          if (schoolId) {
            query = query.eq('school_id', schoolId);
          }

          const { data: studentData, error: studentError } =
            await query.maybeSingle();

          if (studentError) {
            throw studentError;
          }
          matchedStudent = (studentData as Student) || null;
        }

        if (!matchedStudent) {
          setScanError(mapBackendError('STUDENT_NOT_FOUND'));
          setInspectingToken(false);
          return;
        }

        // If Parent: verify student is in parent's linked children list
        if (
          role === 'parent' &&
          allowedStudents &&
          !allowedStudents.some((s) => s.id === matchedStudent!.id)
        ) {
          setScanError(mapBackendError('PARENT_NOT_LINKED_TO_STUDENT'));
          setInspectingToken(false);
          return;
        }

        // 2. Fetch today's tracking row for this student
        const todayDate = getTodayDateString(schoolTimezone);
        const { data: trackingData, error: trackingError } = await supabase
          .from('daily_tracking')
          .select('*')
          .eq('student_id', matchedStudent.id)
          .eq('tracking_date', todayDate)
          .maybeSingle();

        if (trackingError) {
          throw trackingError;
        }

        const todayTracking = (trackingData as DailyTracking) || null;

        // 3. Determine valid next event for the user's role
        const { event: nextEvent, reason } = determineNextEventForRole(
          role,
          todayTracking
        );

        if (!nextEvent) {
          setScanError(reason);
          setInspectingToken(false);
          return;
        }

        // 4. Open confirmation step before submitting RPC
        setPendingConfirmation({
          qrToken: token,
          student: matchedStudent,
          eventType: nextEvent,
        });
      } catch (err) {
        setScanError(mapBackendError(err));
      } finally {
        setInspectingToken(false);
      }
    },
    [
      allowedStudents,
      inspectingToken,
      pendingConfirmation,
      role,
      schoolId,
      schoolTimezone,
      stopCamera,
      submittingScan,
    ]
  );

  const startCamera = useCallback(async () => {
    setCameraPermissionError(null);
    setScanError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraPermissionError(
        'Camera access is not supported in this browser environment.'
      );
      setShowManualEntry(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch {
      setCameraPermissionError(
        'Unable to access camera. Please allow camera permission or select a student QR token below.'
      );
      setShowManualEntry(true);
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // Continuous QR frame scanning loop
  useEffect(() => {
    if (!cameraActive) return;

    const scanFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (
        video &&
        canvas &&
        video.readyState === video.HAVE_ENOUGH_DATA &&
        video.videoWidth > 0
      ) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });
          if (code && code.data && code.data.trim().length > 0) {
            handleDetectedToken(code.data);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(scanFrame);
    };

    rafRef.current = requestAnimationFrame(scanFrame);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [cameraActive, handleDetectedToken]);

  const handleConfirmScan = async () => {
    if (!pendingConfirmation || submittingScan) return;

    if (!isDeviceOnline()) {
      setScanError('No internet connection. Scan was not recorded.');
      return;
    }

    setSubmittingScan(true);
    setScanError(null);

    try {
      const outcome = await executeScanStudentEvent(
        pendingConfirmation.qrToken,
        pendingConfirmation.eventType
      );

      setCompletedScan({
        studentName:
          pendingConfirmation.student?.full_name || 'Verified Student',
        studentClass: pendingConfirmation.student?.student_class,
        eventType: outcome.eventType,
        scannedAt: outcome.scannedAt,
      });
      setPendingConfirmation(null);

      // Refresh today's tracking and counters immediately
      await onScanSuccess();
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : mapBackendError(err)
      );
    } finally {
      setSubmittingScan(false);
    }
  };

  const handleResetScanner = () => {
    setPendingConfirmation(null);
    setCompletedScan(null);
    setScanError(null);
    setManualTokenInput('');
    startCamera();
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Scanner Header */}
      <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
            <QrCode className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <h2 className="text-base font-bold">Scan Student QR</h2>
            <p className="text-xs text-slate-300">
              Point camera at student ID card QR code
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            aria-label="Close scanner"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-5">
        {/* Offline Warning Banner */}
        {!isDeviceOnline() && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-rose-800 text-sm font-medium">
            <WifiOff className="w-5 h-5 text-rose-600 shrink-0" />
            <span>No internet connection. Scan was not recorded.</span>
          </div>
        )}

        {/* STATE 1: SUCCESS RESULT SHEET */}
        {completedScan ? (
          <div className="py-6 px-4 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 shadow-xs">
              <CheckCircle2 className="w-10 h-10 stroke-[2.2]" />
            </div>

            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
              ✓ Scan Successful
            </span>

            <h3 className="mt-3 text-xl font-bold text-slate-900">
              {completedScan.studentName}
            </h3>
            {completedScan.studentClass && (
              <p className="text-sm text-slate-500">
                Class {completedScan.studentClass}
              </p>
            )}

            <div className="mt-4 w-full max-w-xs rounded-2xl bg-slate-50 border border-slate-200 p-4 grid grid-cols-2 gap-3 text-left">
              <div>
                <p className="text-xs text-slate-500">Checkpoint Event</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5">
                  {EVENT_LABELS[completedScan.eventType]}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Recorded Time</p>
                <p className="text-sm font-bold text-emerald-700 mt-0.5">
                  {formatTime(completedScan.scannedAt, schoolTimezone)}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3 w-full max-w-xs">
              <button
                type="button"
                onClick={handleResetScanner}
                className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
              >
                Scan Another
              </button>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        ) : pendingConfirmation ? (
          /* STATE 2: PRE-SUBMIT CONFIRMATION DIALOG */
          <div className="py-3">
            <div className="rounded-2xl bg-indigo-50/60 border border-indigo-100 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                Confirm Student Checkpoint
              </p>

              {pendingConfirmation.student && (
                <div className="mt-4 flex items-center gap-3.5 bg-white p-3.5 rounded-2xl border border-slate-200">
                  <StudentAvatar
                    photoUrl={pendingConfirmation.student.photo_url}
                    fullName={pendingConfirmation.student.full_name}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">Student</p>
                    <h4 className="text-base font-bold text-slate-900 truncate">
                      {pendingConfirmation.student.full_name}
                    </h4>
                    <p className="text-xs text-slate-600">
                      Class {pendingConfirmation.student.student_class} • Roll{' '}
                      {pendingConfirmation.student.roll_number}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-3 bg-white p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Action</p>
                  <p className="text-base font-bold text-indigo-700">
                    {EVENT_LABELS[pendingConfirmation.eventType]}
                  </p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Verified Sequence
                </span>
              </div>

              {scanError && (
                <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{scanError}</span>
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={submittingScan}
                  onClick={handleResetScanner}
                  className="py-3 px-4 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingScan}
                  onClick={handleConfirmScan}
                  className="py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {submittingScan ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Recording...
                    </>
                  ) : (
                    'Confirm'
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* STATE 3: CAMERA VIEWFINDER */
          <div>
            <div className="relative aspect-square max-w-xs mx-auto rounded-3xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-inner flex items-center justify-center">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                muted
                playsInline
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Viewfinder framing guide */}
              <div className="absolute inset-8 pointer-events-none border-2 border-indigo-400/70 rounded-2xl">
                <div className="w-full h-0.5 bg-indigo-400/80 shadow-sm animate-pulse mt-1/2" />
              </div>

              {inspectingToken && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-white p-4">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-2" />
                  <p className="text-sm font-semibold">Checking student status...</p>
                </div>
              )}

              {!cameraActive && !inspectingToken && (
                <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center text-center p-6 text-white">
                  <Camera className="w-10 h-10 text-slate-400 mb-3" />
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {cameraPermissionError || 'Camera is paused'}
                  </p>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Start Camera
                  </button>
                </div>
              )}
            </div>

            {/* Friendly Error Message Display */}
            {scanError && (
              <div className="mt-4 p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-rose-900">
                    Scan Notice
                  </p>
                  <p className="text-xs text-rose-700 mt-0.5">{scanError}</p>
                  <button
                    type="button"
                    onClick={handleResetScanner}
                    className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-rose-800 underline"
                  >
                    Try scanning again
                  </button>
                </div>
              </div>
            )}

            {/* Quick Student QR Selector / Token Input for hardware scanners or desktop testing */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowManualEntry((v) => !v)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  {showManualEntry
                    ? 'Hide QR Token / Hardware Scanner Input'
                    : 'Use Hardware Scanner or Select Student QR'}
                </button>
              </div>

              {showManualEntry && (
                <div className="mt-3 space-y-3">
                  {allowedStudents && allowedStudents.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1.5">
                        Linked Students (Tap to scan QR token):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {allowedStudents.map((stu) => (
                          <button
                            key={stu.id}
                            type="button"
                            disabled={!stu.qr_token || inspectingToken}
                            onClick={() => handleDetectedToken(stu.qr_token)}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors"
                          >
                            {stu.full_name} ({stu.student_class})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (manualTokenInput.trim()) {
                        handleDetectedToken(manualTokenInput);
                      }
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={manualTokenInput}
                      onChange={(e) => setManualTokenInput(e.target.value)}
                      placeholder="Enter or scan student qr_token..."
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={!manualTokenInput.trim() || inspectingToken}
                      className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      Verify QR
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
