import React, { useEffect, useState, useRef } from 'react';
import { Crosshair, RefreshCw, MapPin } from 'lucide-react';
import { BACKEND_BASE } from '../services/api';

let mapsLoader;

function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsLoader) return mapsLoader;
  mapsLoader = fetch(`${BACKEND_BASE}/api/config/maps`)
    .then((response) => {
      if (!response.ok) throw new Error('Google Maps config failed');
      return response.json();
    })
    .then(({ api_key: apiKey }) => new Promise((resolve, reject) => {
      if (!apiKey) return reject(new Error('No API key provided'));
      const callbackName = `pawsMapsReady${Date.now()}`;
      window[callbackName] = () => {
        delete window[callbackName];
        if (!window.google?.maps) return reject(new Error('Google Maps API missing'));
        resolve(window.google.maps);
      };
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${callbackName}&language=en`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('Google Maps script failed to load'));
      document.head.appendChild(script);
    }))
    .catch((error) => {
      mapsLoader = undefined;
      throw error;
    });
  return mapsLoader;
}

export default function LocationPicker({ value, onChange }) {
  const [status, setStatus] = useState('Finding your location...');
  const [address, setAddress] = useState('Fetching exact Google Maps address...');
  const [loading, setLoading] = useState(false);
  const geocoderRef = useRef(null);

  useEffect(() => {
    loadGoogleMaps()
      .then((maps) => {
        geocoderRef.current = new maps.Geocoder();
      })
      .catch((err) => console.warn('Google Maps JS SDK error:', err));
  }, []);

  function fetchGoogleAddress(lat, lng) {
    if (geocoderRef.current) {
      geocoderRef.current.geocode(
        { location: { lat, lng }, language: 'en' }, 
        (results, statusCode) => {
          const finalAddress = (statusCode === 'OK' && results && results[0]) 
            ? results[0].formatted_address 
            : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          
          setAddress(finalAddress);
          onChange({ lat, lng, address: finalAddress });
        }
      );
    } else {
      fallbackGeocodeEn(lat, lng);
    }
  }

  async function fallbackGeocodeEn(lat, lng) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`);
      const data = await res.json();
      const finalAddress = data?.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setAddress(finalAddress);
      onChange({ lat, lng, address: finalAddress });
    } catch (e) {
      const fallback = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setAddress(fallback);
      onChange({ lat, lng, address: fallback });
    }
  }

  function fetchCurrentLocation() {
    if (!navigator.geolocation) {
      setStatus('Geolocation not supported');
      return;
    }

    setLoading(true);
    setStatus('Location auto-detected');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setLoading(false);
        fetchGoogleAddress(lat, lng);
      },
      (error) => {
        console.error('Geolocation error:', error);
        setStatus('Location permission denied');
        setAddress('Please allow location access in your browser');
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  useEffect(() => {
    fetchCurrentLocation();
  }, []);

  return (
    <div className="location-picker">
      <div className="location-status-card" style={{ padding: '0.85rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Crosshair size={18} className={loading ? 'spin' : ''} style={{ color: '#2563eb' }} />
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>{status}</span>
          </div>
          <button
            type="button"
            onClick={fetchCurrentLocation}
            disabled={loading}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#64748b' }}
            title="Refresh location"
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', marginTop: '0.5rem', color: '#0f172a', fontSize: '0.85rem' }}>
          <MapPin size={16} style={{ color: '#dc2626', marginTop: '2px', flexShrink: 0 }} />
          <span style={{ fontWeight: 500 }}>{address}</span>
        </div>
      </div>

      <div className="location-coordinates" style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
        <span>GPS Coordinates:</span>
        <code>
          {value?.lat ? Number(value.lat).toFixed(5) : '0.00000'}, {value?.lng ? Number(value.lng).toFixed(5) : '0.00000'}
        </code>
      </div>
    </div>
  );
}