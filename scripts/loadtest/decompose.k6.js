import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const USER_GOAL = __ENV.USER_GOAL || '认识钟表';
const LEARNING_FOCUS = __ENV.LEARNING_FOCUS || '认识时针和分针';

export const options = {
  vus: Number(__ENV.VUS || 100),
  duration: __ENV.DURATION || '60s',
  thresholds: {
    http_req_failed: ['rate<0.1'],
    http_req_duration: ['p(95)<5000'],
  },
};

export default function () {
  const payload = JSON.stringify({
    userGoal: USER_GOAL,
    learningFocus: LEARNING_FOCUS,
    musicStyle: '欢快',
    musicVoice: '男生',
    pictureBookStyle: '柔和水彩扁平',
    characterType: '男生',
    characterName: '乐乐',
  });

  const headers = {
    'Content-Type': 'application/json',
  };
  if (AUTH_TOKEN) {
    headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  }

  const res = http.post(`${BASE_URL}/api/decompose-prompt`, payload, { headers });

  check(res, {
    'status is 200/429': (r) => r.status === 200 || r.status === 429,
  });

  sleep(0.1);
}
