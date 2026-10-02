/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Loader2, LogOut, ShieldAlert } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './screens/LoginScreen';
import { ParentDashboard } from './screens/ParentDashboard';
import { SecurityDashboard } from './screens/SecurityDashboard';
import { TeacherDashboard } from './screens/TeacherDashboard';
import { SchoolAdminDashboard } from './screens/SchoolAdminDashboard';

function RoleRouter() {
  const { session, profile, loading, authError, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-9 h-9 animate-spin text-indigo-600 mb-3" />
        <p className="text-sm font-semibold text-slate-700">
          Verifying school profile & permissions...
        </p>
      </div>
    );
  }

  if (!session || !profile) {
    return <LoginScreen />;
  }

  switch (profile.role) {
    case 'parent':
      return <ParentDashboard />;
    case 'security':
      return <SecurityDashboard />;
    case 'teacher':
      return <TeacherDashboard />;
    case 'school_admin':
    case 'super_admin':
      return <SchoolAdminDashboard />;
    default:
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-sm w-full">
            <ShieldAlert className="w-10 h-10 text-rose-600 mx-auto mb-3" />
            <h1 className="text-base font-bold text-slate-900">
              Unrecognized Account Role
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {authError || 'Your profile role is not authorized for this portal.'}
            </p>
            <button
              type="button"
              onClick={signOut}
              className="mt-5 w-full py-3 px-4 rounded-2xl bg-slate-900 text-white text-xs font-semibold flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      );
  }
}

export default function App() {
  return (
    <AuthProvider>
      <RoleRouter />
    </AuthProvider>
  );
}
