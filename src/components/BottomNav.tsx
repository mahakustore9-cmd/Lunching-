import React from 'react';
import {
  Activity,
  BarChart3,
  Clock,
  Home,
  LayoutDashboard,
  QrCode,
  Settings,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import type { UserRole } from '../types/database';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function getNavItemsForRole(role: UserRole): NavItem[] {
  switch (role) {
    case 'parent':
      return [
        { id: 'home', label: 'Home', icon: Home },
        { id: 'scan', label: 'Scan', icon: QrCode },
        { id: 'history', label: 'History', icon: Clock },
        { id: 'profile', label: 'Profile', icon: User },
      ];
    case 'teacher':
      return [
        { id: 'home', label: 'Home', icon: Home },
        { id: 'scan', label: 'Scan', icon: QrCode },
        { id: 'class', label: 'Class', icon: Users },
        { id: 'profile', label: 'Profile', icon: User },
      ];
    case 'security':
      return [
        { id: 'home', label: 'Home', icon: Home },
        { id: 'scan', label: 'Scan', icon: QrCode },
        { id: 'activity', label: 'Activity', icon: Activity },
        { id: 'profile', label: 'Profile', icon: User },
      ];
    case 'school_admin':
    case 'super_admin':
      return [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'students', label: 'Students', icon: Users },
        { id: 'tracking', label: 'Tracking', icon: ShieldCheck },
        { id: 'staff', label: 'Staff', icon: User },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
        { id: 'settings', label: 'Settings', icon: Settings },
      ];
  }
}

interface BottomNavProps {
  role: UserRole;
  activeTab: string;
  onSelectTab: (tabId: string) => void;
}

export function BottomNav({ role, activeTab, onSelectTab }: BottomNavProps) {
  const items = getNavItemsForRole(role);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 print:hidden">
      <div className="max-w-xl mx-auto px-2 py-1.5 flex items-center justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center py-1.5 px-2.5 rounded-2xl transition-colors min-w-[56px] ${
                isActive
                  ? 'text-indigo-600 font-semibold bg-indigo-50/80'
                  : 'text-slate-500 hover:text-slate-800 font-medium'
              }`}
            >
              <Icon
                className={`w-5 h-5 ${
                  isActive ? 'text-indigo-600 stroke-[2.3]' : 'text-slate-500'
                }`}
              />
              <span className="text-[11px] mt-1 leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
