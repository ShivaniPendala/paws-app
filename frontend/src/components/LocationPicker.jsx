import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, MapPin, Search, Target } from 'lucide-react';
import { BACKEND_BASE } from '../services/api';

let mapsLoader;

function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsLoader) return mapsLoader;
  mapsLoader = fetch(`${BACKEND_BASE}/api/config/maps`)
    .then((response) => {
      if (!response.ok) throw new Error('Google Maps is not configured');
      return response.json();
    })
    .then(({ api_key: apiKey }) => new Promise((resolve, reject) => {
      const callbackName = `pawsMapsReady${Date.now()}`;
      window[callbackName] = () => {
        delete window[callbackName];
        if (!window.google?.maps) {
          reject(new Error('Google Maps loaded without the Maps JavaScript API'));
          return;
        }
        resolve(window.google.maps);
      };
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${callbackName}`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('Google Maps could not load'));
      document.head.appendChild(script);
    }))
    .catch((error) => {
      mapsLoader = undefined;
      throw error;
    });
  return mapsLoader;
}

export default function LocationPicker({ value, onChange }) {
  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);
  const [mode, setMode] = useState('current');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Loading map...');
  const [mapReady, setMapReady] = useState(false);
  const [manualLat, setManualLat] = useState(String(value.lat));
  const [manualLng, setManualLng] = useState(String(value.lng));

  useEffect(() => {
    if (mode !== 'manual') return undefined;
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !mapElement.current || mapRef.current) return;
      const center = { lat: Number(value.lat), lng: Number(value.lng) };
      mapRef.current = new maps.Map(mapElement.current, { center, zoom: 15, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
      markerRef.current = new maps.Marker({ position: center, map: mapRef.current, draggable: true, title: 'Drag to the animal location' });
      geocoderRef.current = new maps.Geocoder();
      markerRef.current.addListener('dragend', (event) => onChange({ lat: event.latLng.lat(), lng: event.latLng.lng() }));
      setMapReady(true);
      setStatus('Drag the pin to the exact spot');
    }).catch((error) => {
      if (!cancelled) setStatus(`${error.message || 'Google Maps is unavailable.'} You can enter the location coordinates below.`);
    });
    return () => { cancelled = true; };
  }, [mode]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const position = { lat: Number(value.lat), lng: Number(value.lng) };
    markerRef.current.setPosition(position);
    mapRef.current.panTo(position);
  }, [value.lat, value.lng]);

  function useCurrentLocation() {
    setMode('current');
    setStatus('Finding your location...');
    navigator.geolocation?.getCurrentPosition(
      (position) => { onChange({ lat: position.coords.latitude, lng: position.coords.longitude }); setStatus('Using your current location'); },
      () => setStatus('Could not access your location. Choose manual location.'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function searchAddress(event) {
    event.preventDefault();
    if (!query.trim() || !geocoderRef.current) return;
    geocoderRef.current.geocode({ address: query }, (results, statusCode) => {
      if (statusCode !== 'OK' || !results[0]) return setStatus('Address not found. Try a nearby landmark.');
      const point = results[0].geometry.location;
      onChange({ lat: point.lat(), lng: point.lng() });
      setStatus(results[0].formatted_address);
    });
  }

  function applyCoordinates(event) {
    event.preventDefault();
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setStatus('Enter a valid latitude and longitude.');
      return;
    }
    onChange({ lat, lng });
    setStatus('Manual location selected');
  }

  return <div className="location-picker">
    <div className="location-choice" role="group" aria-label="Choose report location">
      <button type="button" className={mode === 'current' ? 'active' : ''} onClick={useCurrentLocation}><Target size={16} />Use my location</button>
      <button type="button" className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}><MapPin size={16} />Choose manually</button>
    </div>
    {mode === 'manual' && <>
      <form className="location-search" onSubmit={searchAddress}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search an address or landmark" /><button type="submit" title="Search address"><Search size={17} /></button></form>
      <div className="location-map" ref={mapElement}>{!mapReady && <span>{status}</span>}</div>
      <p className="location-help"><Crosshair size={14} />{status}</p>
      {!mapReady && <form className="manual-coordinates" onSubmit={applyCoordinates}><label>Latitude<input inputMode="decimal" value={manualLat} onChange={(event) => setManualLat(event.target.value)} /></label><label>Longitude<input inputMode="decimal" value={manualLng} onChange={(event) => setManualLng(event.target.value)} /></label><button className="button button-dark" type="submit">Use this point</button></form>}
    </>}
    {mode === 'current' && <p className="location-help"><Crosshair size={14} />{status || 'Your browser location will be used for this report.'}</p>}
    <div className="location-coordinates"><span>Selected point</span><code>{Number(value.lat).toFixed(5)}, {Number(value.lng).toFixed(5)}</code></div>
  </div>;
}
