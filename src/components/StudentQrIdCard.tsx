import React, { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Download, Printer, Share2, ShieldCheck, X } from 'lucide-react';
import { StudentAvatar } from './StudentAvatar';
import type { School, Student } from '../types/database';

interface StudentQrIdCardProps {
  student: Student;
  school: School | null;
  onClose?: () => void;
}

/**
 * Digital Student ID Card.
 * CRITICAL SECURITY RULE:
 * QR code contains ONLY `student.qr_token`.
 * Never embeds student name, parent name, phone, address, school details, or medical info inside the QR payload.
 */
export function StudentQrIdCard({ student, school, onClose }: StudentQrIdCardProps) {
  const qrContainerRef = useRef<HTMLDivElement>(null);

  const handleDownloadQr = () => {
    const canvas = qrContainerRef.current?.querySelector('canvas');
    if (!canvas) return;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 600;
    exportCanvas.height = 760;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // Clean card background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Header bar
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(0, 0, exportCanvas.width, 110);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(school?.school_name || 'School Student ID', 300, 55);

    ctx.fillStyle = '#c7d2fe';
    ctx.font = '15px sans-serif';
    ctx.fillText('OFFICIAL STUDENT TRACKING PASS', 300, 84);

    // Student details
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(student.full_name, 300, 175);

    ctx.fillStyle = '#475569';
    ctx.font = '18px sans-serif';
    ctx.fillText(
      `Class ${student.student_class}  •  Roll ${student.roll_number}`,
      300,
      210
    );

    ctx.fillStyle = '#64748b';
    ctx.font = '15px monospace';
    ctx.fillText(`ID: ${student.student_id}`, 300, 240);

    // Draw QR canvas
    ctx.drawImage(canvas, 150, 275, 300, 300);

    ctx.fillStyle = '#64748b';
    ctx.font = '14px sans-serif';
    ctx.fillText('Scan at Home, School Gate & Classroom', 300, 625);

    const dataUrl = exportCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `Student-ID-${student.student_id}.png`;
    link.href = dataUrl;
    link.click();
  };

  const handleShare = async () => {
    const canvas = qrContainerRef.current?.querySelector('canvas');
    if (canvas && navigator.share) {
      try {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png')
        );
        if (blob) {
          const file = new File([blob], `Student-QR-${student.student_id}.png`, {
            type: 'image/png',
          });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `${student.full_name} - Student Tracking ID`,
              text: `${student.full_name} (${student.student_id})`,
              files: [file],
            });
            return;
          }
        }
        await navigator.share({
          title: `${student.full_name} - Student Tracking ID`,
          text: `Student ID: ${student.student_id} • Class ${student.student_class}`,
        });
      } catch {
        // User cancelled share sheet
      }
    } else {
      handleDownloadQr();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden max-w-sm w-full mx-auto">
      {/* Top School Banner */}
      <div className="bg-indigo-950 text-white px-6 py-5 relative">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            aria-label="Close ID card"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/30 border border-indigo-400/30 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-indigo-200" />
          </div>
          <div className="min-w-0 pr-6">
            <p className="text-[11px] uppercase tracking-widest text-indigo-300 font-semibold">
              Student Digital ID Card
            </p>
            <h3 className="text-base font-bold text-white truncate">
              {school?.school_name || 'Verified School'}
            </h3>
          </div>
        </div>
      </div>

      {/* Student Identity Body */}
      <div className="p-6 flex flex-col items-center text-center">
        <StudentAvatar
          photoUrl={student.photo_url}
          fullName={student.full_name}
          size="xl"
        />

        <h2 className="mt-3 text-xl font-bold text-slate-900">{student.full_name}</h2>

        <div className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-600">
          <span>Class {student.student_class}</span>
          <span>•</span>
          <span>Roll {student.roll_number}</span>
        </div>

        <div className="mt-2 inline-flex items-center px-3 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-mono font-semibold">
          ID: {student.student_id}
        </div>

        {/* Secure QR Code Box - Contains ONLY student.qr_token */}
        <div
          ref={qrContainerRef}
          className="mt-5 p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-xs flex flex-col items-center"
        >
          <QRCodeCanvas
            value={student.qr_token}
            size={196}
            level="M"
            includeMargin={true}
          />
          <span className="mt-1.5 text-[11px] font-medium text-slate-400">
            Encrypted Student QR Token
          </span>
        </div>

        {/* Action Buttons: Share, Save, Print */}
        <div className="mt-6 grid grid-cols-3 gap-2.5 w-full print:hidden">
          <button
            type="button"
            onClick={handleShare}
            className="flex flex-col items-center justify-center gap-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
          >
            <Share2 className="w-4 h-4 text-indigo-600" />
            Share
          </button>
          <button
            type="button"
            onClick={handleDownloadQr}
            className="flex flex-col items-center justify-center gap-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
          >
            <Download className="w-4 h-4 text-indigo-600" />
            Save
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex flex-col items-center justify-center gap-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
          >
            <Printer className="w-4 h-4 text-indigo-600" />
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
