import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, MapPin, Search } from 'lucide-react';
import { BACKEND_BASE } from '../services/api';

let mapsLoader;

function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsLoader) return mapsLoader;
  mapsLoader = fetch(`${BACKEND_BASE}/api/config/maps`)
    .then((response) => {
      if (!response.ok) throw new Error('Google Maps configuration unavailable');
      return response.json();
    })
    .then(({ api_key: apiKey }) => new Promise((resolve, reject) => {
      const callbackName = `pawsWelfareMap${Date.now()}`;
      window[callbackName] = () => { delete window[callbackName]; resolve(window.google.maps); };
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${callbackName}`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('Google Maps failed to load'));
      document.head.appendChild(script);
    }));
  return mapsLoader;
}

export default function WelfareMap({ incidents, dogs, location, onLocationChange }) {
  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const locationMarkerRef = useRef(null);
  const geocoderRef = useRef(null);
  const incidentMarkersRef = useRef([]);
  const dogMarkersRef = useRef([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Loading Google Maps...');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !mapElement.current || mapRef.current) return;
      const center = { lat: Number(location.lat), lng: Number(location.lng) };
      mapRef.current = new maps.Map(mapElement.current, { center, zoom: 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
      geocoderRef.current = new maps.Geocoder();
      locationMarkerRef.current = new maps.Marker({ map: mapRef.current, position: center, draggable: true, title: 'Drag to move your selected location', label: { text: 'You', color: '#ffffff', fontWeight: '700' } });
      locationMarkerRef.current.addListener('dragend', (event) => {
        const next = { lat: event.latLng.lat(), lng: event.latLng.lng() };
        onLocationChange(next);
        mapRef.current.panTo(next);
        setStatus('Selected location updated');
      });
      setReady(true);
      setStatus('Drag the Your location pin to move the map point');
    }).catch((error) => setStatus(`${error.message}. Check the backend and Maps key.`));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !locationMarkerRef.current) return;
    const next = { lat: Number(location.lat), lng: Number(location.lng) };
    locationMarkerRef.current.setPosition(next);
    mapRef.current.panTo(next);
  }, [location.lat, location.lng]);

  useEffect(() => {
    if (!ready || !window.google?.maps || !mapRef.current) return;
    const maps = window.google.maps;
    incidentMarkersRef.current.forEach((marker) => marker.setMap(null));
    dogMarkersRef.current.forEach((marker) => marker.setMap(null));
    incidentMarkersRef.current = incidents.map((incident) => new maps.Marker({
      map: mapRef.current,
      position: { lat: Number(incident.lat), lng: Number(incident.lng) },
      title: `${incident.dog_id || 'Incident'} - injury score ${incident.injury_score || 'unknown'}`,
      icon: { url: incident.injury_score >= 7 ? 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' : 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png' },
    }));
    dogMarkersRef.current = dogs.map((dog) => new maps.Marker({
      map: mapRef.current,
      position: { lat: Number(dog.lat), lng: Number(dog.lng) },
      title: dog.name || 'Community dog',
      icon: { url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' },
    }));
  }, [ready, incidents, dogs]);

  function searchAddress(event) {
    event.preventDefault();
    if (!query.trim() || !geocoderRef.current) return;
    geocoderRef.current.geocode({ address: query }, (results, code) => {
      if (code !== 'OK' || !results[0]) return setStatus('Address not found. Try a landmark.');
      const point = results[0].geometry.location;
      const next = { lat: point.lat(), lng: point.lng() };
      onLocationChange(next);
      mapRef.current.panTo(next);
      mapRef.current.setZoom(16);
      setStatus(results[0].formatted_address);
    });
  }

  function useCurrentLocation() {
    navigator.geolocation?.getCurrentPosition((position) => {
      const next = { lat: position.coords.latitude, lng: position.coords.longitude };
      onLocationChange(next);
      setStatus('Using your current location');
    }, () => setStatus('Could not access your location. Drag the pin or search manually.'), { enableHighAccuracy: true, timeout: 10000 });
  }

  return <div className="welfare-map-wrap">
    <div className="welfare-map-controls">
      <form className="location-search" onSubmit={searchAddress}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search an address or landmark" /><button type="submit" title="Search address"><Search size={17} /></button></form>
      <button className="button button-light map-current-button" type="button" onClick={useCurrentLocation}><Crosshair size={16} />Use my location</button>
    </div>
    <div className="real-google-map" ref={mapElement}>{!ready && <span>{status}</span>}</div>
    <p className="map-drag-help"><MapPin size={15} />{status}</p>
    <div className="map-selected-point"><span>Selected location</span><code>{Number(location.lat).toFixed(5)}, {Number(location.lng).toFixed(5)}</code></div>
  </div>;
}
