import { auth } from './auth';

const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE || 'http://localhost:8000';

async function request(path, options = {}) {
  const response = await fetch(`${BACKEND_BASE}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || body.message || `Request failed (${response.status})`);
  return body;
}

export async function submitReport({ file, location, flags, notes, ignoreMatch = false, user }) {
  const currentUser = user || auth?.currentUser;
  if (!currentUser) throw new Error('Sign in before submitting a report.');
  const token = await currentUser.getIdToken();
  const form = new FormData();
  form.append('image', file, file.name || 'report.jpg');
  form.append('lat', String(location.lat));
  form.append('lng', String(location.lng));
  if (location.address) form.append('location_address', location.address);
  Object.entries(flags).forEach(([key, value]) => form.append(key, String(value)));
  form.append('user_notes', notes);
  form.append('ignore_match', String(ignoreMatch));
  return request('/api/report/process', { method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` } });
}

export function getIncidents(location, radius = 25) {
  const params = new URLSearchParams({ lat: location.lat, lng: location.lng, radius_km: radius });
  return request(`/api/incidents/nearby?${params}`);
}

export function getCommunityDogs(location, radius = 3) {
  const params = new URLSearchParams({ lat: location.lat, lng: location.lng, radius_km: radius });
  return request(`/api/community-dogs?${params}`);
}

export function createCommunityDog(payload) {
  return request('/api/community-dogs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

export function updateIncident(id, payload) {
  const user = auth?.currentUser;
  return user?.getIdToken().then((token) => request(`/api/incidents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })) || Promise.reject(new Error('Sign in before updating an incident.'));
}

export function confirmIncidentMatch(id, location) {
  return request(`/api/incidents/${id}/confirm-match`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(location) });
}

export { BACKEND_BASE };
