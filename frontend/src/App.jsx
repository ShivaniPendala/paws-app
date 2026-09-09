import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Bell, CheckCircle2, ChevronRight, Crosshair, Dog, FileHeart, HeartPulse, Home, LogIn, MapPinned, Menu, PawPrint, Plus, ShieldCheck, Siren, Stethoscope, UserRound, X } from 'lucide-react';
import { createCommunityDog, getCommunityDogs, getIncidents, submitReport, updateIncident } from './services/api';
import { auth, firebaseConfigured, getVerifiedRole, logOut, observeAuth, signIn, signInWithGoogle, signUp } from './services/auth';
import TriageResultModal from './components/TriageResultModal';
import LocationPicker from './components/LocationPicker';
import WelfareMap from './components/WelfareMap';

const demoLocation = { lat: 17.385, lng: 78.4867 };
const demoIncidents = [
  { id: 'demo-1', dog_id: 'PAWS-A17C', lat: 17.388, lng: 78.49, status: 'OPEN', injury_score: 9, condition_summary: 'Possible road trauma; hind leg appears compromised.', is_emergency: true, distance_km: 0.8 },
  { id: 'demo-2', dog_id: 'PAWS-9D2K', lat: 17.379, lng: 78.481, status: 'DISPATCHED', injury_score: 6, condition_summary: 'Limping reported near a market lane.', is_emergency: false, distance_km: 1.2 },
  { id: 'demo-3', dog_id: 'PAWS-4F88', lat: 17.391, lng: 78.477, status: 'PENDING', injury_score: 4, condition_summary: 'Minor skin irritation; monitoring requested.', is_emergency: false, distance_km: 2.1 },
];
const demoDogs = [
  { id: 'dog-1', name: 'Mango', tag: 'PAWS-DOG-021', territory: 'Abids market', vaccinated: true, distance_km: 0.7, color: '#f59e0b' },
  { id: 'dog-2', name: 'Chai', tag: 'PAWS-DOG-044', territory: 'Tank Bund north', vaccinated: false, distance_km: 1.9, color: '#64748b' },
  { id: 'dog-3', name: 'Biscuit', tag: 'PAWS-DOG-063', territory: 'Lakdi-ka-pul', vaccinated: true, distance_km: 2.6, color: '#92400e' },
];

function getBrowserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(demoLocation);
    navigator.geolocation.getCurrentPosition((pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }), () => resolve(demoLocation), { enableHighAccuracy: true, timeout: 5000 });
  });
}

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('guest');
  const [page, setPage] = useState('home');
  const [location, setLocation] = useState(demoLocation);
  const [incidents, setIncidents] = useState(demoIncidents);
  const [dogs, setDogs] = useState(demoDogs);
  const [reportOpen, setReportOpen] = useState(false);
  const [triageResult, setTriageResult] = useState(null);
  const [reportPayload, setReportPayload] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const unsubscribe = observeAuth(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setRole(await getVerifiedRole(currentUser));
        setPage('reporter');
      } else {
        setRole('guest');
        setPage('home');
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => { getBrowserLocation().then(setLocation); }, []);
  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(''), 3600); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (page === 'map' || page === 'ngo') refreshIncidents();
  }, [page, location]);

  async function refreshIncidents() {
    try { const data = await getIncidents(location); if (data.incidents?.length) setIncidents(data.incidents); } catch { /* demo cache keeps the view useful offline */ }
  }
  async function refreshDogs() {
    try { const data = await getCommunityDogs(location); if (data.dogs?.length) setDogs(data.dogs); } catch { /* local fallback */ }
  }
  function enterApp(nextRole) {
    if (!user) return;
    if (nextRole === 'ngo' && role !== 'ngo') {
      setToast('NGO access is available only to administrator-verified rescue teams.');
      return;
    }
    setRole(nextRole);
    setPage(nextRole === 'ngo' ? 'ngo' : 'reporter');
  }
  function navigate(nextPage) {
    if (!user && nextPage !== 'home') return;
    setPage(nextPage);
    if (nextPage === 'community') refreshDogs();
  }
  async function handleStatus(id, status) {
    setIncidents((items) => items.map((item) => item.id === id ? { ...item, status } : item));
    try { await updateIncident(id, { status }); } catch { /* local optimistic state */ }
    setToast(`Case ${status.toLowerCase()} and synced to the rescue network.`);
  }

  async function handleLogout() {
    await logOut();
    setUser(null);
    setRole('guest');
    setPage('home');
    setToast('Signed out. Please sign in to file a report.');
  }

  if (!user) {
    return <LoginPage onLoggedIn={async (currentUser) => { setUser(currentUser); setRole(await getVerifiedRole(currentUser)); setPage('reporter'); }} />;
  }

  return <div className="app-shell">
    <Topbar role={role} page={page} user={user} onNavigate={navigate} onRole={enterApp} onLogout={handleLogout} />
    {page === 'home' && <HomePage onStart={() => enterApp('citizen')} onNgo={() => enterApp('ngo')} onMap={() => navigate('map')} incidents={incidents} />}
    {page === 'reporter' && <ReporterPage incidents={incidents} onReport={() => setReportOpen(true)} onMap={() => navigate('map')} />}
    {page === 'community' && <CommunityPage dogs={dogs} location={location} onAdded={(dog) => { setDogs((items) => [dog, ...items]); setToast('Community dog added to the local registry.'); }} />}
    {page === 'map' && <MapPage incidents={incidents} dogs={dogs} location={location} onLocationChange={setLocation} role={role} />}
    {page === 'ngo' && <NgoPage incidents={incidents} onStatus={handleStatus} />}
    {reportOpen && <ReportModal location={location} onClose={() => setReportOpen(false)} onResult={(result, payload) => { setReportOpen(false); setReportPayload(payload); setTriageResult(result); refreshIncidents(); }} />}
    {triageResult && reportPayload && <TriageResultModal result={triageResult} reportPayload={reportPayload} onClose={() => setTriageResult(null)} onComplete={(message) => { setTriageResult(null); setToast(message); refreshIncidents(); }} />}
    {toast && <div className="toast"><CheckCircle2 size={18} />{toast}</div>}
  </div>;
}

function Topbar({ role, page, user, onNavigate, onRole, onLogout }) {
  return <header className="topbar"><button className="brand" onClick={() => onNavigate('home')}><span className="brand-mark"><PawPrint size={21} /></span><span>PAWS<small>Predictive Animal Welfare System</small></span></button><nav className="nav-links">{role !== 'guest' && <><button className={page === 'reporter' || page === 'ngo' ? 'active' : ''} onClick={() => onNavigate(role === 'ngo' ? 'ngo' : 'reporter')}>{role === 'ngo' ? 'Rescue desk' : 'Report'}</button><button className={page === 'community' ? 'active' : ''} onClick={() => onNavigate('community')}>Community dogs</button><button className={page === 'map' ? 'active' : ''} onClick={() => onNavigate('map')}>Welfare map</button></>}</nav><div className="top-actions">{user ? <><span className="user-badge"><UserRound size={15} />{user.email ? user.email.split('@')[0] : 'Member'}</span><button className="role-pill" onClick={() => onRole(role === 'ngo' ? 'citizen' : 'ngo')}><UserRound size={15} />{role === 'ngo' ? 'NGO view' : 'Citizen view'}</button><button className="button button-light" onClick={onLogout}>Logout</button></> : <button className="button button-dark" onClick={() => onRole('citizen')}><LogIn size={16} />Enter app</button>}</div></header>;
}

