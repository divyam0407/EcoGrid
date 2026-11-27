import axios from 'axios';

const api = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_URL || 'http://localhost:5001/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

let refreshRequest: Promise<string> | null = null;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ecogrid_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as any;
    const url = String(original?.url || '');
    const authOperation = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout', '/auth/switch-organization']
      .some((endpoint) => url.includes(endpoint));
    if (error.response?.status === 401 && original && !original._ecogridRetried && !authOperation && !window.location.pathname.includes('/login')) {
      original._ecogridRetried = true;
      try {
        if (!refreshRequest) refreshRequest = api.post('/auth/refresh').then((result) => {
          const token = result.data.token as string;
          localStorage.setItem('ecogrid_token', token);
          return token;
        }).finally(() => { refreshRequest = null; });
        const token = await refreshRequest;
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        localStorage.removeItem('ecogrid_token');
        localStorage.removeItem('ecogrid_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
