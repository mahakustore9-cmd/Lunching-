import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function LoginScreen() {
  const { signIn, sendPasswordReset, authError, isOnline } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Forgot password state
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSentMessage, setResetSentMessage] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setLocalError('Please enter your registered email and password.');
      return;
    }

    setSubmitting(true);
    setLocalError(null);

    try {
      const { error } = await signIn(cleanEmail, password);
      if (error) {
        setLocalError(error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setLocalError('Please enter your account email address.');
      return;
    }

    setSubmitting(true);
    setLocalError(null);
    setResetSentMessage(null);

    try {
      const { error } = await sendPasswordReset(cleanEmail);
      if (error) {
        setLocalError(error);
      } else {
        setResetSentMessage(
          'Password reset instructions have been sent to your email address.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const activeError = localError || authError;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-10">
      <div className="max-w-md w-full mx-auto">
        {/* School Branding / Logo Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-3xl bg-indigo-950 text-white flex items-center justify-center mx-auto shadow-md border border-indigo-800">
            <ShieldCheck className="w-9 h-9 text-indigo-300" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900 tracking-tight">
            School Student Tracking System
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Real-time student safety & daily checkpoint verification
          </p>
        </div>

        {!isOnline && (
          <div className="mb-5 p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-rose-800 text-sm font-medium">
            <WifiOff className="w-5 h-5 text-rose-600 shrink-0" />
            <span>No internet connection. Please connect to sign in.</span>
          </div>
        )}

        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 sm:p-8">
          {forgotMode ? (
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Reset Your Password
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Enter your registered school email to receive a password reset
                link.
              </p>

              <form onSubmit={handleResetPasswordSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Registered Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@school.edu"
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                    />
                  </div>
                </div>

                {activeError && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800 text-xs font-medium">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{activeError}</span>
                  </div>
                )}

                {resetSentMessage && (
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-emerald-800 text-xs font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{resetSentMessage}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !isOnline}
                  className="w-full py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending Reset Link...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setForgotMode(false);
                    setLocalError(null);
                    setResetSentMessage(null);
                  }}
                  className="w-full py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Back to Login
                </button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email / Registered ID
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your school email"
                    className="w-full pl-10 pr-4 py-3.5 rounded-2xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(true);
                      setLocalError(null);
                    }}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-11 py-3.5 rounded-2xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {activeError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{activeError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !isOnline}
                className="w-full py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing In...
                  </>
                ) : (
                  'Login'
                )}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Your dashboard is automatically opened based on your verified school
          account role.
        </p>
      </div>
    </div>
  );
}
