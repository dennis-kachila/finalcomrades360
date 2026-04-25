import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import { joinUserRoom } from '../services/socket';

const AuthContext = createContext(null);

// Prevent Strict Mode from calling checkAuth twice
let _authChecked = false;

// Read stored user synchronously — app renders immediately with this
function getStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    if (raw) return JSON.parse(raw);
  } catch { }
  return null;
}

export const AuthProvider = ({ children }) => {
  // Initialize from localStorage instantly — no waiting for /auth/me
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(false); // No longer blocks render
  const [error, setError] = useState(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');

  useEffect(() => {
    // Validate session in background — doesn't block UI
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setUser(null);
        return;
      }

      try {
        console.log('[AuthContext] Background session check...');
        const t0 = performance.now();
        const response = await api.get('/auth/me');
        console.log(`[AuthContext] /auth/me done in ${(performance.now() - t0).toFixed(0)}ms`);
        const userData = response.data;
        const sessionUser = {
          ...userData,
          role: userData.role || 'customer',
          roles: userData.roles || [userData.role || 'customer']
        };
        setUser(sessionUser);
        localStorage.setItem('user', JSON.stringify(sessionUser));
        joinUserRoom(sessionUser.id);

        const userRoles = Array.isArray(userData.roles) ? userData.roles : [userData.role || 'customer'];
        const isAdmin = userRoles.some(r => ['admin', 'superadmin', 'super_admin'].includes(r));
        const hasSpecialistRole = userRoles.some(r => r !== 'customer' && !['admin', 'superadmin', 'super_admin'].includes(r));

        if (hasSpecialistRole && !isAdmin && !userData.isVerified) {
          setVerificationRequired(true);
          setVerificationMessage('Account verification required. Please complete your role application approval.');
        } else {
          setVerificationRequired(false);
          setVerificationMessage('');
        }
      } catch (error) {
        console.error('[AuthContext] Session check failed:', error.message);

        if (error.response?.status === 401 || error.response?.status === 403) {
          // Token expired or invalid — clear session
          const is403Verification = error.response?.status === 403 && error.response?.data?.message?.includes('verification');
          if (is403Verification) {
            setVerificationRequired(true);
            setVerificationMessage(error.response.data.message);
          } else {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            sessionStorage.clear();
            setUser(null);
          }
        }
        // For network errors (5xx, timeout) — keep existing user state; they're already logged in
      }
    };

    if (_authChecked) return;
    _authChecked = true;
    checkAuth();
  }, []);

  const login = async (credentials) => {
    try {
      const authPath = credentials?.mode === 'station' ? '/auth/station-login' : '/auth/login';
      const payload = {
        identifier: credentials?.identifier,
        password: credentials?.password
      };
      const response = await api.post(authPath, payload);
      
      // Safety: Handle non-object or missing data
      if (!response.data || typeof response.data !== 'object') {
        console.warn('[AuthContext] Unexpected non-object response from login:', response.data);
        throw new Error('Server returned an invalid response. Please try again.');
      }

      // Support both nested and flattened response structures
      const token = response.data.token || localStorage.getItem('token');
      let userData = response.data.user || response.data;

      // Log the full response for production debugging
      if (!response.data.user) {
        console.warn('[AuthContext] "user" key missing in login response. Using root data as fallback.', response.data);
      }

      if (token) {
        localStorage.setItem('token', token);
        console.log('Login success - Token saved.');
      } else {
        console.warn('[AuthContext] No token found in login response.');
      }

      const sessionUser = {
        ...userData,
        role: userData.role || 'customer',
        roles: Array.isArray(userData.roles) ? userData.roles : (userData.role ? [userData.role] : ['customer'])
      };

      setUser(sessionUser);
      localStorage.setItem('user', JSON.stringify(sessionUser));
      
      if (sessionUser.id) joinUserRoom(sessionUser.id);
      
      console.log('User state set in AuthContext:', { email: sessionUser.email, role: sessionUser.role });

      const userRoles = sessionUser.roles;
      const isAdmin = userRoles.some(r => ['admin', 'superadmin', 'super_admin'].includes(r));
      const hasSpecialistRole = userRoles.some(r => r !== 'customer' && !['admin', 'superadmin', 'super_admin'].includes(r));

      if (hasSpecialistRole && !isAdmin && !sessionUser.isVerified) {
        console.log('Verification required for specialist roles:', userRoles);
        setVerificationRequired(true);
        setVerificationMessage('Account verification required. Please complete your role application approval.');
      } else {
        setVerificationRequired(false);
        setVerificationMessage('');
      }

      return sessionUser;
    } catch (error) {
      console.error('[AuthContext] Login failed:', error.message);
      if (error.response) {
        console.error('[AuthContext] Login error response status:', error.response.status);
        console.error('[AuthContext] Login error response data:', JSON.stringify(error.response.data, null, 2));
      }
      setError(error.message);
      throw error;
    }
  };

  const googleLogin = async (googleToken) => {
    try {
      const response = await api.post('/auth/google', { token: googleToken });
      
      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Google Login failed: Invalid response from server.');
      }

      const token = response.data.token;
      let userData = response.data.user || response.data;

      if (token) {
        localStorage.setItem('token', token);
      }

      const sessionUser = {
        ...userData,
        role: userData.role || 'customer',
        roles: Array.isArray(userData.roles) ? userData.roles : (userData.role ? [userData.role] : ['customer'])
      };

      setUser(sessionUser);
      localStorage.setItem('user', JSON.stringify(sessionUser));
      if (sessionUser.id) joinUserRoom(sessionUser.id);

      setVerificationRequired(false);
      setVerificationMessage('');

      return sessionUser;
    } catch (error) {
      console.error('[AuthContext] Google Login failed:', error.message);
      setError(error.message);
      throw error;
    }
  };

  // setSession — used by OTP verification flow to log in without calling /auth/login again
  const setSession = useCallback((token, userData) => {
    localStorage.setItem('token', token);
    const sessionUser = {
      ...userData,
      role: userData.role || 'customer',
      roles: userData.roles || []
    };
    setUser(sessionUser);
    localStorage.setItem('user', JSON.stringify(sessionUser));
    joinUserRoom(sessionUser.id);
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('cartState'); // Ensure no guest cart remains
    localStorage.removeItem('cartState_personal');
    localStorage.removeItem('cartState_marketing');
    sessionStorage.clear();
    setUser(null);
    setVerificationRequired(false);
    setVerificationMessage('');
    // Force a complete page refresh to clear any lingering state
    window.location.href = '/';
  };

  const updateUser = useCallback(async (updatedUser) => {
    // Update local state immediately
    setUser(prev => {
      if (!prev) return null;
      return { ...prev, ...updatedUser };
    });

    // Trigger a backend sync in the background if needed, but don't force a loop
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const response = await api.get('/auth/me');
        setUser(prev => ({
          ...response.data,
          role: response.data.role || 'customer',
          roles: response.data.roles || [response.data.role || 'customer']
        }));

        window.dispatchEvent(new CustomEvent('userDataUpdated', {
          detail: response.data
        }));
      }
    } catch (error) {
      console.error('Error syncing user data:', error);
    }
  }, []);

  // Retry authentication (useful after completing verification)
  const retryAuth = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const response = await api.get('/auth/me');
        setUser({
          ...response.data,
          role: response.data.role || 'customer',
          roles: response.data.roles || [response.data.role || 'customer']
        });
        setVerificationRequired(false);
        setVerificationMessage('');
      }
    } catch (error) {
      console.error('Retry auth failed:', error);
      setError(error.message);
      localStorage.removeItem('token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const value = useMemo(() => ({
    user,
    loading,
    error,
    verificationRequired,
    verificationMessage,
    isAuthenticated: !!user && !verificationRequired,
    login,
    logout,
    updateUser,
    retryAuth,
    setSession,
    googleLogin,
  }), [user, loading, error, verificationRequired, verificationMessage, login, logout, updateUser, retryAuth, setSession, googleLogin]);

  return (
    <AuthContext.Provider value={value}>
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

export default AuthContext;
