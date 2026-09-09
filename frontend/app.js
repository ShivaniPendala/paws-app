'use strict';

const BACKEND_BASE = 'http://localhost:8000';
const API_ENDPOINT = `${BACKEND_BASE}/api/report/process`;
const INCIDENTS_ENDPOINT = `${BACKEND_BASE}/api/incidents/nearby`;
const MAP_CONFIG_ENDPOINT = `${BACKEND_BASE}/api/config/maps`;
const MAP_REFRESH_MS = 15000;

let map;
let userMarker;
let incidentMarkers = [];
let currentLocation;

function setMapStatus(message) {
  const status = document.getElementById('mapStatus');
  if (status) status.textContent = message;
}

function showAnalysisResult(data) {
  const container = document.getElementById('candidateContainer');
  const score = Number.isFinite(data.injury_score) ? data.injury_score : 'N/A';
  const urgency = data.is_emergency ? 'Emergency attention recommended' : 'No emergency detected';
  const features = data.visual_traits?.features?.filter(Boolean).join(', ') || 'Not available';
  container.innerHTML = `
    <article class="analysis-card">
      <div class="analysis-heading">
        <h3>AI triage result</h3>
        <strong class="injury-score">${score}/10</strong>
      </div>
      <p>${data.condition_summary || 'No condition summary returned.'}</p>
      <p class="analysis-meta"><strong>${urgency}</strong> · Visual features: ${features}</p>
    </article>`;
}

async function loadGoogleMaps() {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) return resolve();
    fetch(MAP_CONFIG_ENDPOINT)
      .then((response) => {
        if (!response.ok) throw new Error('Google Maps is not configured');
        return response.json();
      })
      .then(({ api_key: apiKey }) => {
        if (!apiKey) throw new Error('Google Maps is not configured');
        window.initMap = resolve;
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=initMap`;
        script.async = true;
        script.defer = true;
        script.onerror = () => reject(new Error('Google Maps failed to load'));
        document.head.appendChild(script);
      })
      .catch(reject);
  });
}

function clearIncidentMarkers() {
  incidentMarkers.forEach((marker) => marker.setMap(null));
  incidentMarkers = [];
}

async function refreshIncidentMarkers() {
  if (!map || !currentLocation) return;
  const params = new URLSearchParams({
    lat: String(currentLocation.lat),
    lng: String(currentLocation.lng),
    radius_km: '25',
  });
  const response = await fetch(`${INCIDENTS_ENDPOINT}?${params}`);
  if (!response.ok) throw new Error('Could not load nearby incidents');
  const data = await response.json();
  clearIncidentMarkers();
  incidentMarkers = data.incidents.map((incident) => {
    const marker = new google.maps.Marker({
      map,
      position: { lat: incident.lat, lng: incident.lng },
      title: incident.dog_id || 'Active incident',
      icon: { url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' },
    });
    const info = new google.maps.InfoWindow({
      content: `<strong>${incident.dog_id || 'Active incident'}</strong><br>Rescue case is open`,
    });
    marker.addListener('click', () => info.open({ map, anchor: marker }));
    return marker;
  });
  setMapStatus(`${data.incidents.length} active incident${data.incidents.length === 1 ? '' : 's'} nearby`);
}

async function initializeMap() {
  try {
    await loadGoogleMaps();
    currentLocation = await getLocation();
    map = new google.maps.Map(document.getElementById('map'), {
      center: currentLocation,
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
    });
    userMarker = new google.maps.Marker({ map, position: currentLocation, title: 'Your location' });
    await refreshIncidentMarkers();
    window.setInterval(() => refreshIncidentMarkers().catch((error) => setMapStatus(error.message)), MAP_REFRESH_MS);
  } catch (error) {
    setMapStatus(error.message || 'Map unavailable');
  }
}

function compressImage(file, maxKb = 300) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const maxWidth = 1200;
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      let quality = 0.9;
      function tryExport() {
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Canvas export failed'));
          if (blob.size / 1024 <= maxKb || quality < 0.2) {
            resolve(blob);
          } else {
            quality -= 0.15;
            tryExport();
          }
        }, 'image/jpeg', quality);
      }
      tryExport();
      URL.revokeObjectURL(url);
    };
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation unsupported'));
    navigator.geolocation.getCurrentPosition((pos) => {
      resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    }, reject, { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 });
  });
}

async function submitReport(event) {
  event.preventDefault();
  const fileInput = document.getElementById('photoInput');
  if (!fileInput.files.length) return alert('Please select a photo');
  const file = fileInput.files[0];

  const is_bleeding = document.getElementById('is_bleeding').checked;
  const unable_to_move = document.getElementById('unable_to_move').checked;
  const in_traffic = document.getElementById('in_traffic').checked;
  const user_notes = document.getElementById('user_notes').value || '';

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing...';

  try {
    const loc = await getLocation();
    const compressed = await compressImage(file, 300);

    const form = new FormData();
    form.append('image', compressed, 'photo.jpg');
    form.append('lat', String(loc.lat));
    form.append('lng', String(loc.lng));
    form.append('is_bleeding', String(is_bleeding));
    form.append('unable_to_move', String(unable_to_move));
    form.append('in_traffic', String(in_traffic));
    form.append('user_notes', user_notes);

    // Pass X-User-ID header from localStorage if available
    const headers = new Headers();
    const userId = localStorage.getItem('X-User-ID');
    if (userId) headers.append('X-User-ID', userId);

    const resp = await fetch(API_ENDPOINT, { method: 'POST', body: form, headers });
    const data = await resp.json();

    if (data.status === 'REQUIRE_HUMAN_CONFIRMATION') {
      showAnalysisResult(data);
      showCandidateModal(data.candidate, async (isSame) => {
        if (isSame) {
          // Call backend endpoint to confirm match (not implemented in this minimal UI)
          alert('Confirmed existing dog. Backend will update record.');
        } else {
          alert('New dog profile will be created.');
        }
      });
    } else {
      showAnalysisResult(data);
      alert('Report submitted: ' + (data.message || data.status));
    }
  } catch (err) {
    console.error(err);
    alert('Error submitting report: ' + (err.message || err));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Report';
  }
}

function showCandidateModal(candidate, cb) {
  const modal = document.getElementById('confirmModal');
  const text = document.getElementById('modalText');
  text.textContent = `Is this Dog ${candidate.dog_id}? (confidence ${(candidate.confidence * 100).toFixed(0)}%)`;
  modal.classList.remove('hidden');

  const yes = document.getElementById('modalYes');
  const no = document.getElementById('modalNo');

  function cleanup() {
    modal.classList.add('hidden');
    yes.removeEventListener('click', onYes);
    no.removeEventListener('click', onNo);
  }

  function onYes() { cleanup(); cb(true); }
  function onNo() { cleanup(); cb(false); }

  yes.addEventListener('click', onYes);
  no.addEventListener('click', onNo);
}

document.getElementById('reportForm').addEventListener('submit', submitReport);
initializeMap();
