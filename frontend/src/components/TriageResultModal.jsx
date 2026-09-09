import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Crosshair, Dog, MapPinned, ShieldAlert, X } from 'lucide-react';
import { confirmIncidentMatch, submitReport } from '../services/api';

export default function TriageResultModal({ result, reportPayload, onClose, onComplete }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const score = Number(result.injury_score || 0);
  const traits = result.visual_traits || {};
  const candidate = result.candidate;
  const hasMatch = result.status === 'REQUIRE_HUMAN_CONFIRMATION' && candidate;
  const [candidatePlace, setCandidatePlace] = useState('nearby area');

  useEffect(() => {
    if (!hasMatch || candidate?.lat == null || candidate?.lng == null) return undefined;
    const controller = new AbortController();
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(candidate.lat)}&lon=${encodeURIComponent(candidate.lng)}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const address = data?.address || {};
        const area = address.suburb || address.neighbourhood || address.city_district || address.city || address.town || address.village;
        if (area) setCandidatePlace(address.city && address.city !== area ? `${area}, ${address.city}` : area);
      })
      .catch(() => { /* Keep the generic area when reverse geocoding is unavailable. */ });
    return () => controller.abort();
  }, [candidate?.lat, candidate?.lng, hasMatch]);

  async function confirmMatch() {
    setBusy(true);
    setError('');
    try {
      await confirmIncidentMatch(candidate.id, reportPayload.location);
      onComplete(`Match confirmed. ${candidate.dog_id} location was updated.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createNewProfile() {
    setBusy(true);
    setError('');
    try {
      const created = await submitReport({ ...reportPayload, ignoreMatch: true });
      onComplete(`New PAWS profile created: ${created.dog_id}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-backdrop triage-backdrop"><section className="triage-modal"><header className="triage-header"><div><p className="eyebrow">AI field assessment</p><h2>{hasMatch ? 'Matching dog found nearby' : 'Triage complete'}</h2><p>{hasMatch ? 'Review the nearby profile before creating a duplicate case.' : 'This assessment is ready for the rescue network.'}</p></div><button className="icon-button" onClick={onClose} disabled={busy}><X size={20} /></button></header><div className="triage-score-row"><div className={`score-ring ${score >= 7 ? 'critical' : score >= 4 ? 'watch' : 'stable'}`}><strong>{score}</strong><span>/10</span></div><div><p className="eyebrow">Injury score</p><h3>{result.is_emergency ? 'Emergency attention recommended' : 'Needs review, not marked critical'}</h3><p className="triage-summary">{result.condition_summary || 'No condition summary returned.'}</p></div></div><div className="triage-grid"><div className="triage-detail"><span className="detail-icon"><ShieldAlert size={17} /></span><div><small>Emergency status</small><strong>{result.is_emergency ? 'High priority' : 'Monitor and assess'}</strong></div></div><div className="triage-detail"><span className="detail-icon"><Dog size={17} /></span><div><small>Visual traits</small><strong>{traits.primary_color || 'Unknown color'}{traits.distinct_marks?.length ? ` · ${traits.distinct_marks.length} distinct mark(s)` : ''}</strong></div></div></div>{hasMatch && <div className="match-profile"><div className="match-photo"><Dog size={54} /></div><div className="match-copy"><p className="eyebrow">Possible existing profile</p><h3>{candidate.dog_id || 'Nearby PAWS dog'}</h3><p><MapPinned size={14} /> Last recorded near {Number(candidate.lat).toFixed(4)}, {Number(candidate.lng).toFixed(4)}</p><span className="confidence-badge"><CheckCircle2 size={14} />{Math.round(candidate.confidence * 100)}% match confidence</span></div></div>}{error && <p className="error-text">{error}</p>}<div className="triage-actions">{hasMatch ? <><button className="button button-outline" onClick={createNewProfile} disabled={busy}><Dog size={17} />Not this dog, create new PAWS ID</button><button className="button button-primary" onClick={confirmMatch} disabled={busy}><CheckCircle2 size={17} />{busy ? 'Updating...' : 'Yes, update this dog'}</button></> : <button className="button button-primary full" onClick={onClose}><AlertTriangle size={17} />Continue to rescue dashboard</button>}</div><div className="triage-location"><Crosshair size={15} />Report location: {reportPayload.location.lat.toFixed(4)}, {reportPayload.location.lng.toFixed(4)}</div></section></div>;
}
