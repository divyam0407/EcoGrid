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
    tier?: string;
    isBenchmark?: boolean;
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
  switchOrganization: (organizationId: string) => Promise<void>;
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
          setToken(localStorage.getItem('ecogrid_token'));
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

  const switchOrganization = async (organizationId: string) => {
    const res = await api.post('/auth/switch-organization', { organizationId });
    localStorage.setItem('ecogrid_token', res.data.token);
    setToken(res.data.token);
    setUser((current) => ({ ...current!, ...res.data.user, organizations: current?.organizations || [] }));
  };

  const logout = () => {
    void api.post('/auth/logout').catch(() => undefined);
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
        switchOrganization,
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
