import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  organization?: {
    id: string;
    name: string;
    industryType: string;
    currency: string;
    timezone: string;
  };
  organizations?: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, orgName: string, industryType?: string) => Promise<void>;
  demoLogin: (role?: 'ADMIN' | 'ENERGY_MANAGER') => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('ecogrid_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const initAuth = async () => {
      const savedToken = localStorage.getItem('ecogrid_token');
      if (savedToken) {
        try {
          const res = await api.get('/auth/me');
          setUser(res.data.user);
        } catch (err) {
          console.warn('Failed to verify existing session:', err);
          localStorage.removeItem('ecogrid_token');
          setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const { token: receivedToken, user: receivedUser } = res.data;
    localStorage.setItem('ecogrid_token', receivedToken);
    setToken(receivedToken);
    setUser(receivedUser);
  };

  const register = async (name: string, email: string, password: string, orgName: string, industryType?: string) => {
    const res = await api.post('/auth/register', {
      name,
      email,
      password,
      organizationName: orgName,
      industryType: industryType || 'HIGHER_EDUCATION',
    });
    const { token: receivedToken, user: receivedUser } = res.data;
    localStorage.setItem('ecogrid_token', receivedToken);
    setToken(receivedToken);
    setUser(receivedUser);
  };

  const demoLogin = async (role: 'ADMIN' | 'ENERGY_MANAGER' = 'ADMIN') => {
    const email = role === 'ADMIN' ? 'admin@abc.edu' : 'facility@abc.edu';
    await login(email, 'admin123');
  };

  const logout = () => {
    localStorage.removeItem('ecogrid_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        register,
        demoLogin,
        logout,
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
