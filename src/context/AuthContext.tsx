import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { mapBackendError } from '../lib/errorMapper';
import type { Profile, School } from '../types/database';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  school: School | null;
  availableSchools: School[]; // Populated only for super_admin
  selectedSchoolId: string | null; // Strictly profile.school_id for school users
  setSuperAdminSchoolId: (schoolId: string) => void;
  loading: boolean;
  authError: string | null;
  isOnline: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  sendPasswordReset: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [availableSchools, setAvailableSchools] = useState<School[]>([]);
  const [superAdminSchoolId, setSuperAdminSchoolIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadUserProfile = useCallback(async (currentUser: User) => {
    setLoading(true);
    setAuthError(null);

    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, school_id, full_name, role, active, created_at')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      if (!profileData) {
        setProfile(null);
        setSchool(null);
        setAuthError(mapBackendError('PROFILE_NOT_FOUND'));
        setLoading(false);
        return;
      }

      const typedProfile = profileData as Profile;

      if (!typedProfile.active) {
        setProfile(null);
        setSchool(null);
        setAuthError(mapBackendError('INACTIVE_USER'));
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      setProfile(typedProfile);

      if (typedProfile.role === 'super_admin') {
        const { data: schoolsList } = await supabase
          .from('schools')
          .select('id, school_code, school_name, active, timezone')
          .order('school_name', { ascending: true });

        const validSchools = (schoolsList || []) as School[];
        setAvailableSchools(validSchools);

        const targetSchoolId =
          typedProfile.school_id ||
          (validSchools.length > 0 ? validSchools[0].id : null);

        setSuperAdminSchoolIdState(targetSchoolId);
        const foundSchool = validSchools.find((s) => s.id === targetSchoolId) || null;
        setSchool(foundSchool);
      } else {
        // Strict Multi-School Rule: Backend determines current user's school from profiles.school_id
        if (typedProfile.school_id) {
          const { data: schoolData } = await supabase
            .from('schools')
            .select('id, school_code, school_name, active, timezone')
            .eq('id', typedProfile.school_id)
            .maybeSingle();

          if (schoolData) {
            const typedSchool = schoolData as School;
            if (!typedSchool.active) {
              setAuthError(mapBackendError('INACTIVE_SCHOOL'));
            }
            setSchool(typedSchool);
          } else {
            setSchool(null);
          }
        } else {
          setSchool(null);
        }
      }
    } catch (err) {
      setAuthError(mapBackendError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!mounted) return;
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.user) {
        loadUserProfile(initialSession.user);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        loadUserProfile(newSession.user);
      } else {
        setProfile(null);
        setSchool(null);
        setAvailableSchools([]);
        setSuperAdminSchoolIdState(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadUserProfile]);

  const setSuperAdminSchoolId = useCallback(
    (schoolId: string) => {
      if (profile?.role !== 'super_admin') return; // Never allow non-super_admin to switch school
      setSuperAdminSchoolIdState(schoolId);
      const found = availableSchools.find((s) => s.id === schoolId) || null;
      setSchool(found);
    },
    [profile?.role, availableSchools]
  );

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    if (!navigator.onLine) {
      return { error: 'No internet connection. Please check your network and try again.' };
    }
    setAuthError(null);
    const cleanEmail = email.trim();
    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error) {
      const friendly = mapBackendError(error);
      setAuthError(friendly);
      return { error: friendly };
    }
    return {};
  };

  const sendPasswordReset = async (email: string): Promise<{ error?: string }> => {
    if (!navigator.onLine) {
      return { error: 'No internet connection. Please check your network and try again.' };
    }
    const cleanEmail = email.trim();
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
    if (error) {
      return { error: mapBackendError(error) };
    }
    return {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSchool(null);
    setSession(null);
    setUser(null);
    setAuthError(null);
  };

  const refreshProfile = async () => {
    if (user) {
      await loadUserProfile(user);
    }
  };

  const effectiveSchoolId =
    profile?.role === 'super_admin' ? superAdminSchoolId : profile?.school_id ?? null;

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        school,
        availableSchools,
        selectedSchoolId: effectiveSchoolId,
        setSuperAdminSchoolId,
        loading,
        authError,
        isOnline,
        signIn,
        sendPasswordReset,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
