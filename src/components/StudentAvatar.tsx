import React, { useState } from 'react';
import { User } from 'lucide-react';

interface StudentAvatarProps {
  photoUrl: string | null | undefined;
  fullName: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function StudentAvatar({ photoUrl, fullName, size = 'md' }: StudentAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const sizeClasses = {
    sm: 'w-10 h-10 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-base',
    xl: 'w-20 h-20 text-lg',
  }[size];

  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  if (photoUrl && !imgError) {
    return (
      <img
        src={photoUrl}
        alt={fullName}
        onError={() => setImgError(true)}
        className={`${sizeClasses} rounded-2xl object-cover bg-slate-100 border border-slate-200 shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 font-semibold flex items-center justify-center shrink-0`}
    >
      {initials ? initials : <User className="w-5 h-5 text-indigo-500" />}
    </div>
  );
}
