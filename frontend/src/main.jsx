import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

async function loadGoogleMapsScript() {
  try {
    // Call FastAPI directly on port 8000
    const res = await fetch('http://127.0.0.1:8000/api/config/maps');
    if (res.ok) {
      const data = await res.json();
      if (data.api_key && !window.google) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `https://maps.googleapis.com/maps/api/js?key=${data.api_key}&libraries=places`;
          script.async = true;
          script.onload = () => {
            console.log("Google Maps SDK loaded successfully.");
            resolve();
          };
          script.onerror = (err) => reject(err);
          document.head.appendChild(script);
        });
      }
    } else {
      console.warn("Backend /api/config/maps returned non-200 status");
    }
  } catch (err) {
    console.error("Failed loading Google Maps script from backend:", err);
  }
}

// Ensure script attempt finishes before mounting React
loadGoogleMapsScript().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});