import axios from 'axios';

const currentProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const currentHostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

const isLocalAddress = (hostname) => {
    if (!hostname) return false;
    if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;

    const match = hostname.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
    return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31;
};

const localDevBaseUrl = `${currentProtocol}//${currentHostname}:5000`;
const shouldUseLocalBackend = import.meta.env.DEV || isLocalAddress(currentHostname);

const BASE_URL = import.meta.env.VITE_BASE_URL || (
    shouldUseLocalBackend
        ? localDevBaseUrl
        : 'https://songqueue.onrender.com'
);
const API_BASE_URL = `${BASE_URL}/api`;
const SOCKET_URL = BASE_URL;

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Add interceptor for auth token
api.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export { BASE_URL, API_BASE_URL, SOCKET_URL };
export default api;
