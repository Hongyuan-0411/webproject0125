import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173';
const PHONE = __ENV.PHONE || '';
const PASSWORD = __ENV.PASSWORD || '';

export const options = {
  vus: Number(__ENV.VUS || 50),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

export default function () {
  const payload = JSON.stringify({ phoneNumber: PHONE, password: PASSWORD });
  const res = http.post(`${BASE_URL}/api/auth/login`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'login status is 200': (r) => r.status === 200,
  });

  sleep(0.1);
}
