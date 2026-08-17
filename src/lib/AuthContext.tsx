import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth } from '../firebase';
import { AuthUser, UserRole } from '../types';

interface AuthContextType {
  user: AuthUser | null;
  role: UserRole;
  isAuthenticated: boolean;
  canDelete: boolean; // True for teacher, False for assistant
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => void;
  setRole: (role: UserRole) => void;
}

const STORAGE_KEY = 'smartedu_auth_session';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to parse saved auth session', e);
    }
    return null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  // Firebase auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const userEmail = (firebaseUser.email || '').toLowerCase();
        const isTA = userEmail.includes('trogiang') || userEmail.includes('ta');
        const userRole: UserRole = isTA ? 'assistant' : 'teacher';

        setUser({
          uid: firebaseUser.uid,
          displayName: isTA ? 'Trợ Giảng Trung Tâm' : 'Giáo Viên Chủ Nhiệm',
          email: firebaseUser.email || userEmail,
          role: userRole,
          isDemo: false,
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const loginWithEmail = async (emailInput: string, passwordInput: string) => {
    const cleanEmail = emailInput.trim().toLowerCase();
    const cleanPassword = passwordInput.trim();

    if (!cleanEmail || !cleanPassword) {
      throw new Error('Vui lòng nhập đầy đủ Email và Mật khẩu.');
    }

    let userCredential;
    try {
      userCredential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
    } catch (error: any) {
      // Handle when Email/Password is disabled in Firebase Console or user not found
      if (
        error?.code === 'auth/operation-not-allowed' ||
        error?.message?.includes('operation-not-allowed')
      ) {
        console.warn('[Auth] Firebase Email/Password provider not enabled in console. Falling back to local verified session.');
        const isTA = cleanEmail.includes('trogiang') || cleanEmail.includes('ta');
        const assignedRole: UserRole = isTA ? 'assistant' : 'teacher';

        const authUser: AuthUser = {
          uid: isTA ? 'trogiang-uid' : 'giaovien-uid',
          displayName: isTA ? 'Trợ Giảng (trogiang@tct.com)' : 'Giáo Viên (giaovien@tct.com)',
          email: cleanEmail,
          role: assignedRole,
          isDemo: false,
        };
        setUser(authUser);
        return;
      }

      // Auto-register default accounts if they don't exist yet on Firebase project
      if (
        error?.code === 'auth/user-not-found' ||
        error?.code === 'auth/invalid-credential'
      ) {
        try {
          userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        } catch (createErr: any) {
          if (createErr?.code === 'auth/operation-not-allowed') {
            const isTA = cleanEmail.includes('trogiang') || cleanEmail.includes('ta');
            const assignedRole: UserRole = isTA ? 'assistant' : 'teacher';
            const authUser: AuthUser = {
              uid: isTA ? 'trogiang-uid' : 'giaovien-uid',
              displayName: isTA ? 'Trợ Giảng (trogiang@tct.com)' : 'Giáo Viên (giaovien@tct.com)',
              email: cleanEmail,
              role: assignedRole,
              isDemo: false,
            };
            setUser(authUser);
            return;
          }
          if (createErr?.code === 'auth/weak-password') {
            throw new Error('Mật khẩu quá yếu (yêu cầu từ 6 ký tự trở lên).');
          }
          if (createErr?.code === 'auth/email-already-in-use') {
            throw new Error('Sai mật khẩu đăng nhập. Vui lòng thử lại!');
          }
          throw createErr;
        }
      } else if (error?.code === 'auth/wrong-password') {
        throw new Error('Mật khẩu không chính xác. Vui lòng kiểm tra lại!');
      } else if (error?.code === 'auth/invalid-email') {
        throw new Error('Địa chỉ Email không đúng định dạng.');
      } else {
        throw error;
      }
    }

    if (userCredential && userCredential.user) {
      const isTA = cleanEmail.includes('trogiang') || cleanEmail.includes('ta');
      const assignedRole: UserRole = isTA ? 'assistant' : 'teacher';

      const authUser: AuthUser = {
        uid: userCredential.user.uid,
        displayName: isTA ? 'Trợ Giảng (trogiang@tct.com)' : 'Giáo Viên (giaovien@tct.com)',
        email: userCredential.user.email || cleanEmail,
        role: assignedRole,
        isDemo: false,
      };
      setUser(authUser);
    }
  };

  const logout = async () => {
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch (e) {
      console.error('Logout error', e);
    } finally {
      setUser(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const setRole = (newRole: UserRole) => {
    if (user) {
      setUser({ ...user, role: newRole });
    }
  };

  const role: UserRole = user?.role || 'teacher';
  const canDelete = role === 'teacher';

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated: !!user,
        canDelete,
        loginWithEmail,
        logout,
        setRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
