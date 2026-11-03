import axiosInstance from '@core/api/axios';

const TOKEN_KEY = 'guest_delivery_token';

export function captureGuestTokenFromUrl() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const token = hash.get('token');
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  return token || sessionStorage.getItem(TOKEN_KEY) || '';
}

export function clearGuestToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

function config(extra = {}) {
  return {
    ...extra,
    headers: { ...(extra.headers || {}), 'X-Guest-Token': sessionStorage.getItem(TOKEN_KEY) || '' },
  };
}

export const guestDeliveryApi = {
  getTask: () => axiosInstance.get('/guest-deliveries/task', config()),
  updateLocation: (data) => axiosInstance.post('/guest-deliveries/location', data, config()),
  arrived: (data) => axiosInstance.post('/guest-deliveries/arrived', data, config()),
  pickup: (data) => axiosInstance.post('/guest-deliveries/pickup', data, config()),
  advance: () => axiosInstance.post('/guest-deliveries/advance', {}, config()),
  requestDeliveryOtp: (data) => axiosInstance.post('/guest-deliveries/delivery-otp/request', data, config()),
  verifyDeliveryOtp: (code) => axiosInstance.post('/guest-deliveries/delivery-otp/verify', { code }, config()),
  uploadImage: (formData) => axiosInstance.post('/guest-deliveries/upload', formData, config()),
  saveReturnProof: (data) => axiosInstance.post('/guest-deliveries/return/pickup-proof', data, config()),
  requestReturnPickupOtp: () => axiosInstance.post('/guest-deliveries/return/pickup-otp/request', {}, config()),
  verifyReturnPickupOtp: (code) => axiosInstance.post('/guest-deliveries/return/pickup-otp/verify', { code }, config()),
  requestReturnDropOtp: () => axiosInstance.post('/guest-deliveries/return/drop-otp/request', {}, config()),
  verifyReturnDropOtp: (code) => axiosInstance.post('/guest-deliveries/return/drop-otp/verify', { code }, config()),
  initiateCod: (amount) => axiosInstance.post('/guest-deliveries/cod/initiate', { amount }, config()),
  verifyCod: (data) => axiosInstance.post('/guest-deliveries/cod/verify', data, config()),
};
