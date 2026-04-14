import axios from 'axios';

const BASE_URL = import.meta.env.VITE_BASE_URL || 'https://songqueue.onrender.com';
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
