import { useState, useEffect } from 'react';
import { UserRole } from '../types';

export interface UseAuthReturn {
  user: any;
  loading: boolean;
  role: UserRole;
  isAdmin: boolean;
  isAssistant: boolean;
  loginWithGoogle: () => Promise<void>;
  loginAnonymously: () => Promise<void>;
  logout: () => Promise<void>;
  switchRole: (newRole: UserRole) => void;
  canExecuteAction: (action: 'manage_classes' | 'delete_student' | 'archive_class' | 'promote_class' | 'edit_settings') => boolean;
}

export const useAuth = (): UseAuthReturn => {
  const [user] = useState<any>({
    uid: 'local-teacher-01',
    displayName: 'Giáo viên',
    email: 'teacher@local.edu',
  });
  const [loading] = useState<boolean>(false);
  
  const [role, setRole] = useState<UserRole>(() => {
    const savedRole = localStorage.getItem('smart_edu_user_role');
    return (savedRole === 'TA' || savedRole === 'Assistant') ? 'TA' : 'Teacher';
  });

  const switchRole = (newRole: UserRole) => {
    setRole(newRole);
    localStorage.setItem('smart_edu_user_role', newRole);
  };

  const loginWithGoogle = async () => {};
  const loginAnonymously = async () => {};
  const logout = async () => {};

  const isAdmin = role === 'Teacher';
  const isAssistant = role === 'TA';

  const canExecuteAction = (_action: 'manage_classes' | 'delete_student' | 'archive_class' | 'promote_class' | 'edit_settings'): boolean => {
    if (isAssistant) {
      return false;
    }
    return true;
  };

  return {
    user,
    loading,
    role,
    isAdmin,
    isAssistant,
    loginWithGoogle,
    loginAnonymously,
    logout,
    switchRole,
    canExecuteAction,
  };
};

export default useAuth;