function LoginPage({ onLoggedIn }) {
  const [mode, setMode] = useState('login');
  const [accountType, setAccountType] = useState('citizen');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Enter both email and password.');
      return;
    }
    setBusy(true);
    try {
      const result = mode === 'login' ? await signIn(email, password) : await signUp(email, password);
      onLoggedIn(result.user);
    } catch (err) {
      setError(err.message || 'Unable to sign in right now.');
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setBusy(true);
    try {
      const result = await signInWithGoogle();
      onLoggedIn(result.user);
    } catch (err) {
      setError(err.message || 'Google sign-in could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="login-shell">
    <div className="login-card">
      <div className="login-brand"><span className="brand-mark"><PawPrint size={21} /></span><div><strong>PAWS</strong><small>Animal welfare access</small></div></div>
      <p className="auth-quote">“Compassion in action starts here.”</p><h1>Sign in to report a dog</h1>
      <p>Choose how you will use PAWS. NGO tools are enabled only after verification by the PAWS administrator.</p>
      {!firebaseConfigured && <div className="login-warning">Firebase is not configured. Add the VITE_FIREBASE_* values in your frontend environment before enabling sign in.</div>}
      <div className="auth-tabs">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
        <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Create account</button>
      </div>
      <div className="account-type-picker" role="group" aria-label="Choose account type">
        <button type="button" className={accountType === 'citizen' ? 'active' : ''} onClick={() => setAccountType('citizen')}><UserRound size={17} /><span><strong>Citizen / Reporter</strong><small>Report animals near you</small></span></button>
        <button type="button" className={accountType === 'ngo' ? 'active' : ''} onClick={() => setAccountType('ngo')}><Siren size={17} /><span><strong>NGO / Rescue team</strong><small>Requires administrator approval</small></span></button>
      </div>
      {accountType === 'ngo' && <div className="login-warning">Choosing NGO does not grant rescue access. PAWS must verify your organisation and add a verified NGO claim to your Firebase account.</div>}
      <form onSubmit={handleSubmit} className="auth-form">
        <label className="field-label">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
        <label className="field-label">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /></label>
        {error && <div className="login-error">{error}</div>}
        <button className="button button-primary full" type="submit" disabled={busy || !firebaseConfigured}>{busy ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
      <div className="divider"><span>or</span></div>
      <button className="button button-dark full" type="button" onClick={handleGoogle} disabled={busy || !firebaseConfigured}><LogIn size={16} />Continue with Google</button>
    </div>
  </div>;
}

function HomePage({ onStart, onNgo, incidents }) {
  return <main><section className="hero page-width"><div className="hero-copy"><div className="kicker"><span className="live-dot" />Live welfare network</div><h1>Every dog deserves<br /><em>to be seen.</em></h1><p className="hero-lede">PAWS turns one photo into a coordinated rescue response. Triage an emergency, locate nearby cases, and keep community dogs visible to the people who care for them.</p><div className="hero-actions"><button className="button button-primary" onClick={onStart}><Siren size={18} />Report an emergency</button><button className="text-button" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>See how it works <ChevronRight size={17} /></button></div><div className="trust-row"><span><ShieldCheck size={16} />Location-aware</span><span><HeartPulse size={16} />AI-assisted</span><span><Bell size={16} />NGO-connected</span></div></div><div className="hero-visual"><div className="hero-photo"><div className="photo-sun" /><div className="dog-silhouette">🐕</div><div className="scan-line" /><div className="photo-caption"><span className="status-chip danger"><span />Urgent report</span><strong>AI triage in under a minute</strong></div></div><div className="float-card float-card-top"><span className="icon-box rose"><AlertTriangle size={17} /></span><span><b>3 active emergencies</b><small>within your network</small></span></div><div className="float-card float-card-bottom"><span className="avatar-stack"><i>🧑🏽</i><i>👩🏻</i><i>🧑🏾</i></span><span><b>48 rescuers online</b><small>ready to respond</small></span></div></div></section><section className="stats-strip page-width"><div><strong>{incidents.length + 126}</strong><span>cases surfaced</span></div><div><strong>91%</strong><span>triage confidence</span></div><div><strong>3.0 km</strong><span>community radius</span></div><div className="stats-note"><MapPinned size={18} /><span>Helping local teams move<br />with better context.</span></div></section><section id="how-it-works" className="feature-section page-width"><div className="section-intro"><p className="eyebrow">One connected response</p><h2>From a worried glance<br />to a clear next step.</h2></div><div className="feature-grid"><Feature icon={<FileHeart />} number="01" title="Report with context" text="Upload a photo, add what you know, and let your phone quietly capture the location." /><Feature icon={<Stethoscope />} number="02" title="Triage with care" text="Gemini vision surfaces an injury score and condition summary for faster decisions." /><Feature icon={<Activity />} number="03" title="Respond together" text="NGOs see live cases, claim the work, and keep the community informed." /></div></section><section className="cta-band page-width"><div><p className="eyebrow">For the people who show up</p><h2>See the need.<br /><em>Share the load.</em></h2></div><div className="cta-actions"><button className="button button-light" onClick={onStart}>I need to report <ChevronRight size={17} /></button><button className="button button-outline-light" onClick={onNgo}>I rescue animals</button></div></section></main>;
}
function Feature({ icon, number, title, text }) { return <article className="feature"><div className="feature-top"><span className="feature-icon">{icon}</span><span>{number}</span></div><h3>{title}</h3><p>{text}</p></article>; }

function ReporterPage({ incidents, onReport, onMap }) { return <main className="page-width app-page"><div className="page-heading"><div><p className="eyebrow">Citizen workspace</p><h1>Good eyes make<br /><em>safer streets.</em></h1><p>Report what you see. PAWS will help the right people find it.</p></div><button className="button button-primary large" onClick={onReport}><Plus size={19} />Report an animal</button></div><div className="dashboard-grid"><section className="panel report-banner"><div className="report-orbit"><Crosshair size={30} /></div><div><p className="eyebrow">Ready when you are</p><h2>Spotted an animal that needs help?</h2><p>Use the report button above to upload a photo and choose the exact location.</p></div></section><section className="section-row"><div><p className="eyebrow">Your neighborhood</p><h2>Active nearby reports</h2></div><button className="text-button" onClick={onMap}>Open live map <MapPinned size={16} /></button></section><div className="incident-list">{incidents.map((incident) => <IncidentCard key={incident.id} incident={incident} />)}</div></div></main>; }

function IncidentCard({ incident, action }) { return <article className="incident-card"><div className={`severity-marker ${incident.injury_score >= 7 ? 'high' : incident.injury_score >= 5 ? 'medium' : 'low'}`}><AlertTriangle size={17} /></div><div className="incident-body"><div className="card-topline"><span className="case-id">{incident.dog_id || 'Active report'}</span><span className={`status-chip ${incident.status?.toLowerCase() || 'pending'}`}><span />{incident.status || 'PENDING'}</span></div><h3>{incident.condition_summary || 'Animal welfare report'}</h3><p><MapPinned size={14} />{incident.distance_km ? `${incident.distance_km} km away` : 'Location available'} <span className="dot-divider">·</span> Injury score {incident.injury_score || '—'}/10</p></div>{action || <button className="icon-button" title="View on map"><ChevronRight size={18} /></button>}</article>; }

function LegacyReportModal({ location, onClose, onResult }) { const [file, setFile] = useState(null); const [notes, setNotes] = useState(''); const [flags, setFlags] = useState({ is_bleeding: false, unable_to_move: false, in_traffic: false }); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); async function handleSubmit(event) { event.preventDefault(); if (!file) return setError('Choose a photo first.'); setBusy(true); setError(''); const payload = { file, location, flags, notes }; try { const result = await submitReport(payload); onResult(result, payload); } catch (err) { setError(err.message); } finally { setBusy(false); } } return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card"><div className="modal-header"><div><p className="eyebrow">New field report</p><h2>Give rescuers a head start.</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><form onSubmit={handleSubmit}><label className="dropzone">{file ? <><CheckCircle2 size={25} /><strong>{file.name}</strong><span>Ready for triage</span></> : <><FileHeart size={25} /><strong>Choose a clear photo</strong><span>JPG, PNG up to 10 MB</span></>}<input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0])} /></label><div className="location-readout"><Crosshair size={16} /><span>Location captured</span><code>{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</code></div><div className="flag-grid">{[['is_bleeding','Bleeding'],['unable_to_move','Unable to move'],['in_traffic','In traffic']].map(([key,label]) => <label className={`toggle ${flags[key] ? 'selected' : ''}`} key={key}><input type="checkbox" checked={flags[key]} onChange={(event) => setFlags({ ...flags, [key]: event.target.checked })} /><span>{label}</span></label>)}</div><label className="field-label">What else should rescuers know?<textarea rows="3" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Landmark, behavior, visible injury..." /></label>{error && <p className="error-text">{error}</p>}<button className="button button-primary full" disabled={busy}>{busy ? <><Activity className="spin" size={17} />Analyzing photo...</> : <><Siren size={17} />Submit for AI triage</>}</button></form></section></div>; }

function CommunityPage({ dogs, location, onAdded }) { const [open, setOpen] = useState(false); return <main className="page-width app-page"><div className="page-heading compact"><div><p className="eyebrow">Shared neighborhood memory</p><h1>Community <em>dogs.</em></h1><p>Know who lives nearby, and what care they need next.</p></div><button className="button button-primary" onClick={() => setOpen(true)}><Plus size={18} />Add a dog</button></div><div className="registry-toolbar"><span><Crosshair size={16} />Within 3 km of your location</span><span className="muted">{dogs.length} dogs in the local registry</span></div><div className="dog-grid">{dogs.map((dog) => <DogCard dog={dog} key={dog.id} />)}</div>{open && <LegacyDogModal location={location} onClose={() => setOpen(false)} onAdded={(dog) => { onAdded(dog); setOpen(false); }} />}</main>; }
function DogCard({ dog }) { const distance = dog.distance_km ?? null; return <article className="dog-card"><div className="dog-portrait" style={{ '--dog-color': dog.color || '#64748b' }}><Dog size={70} strokeWidth={1.2} /></div><div className="dog-card-body"><div className="card-topline"><span className="case-id">{dog.tag || 'Community dog'}</span><span className={`vaccine-tag ${dog.vaccinated ? 'yes' : 'no'}`}>{dog.vaccinated ? 'Vaccinated' : 'Needs vaccine'}</span></div><h3>{dog.name || 'Unnamed'}</h3><p>{dog.territory || 'Territory not noted'}</p><div className="dog-meta"><span><MapPinned size={14} />{distance === null ? 'Distance unavailable' : `${Number(distance).toFixed(1)} km away`}</span><span>Last checked recently</span></div></div></article>; }
function LegacyDogModal({ location, onClose, onAdded }) { const [form, setForm] = useState({ photo: null, name: '', details: '', territory: '', vaccinated: false }); const [saving, setSaving] = useState(false); async function save(event) { event.preventDefault(); setSaving(true); const dog = { ...form, photo: undefined, id: `local-${Date.now()}`, lat: location.lat, lng: location.lng, distance_km: 0, tag: `PAWS-DOG-${String(Date.now()).slice(-3)}`, color: '#0e7490' }; try { const result = await createCommunityDog(dog); onAdded(result.dog || dog); } catch { onAdded(dog); } finally { setSaving(false); } } return <div className="modal-backdrop"><section className="modal-card small-modal"><div className="modal-header"><div><p className="eyebrow">Community registry</p><h2>Add a familiar face.</h2><p className="modal-question-note">Three quick questions help rescuers recognise this dog.</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><form onSubmit={save}><label className="field-label">1. Can you add a clear photo?<span className="field-hint">A front or side view works best.</span><input required type="file" accept="image/*" onChange={(e) => setForm({ ...form, photo: e.target.files?.[0] || null })} /></label><label className="field-label">2. What should we know about this dog?<textarea required rows="3" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="Name, colour, gender, or a distinct mark" /></label><label className="field-label">3. Where can rescuers find this dog?<input required value={form.territory} onChange={(e) => setForm({ ...form, territory: e.target.value })} placeholder="Landmark or regular territory" /></label><label className="check-line"><input type="checkbox" checked={form.vaccinated} onChange={(e) => setForm({ ...form, vaccinated: e.target.checked })} /> Vaccination verified</label><button className="button button-primary full" disabled={saving}>{saving ? 'Saving...' : 'Add to registry'}</button></form></section></div>; }

function MapPage({ incidents, dogs, location, onLocationChange, role }) { return <main className="page-width app-page"><div className="page-heading compact"><div><p className="eyebrow">{role === 'ngo' ? 'Operations map' : 'Public welfare map'}</p><h1>See the work <em>around you.</em></h1><p>Live cases, community dogs, and the people moving toward them.</p></div><span className="live-badge"><span className="live-dot" />Live Google Maps</span></div><div className="map-board real-map-board"><div className="real-map-main"><WelfareMap incidents={incidents} dogs={dogs} location={location} onLocationChange={onLocationChange} /></div><aside className="map-legend"><h3>Map layers</h3><label><i className="legend-dot red" />Emergency cases <b>{incidents.filter((i) => i.injury_score >= 7).length}</b></label><label><i className="legend-dot yellow" />In progress <b>{incidents.filter((i) => i.status === 'DISPATCHED').length}</b></label><label><i className="legend-dot cyan" />Community dogs <b>{dogs.length}</b></label><div className="map-coords"><Crosshair size={15} />Selected: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}</div></aside></div></main>; }

function NgoPage({ incidents, onStatus }) { const [filter, setFilter] = useState('all'); const filtered = incidents.filter((item) => filter === 'all' || (filter === 'urgent' ? item.injury_score >= 7 : item.status === filter)); return <main className="page-width app-page"><div className="page-heading compact"><div><p className="eyebrow">NGO command desk</p><h1>Make the next move<br /><em>count.</em></h1><p>Prioritize, claim, and close the cases your team can reach.</p></div><div className="ngo-status"><span className="live-dot" />Team online <strong>48</strong></div></div><div className="ngo-metrics"><Metric icon={<Siren />} value={incidents.filter((i) => i.injury_score >= 7).length} label="Urgent now" tone="rose" /><Metric icon={<Activity />} value={incidents.filter((i) => i.status === 'DISPATCHED').length} label="In progress" tone="blue" /><Metric icon={<CheckCircle2 />} value="12" label="Resolved today" tone="green" /><Metric icon={<MapPinned />} value="3.0 km" label="Response radius" tone="teal" /></div><div className="section-row"><div><p className="eyebrow">Live queue</p><h2>Incident triage</h2></div><div className="filter-tabs">{[['all','All cases'],['urgent','Urgent'],['DISPATCHED','Dispatched']].map(([key,label]) => <button className={filter === key ? 'active' : ''} key={key} onClick={() => setFilter(key)}>{label}</button>)}</div></div><div className="ngo-queue">{filtered.map((incident) => <IncidentCard key={incident.id} incident={incident} action={<div className="action-stack">{incident.status !== 'DISPATCHED' && <button className="button button-small button-blue" onClick={() => onStatus(incident.id, 'DISPATCHED')}>Claim case</button>}{incident.status === 'DISPATCHED' && <button className="button button-small button-primary" onClick={() => onStatus(incident.id, 'RESCUED')}>Mark rescued</button>}</div>} />)}</div></main>; }
function Metric({ icon, value, label, tone }) { return <div className={`metric tone-${tone}`}><span>{icon}</span><strong>{value}</strong><small>{label}</small></div>; }

function DogModal({ location, onClose, onAdded }) {
  const [form, setForm] = useState({
    photo: null,
    name: '',
    gender: '',
    appearance: '',
    territory: '',
    health: '',
    vaccinated: false,
  });
  const [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    const dog = {
      ...form,
      photo: undefined,
      details: `${form.gender || 'Gender unknown'}; ${form.appearance}; ${form.health || 'No health notes'}`,
      id: `local-${Date.now()}`,
      lat: location.lat,
      lng: location.lng,
      distance_km: 0,
      tag: `PAWS-DOG-${String(Date.now()).slice(-3)}`,
      color: '#0e7490',
    };
    try {
      const result = await createCommunityDog(dog);
      onAdded(result.dog || dog);
    } catch {
      onAdded(dog);
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop">
    <section className="modal-card dog-profile-modal">
      <div className="modal-header">
        <div><p className="eyebrow">Community registry</p><h2>Help us recognise this dog.</h2><p className="modal-question-note">The details help feeders, rescuers, and vets identify the right dog later.</p></div>
        <button className="icon-button" onClick={onClose}><X size={19} /></button>
      </div>
      <form onSubmit={save} className="dog-profile-form">
        <label className="field-label form-wide">Dog photo<span className="field-hint">Choose a clear front or side view.</span><input required type="file" accept="image/*" onChange={(event) => setForm({ ...form, photo: event.target.files?.[0] || null })} /></label>
        <label className="field-label">Name or nickname<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Mango" /></label>
        <label className="field-label">Gender<select required value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="">Select gender</option><option>Male</option><option>Female</option><option>Unknown</option></select></label>
        <label className="field-label form-wide">How can we recognise this dog?<span className="field-hint">Colour, size, collar, scars, ear shape, or other distinct marks.</span><textarea required rows="3" value={form.appearance} onChange={(event) => setForm({ ...form, appearance: event.target.value })} placeholder="Brown coat, white patch on chest, blue collar..." /></label>
        <label className="field-label form-wide">Where is the dog usually found?<span className="field-hint">Add a landmark, street, shop, or regular feeding spot.</span><input required value={form.territory} onChange={(event) => setForm({ ...form, territory: event.target.value })} placeholder="Near the park gate on Tank Bund Road" /></label>
        <label className="field-label form-wide">Any health or care information?<span className="field-hint">Mention injuries, medication, feeding needs, or the last vaccination drive.</span><textarea rows="2" value={form.health} onChange={(event) => setForm({ ...form, health: event.target.value })} placeholder="Needs vaccination / healthy / limping on back leg..." /></label>
        <label className="check-line form-wide"><input type="checkbox" checked={form.vaccinated} onChange={(event) => setForm({ ...form, vaccinated: event.target.checked })} /> Vaccination verified</label>
        <button className="button button-primary full form-wide" disabled={saving}>{saving ? 'Saving profile...' : 'Add dog to community registry'}</button>
      </form>
    </section>
  </div>;
}

function ReportModal({ location, onClose, onResult }) {
  const [selectedLocation, setSelectedLocation] = useState(location);
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [flags, setFlags] = useState({ is_bleeding: false, unable_to_move: false, in_traffic: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file) return setError('Choose a photo first.');
    setBusy(true);
    setError('');
    const payload = { file, location: selectedLocation, flags, notes };
    try {
      const result = await submitReport(payload);
      onResult(result, payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal-card report-modal">
      <div className="modal-header"><div><p className="eyebrow">New field report</p><h2>Your eyes today could save a life tomorrow.</h2><p className="modal-question-note">Add a photo, choose where the dog is, and tell rescuers what matters.</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>
      <form onSubmit={handleSubmit}>
        <label className="dropzone">{file ? <><CheckCircle2 size={25} /><strong>{file.name}</strong><span>Ready for AI triage</span></> : <><FileHeart size={25} /><strong>Choose a clear photo</strong><span>JPG or PNG up to 10 MB</span></>}<input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
        <LocationPicker value={selectedLocation} onChange={setSelectedLocation} />
        <div className="flag-grid">{[['is_bleeding','Bleeding'],['unable_to_move','Unable to move'],['in_traffic','In traffic']].map(([key, label]) => <label className={`toggle ${flags[key] ? 'selected' : ''}`} key={key}><input type="checkbox" checked={flags[key]} onChange={(event) => setFlags({ ...flags, [key]: event.target.checked })} /><span>{label}</span></label>)}</div>
        <label className="field-label">What else should rescuers know?<textarea rows="3" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Landmark, behaviour, visible injury, or immediate danger..." /></label>
        {error && <p className="error-text">{error}</p>}
        <button className="button button-primary full" disabled={busy}>{busy ? <><Activity className="spin" size={17} />Analyzing photo...</> : <><Siren size={17} />Submit for AI triage</>}</button>
      </form>
    </section>
  </div>;
}

export default App;
