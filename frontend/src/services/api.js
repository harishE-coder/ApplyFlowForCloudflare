import axios from 'axios';

// In-Memory SWR Cache & Inflight Promise Deduplication Store
const cacheMap = new Map();
const inflightMap = new Map();

const DEFAULT_TTL_MS = 25000; // 25 seconds default TTL

const rawBase = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const apiBase = rawBase
  ? (rawBase.endsWith('/api') ? rawBase : `${rawBase}/api`)
  : '/api';

const rawAxios = axios.create({
  baseURL: apiBase,
  withCredentials: true,
});

// Strips Content-Type on FormData and injects Authorization Bearer token if present
rawAxios.interceptors.request.use((config) => {
  const token = localStorage.getItem('applyflow_access_token');
  if (token && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// Automatic Token Refresh Interceptor
rawAxios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    const reqUrl = typeof originalRequest.url === 'string' ? originalRequest.url : '';

    if (
      error?.response?.status === 401 &&
      !originalRequest._retry &&
      typeof reqUrl === 'string' &&
      !reqUrl.includes('/auth/login') &&
      !reqUrl.includes('/auth/logout') &&
      !reqUrl.includes('/auth/refresh') &&
      !reqUrl.includes('/auth/bootstrap')
    ) {
      originalRequest._retry = true;

      try {
        const storedRefreshToken = localStorage.getItem('applyflow_refresh_token');
        const res = await rawAxios.post('/auth/refresh', {
          refresh_token: storedRefreshToken || undefined,
        });

        if (res.data?.access_token) {
          localStorage.setItem('applyflow_access_token', res.data.access_token);
          if (res.data?.refresh_token) {
            localStorage.setItem('applyflow_refresh_token', res.data.refresh_token);
          }
          originalRequest.headers['Authorization'] = `Bearer ${res.data.access_token}`;
        }

        return rawAxios(originalRequest);
      } catch (refreshErr) {
        localStorage.removeItem('applyflow_access_token');
        localStorage.removeItem('applyflow_refresh_token');
        sessionStorage.setItem('applyflow_logged_out', 'true');
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export function invalidateCache(prefix = '') {
  if (!prefix || typeof prefix !== 'string') {
    cacheMap.clear();
    return;
  }
  for (const key of cacheMap.keys()) {
    if (typeof key === 'string' && key.includes(prefix)) {
      cacheMap.delete(key);
    }
  }
}

export function invalidateScopedCache(url = '') {
  if (!url || typeof url !== 'string') {
    cacheMap.clear();
    return;
  }
  const cleanUrl = typeof url === 'string' ? url.toLowerCase() : '';
  if (!cleanUrl) {
    cacheMap.clear();
    return;
  }

  if (cleanUrl.includes('/resumes') || cleanUrl.includes('/applications')) {
    invalidateCache('/resumes');
    invalidateCache('/applications');
    invalidateCache('/dashboard');
    invalidateCache('/reports');
  } else if (cleanUrl.includes('/requirements')) {
    invalidateCache('/requirements');
    invalidateCache('/dashboard');
    invalidateCache('/reports');
  } else if (cleanUrl.includes('/targets')) {
    invalidateCache('/targets');
    invalidateCache('/dashboard');
  } else if (cleanUrl.includes('/attendance')) {
    invalidateCache('/attendance');
    invalidateCache('/dashboard');
  } else if (cleanUrl.includes('/notifications')) {
    invalidateCache('/notifications');
  } else if (cleanUrl.includes('/chat')) {
    invalidateCache('/chat');
  } else if (cleanUrl.includes('/users') || cleanUrl.includes('/clients')) {
    invalidateCache('/users');
    invalidateCache('/clients');
    invalidateCache('/dashboard');
  } else {
    invalidateCache(url);
    invalidateCache('/dashboard');
  }
}

// Wrapper with in-memory caching and concurrent request deduplication
const api = {
  ...rawAxios,

  async get(url, config = {}) {
    const isCacheDisabled = config.cache === false || config.responseType === 'blob';
    const ttl = config.ttl || DEFAULT_TTL_MS;
    const cacheKey = `${url}__${JSON.stringify(config.params || {})}`;

    // 1. Check in-memory cache
    if (!isCacheDisabled) {
      const cached = cacheMap.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        return {
          data: cached.data,
          status: 200,
          statusText: 'OK (Cached)',
          headers: {},
          config,
          fromCache: true,
        };
      }
    }

    // 2. Check inflight duplicate requests
    if (!isCacheDisabled && inflightMap.has(cacheKey)) {
      return inflightMap.get(cacheKey);
    }

    const requestPromise = (async () => {
      try {
        const response = await rawAxios.get(url, config);
        if (!isCacheDisabled && response.status === 200) {
          cacheMap.set(cacheKey, {
            data: response.data,
            timestamp: Date.now(),
            ttl,
          });
        }
        return response;
      } finally {
        inflightMap.delete(cacheKey);
      }
    })();

    if (!isCacheDisabled) {
      inflightMap.set(cacheKey, requestPromise);
    }

    return requestPromise;
  },

  async post(url, data, config) {
    invalidateScopedCache(url);
    return rawAxios.post(url, data, config);
  },

  async put(url, data, config) {
    invalidateScopedCache(url);
    return rawAxios.put(url, data, config);
  },

  async patch(url, data, config) {
    invalidateScopedCache(url);
    return rawAxios.patch(url, data, config);
  },

  async delete(url, config) {
    invalidateScopedCache(url);
    return rawAxios.delete(url, config);
  },

  invalidateCache,
  invalidateScopedCache,
};

export function getWebSocketUrl(path = '') {
  const customApiUrl = import.meta.env.VITE_API_BASE_URL;
  let baseUrl;
  if (customApiUrl && customApiUrl.trim()) {
    baseUrl = customApiUrl.trim().replace(/\/+$/, '').replace(/^http/, 'ws');
  } else {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    baseUrl = `${protocol}//${window.location.host}`;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const token = localStorage.getItem('applyflow_access_token');
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${baseUrl}${cleanPath}${query}`;
}

export default api;
