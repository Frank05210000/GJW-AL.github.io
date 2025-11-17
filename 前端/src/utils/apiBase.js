const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const withBase = (path) => `${API_BASE_URL}${path}`;

export default API_BASE_URL;
