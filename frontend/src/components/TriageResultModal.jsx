import React, { useState, useEffect } from 'react';
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

  const reportPlace = reportPayload?.location?.address || 
    `${Number(reportPayload?.location?.lat || 0).toFixed(4)}, ${Number(reportPayload?.location?.lng || 0).toFixed(4)}`;

  useEffect(() => {
    if (!hasMatch || candidate?.lat == null || candidate?.lng == null) return undefined;
    const controller = new AbortController();
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(candidate.lat)}&lon=${encodeURIComponent(candidate.lng)}&accept-language=en`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const address = data?.address || {};
        const area = address.suburb || address.neighbourhood || address.city_district || address.city || address.town || address.village;
        if (area) setCandidatePlace(address.city && address.city !== area ? `${area}, ${address.city}` : area);
      })
      .catch(() => {});
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

  return (
    <div style={styles.backdrop}>
      <section style={styles.modal}>
        <header style={styles.header}>
          <div>
            <span style={styles.eyebrow}>AI Field Assessment</span>
            <h2 style={styles.title}>{hasMatch ? 'Matching Dog Found Nearby' : 'Triage Complete'}</h2>
            <p style={styles.subtitle}>
              {hasMatch ? 'Review the nearby profile before creating a duplicate case.' : 'This assessment is ready for the rescue network.'}
            </p>
          </div>
          <button style={styles.closeButton} onClick={onClose} disabled={busy}>
            <X size={20} />
          </button>
        </header>

        <div style={styles.scoreRow}>
          <div style={{
            ...styles.scoreRing, 
            borderColor: score >= 7 ? '#dc2626' : score >= 4 ? '#d97706' : '#16a34a',
            color: score >= 7 ? '#dc2626' : score >= 4 ? '#d97706' : '#16a34a'
          }}>
            <strong style={{ fontSize: '1.5rem' }}>{score}</strong>
            <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>/10</span>
          </div>
          <div>
            <span style={styles.eyebrow}>Injury Score</span>
            <h3 style={{ margin: '0.1rem 0', fontSize: '1rem', color: '#1e293b' }}>
              {result.is_emergency ? 'Emergency attention recommended' : 'Needs review, monitor condition'}
            </h3>
            <p style={styles.summaryText}>{result.condition_summary || 'No condition summary returned.'}</p>
          </div>
        </div>

        <div style={styles.grid}>
          <div style={styles.detailCard}>
            <ShieldAlert size={18} color="#2563eb" />
            <div>
              <small style={{ color: '#64748b', display: 'block' }}>Emergency Status</small>
              <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>{result.is_emergency ? 'High Priority' : 'Standard Priority'}</strong>
            </div>
          </div>
          <div style={styles.detailCard}>
            <Dog size={18} color="#2563eb" />
            <div>
              <small style={{ color: '#64748b', display: 'block' }}>Visual Traits</small>
              <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                {traits.primary_color || 'Unknown'} {traits.distinct_marks?.length ? `· ${traits.distinct_marks.length} marks` : ''}
              </strong>
            </div>
          </div>
        </div>

        {hasMatch && (
          <div style={styles.matchCard}>
            <div style={styles.matchIconBox}><Dog size={32} color="#475569" /></div>
            <div>
              <span style={styles.eyebrow}>Possible Existing Profile</span>
              <h4 style={{ margin: '0.1rem 0', color: '#0f172a' }}>{candidate.dog_id || 'Nearby PAWS Dog'}</h4>
              <p style={{ margin: '0.2rem 0', fontSize: '0.8rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MapPinned size={13} /> Last recorded near {candidatePlace}
              </p>
              <span style={styles.confidenceBadge}>
                <CheckCircle2 size={13} /> {Math.round(candidate.confidence * 100)}% Match Confidence
              </span>
            </div>
          </div>
        )}

        {error && <p style={styles.errorText}>{error}</p>}

        <div style={styles.actions}>
          {hasMatch ? (
            <>
              <button style={styles.buttonOutline} onClick={createNewProfile} disabled={busy}>
                <Dog size={16} /> Not this dog, create new ID
              </button>
              <button style={styles.buttonPrimary} onClick={confirmMatch} disabled={busy}>
                <CheckCircle2 size={16} /> {busy ? 'Updating...' : 'Yes, update existing dog'}
              </button>
            </>
          ) : (
            <button style={{ ...styles.buttonPrimary, width: '100%' }} onClick={onClose}>
              <AlertTriangle size={16} /> Continue to Rescue Dashboard
            </button>
          )}
        </div>

        <div style={styles.footerLocation}>
          <Crosshair size={14} color="#64748b" />
          <span>Report Location: <strong>{reportPlace}</strong></span>
        </div>
      </section>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15, 23, 42, 0.65)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  modal: {
    background: '#ffffff',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '520px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '1.25rem 1.5rem 1rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '1px solid #f1f5f9',
  },
  eyebrow: {
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#64748b',
    fontWeight: 700,
  },
  title: {
    fontSize: '1.2rem',
    color: '#0f172a',
    margin: '0.1rem 0',
  },
  subtitle: {
    fontSize: '0.8rem',
    color: '#64748b',
    margin: 0,
  },
  closeButton: {
    background: '#f1f5f9',
    border: 'none',
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: '#64748b',
  },
  scoreRow: {
    padding: '1.25rem 1.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    background: '#f8fafc',
    borderBottom: '1px solid #f1f5f9',
  },
  scoreRing: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    border: '3px solid',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#ffffff',
    flexShrink: 0,
  },
  summaryText: {
    fontSize: '0.85rem',
    color: '#334155',
    margin: '0.2rem 0 0',
    lineHeight: 1.4,
  },
  grid: {
    padding: '1rem 1.5rem',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
  },
  detailCard: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  matchCard: {
    margin: '0 1.5rem 1rem',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '12px',
    padding: '1rem',
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
  },
  matchIconBox: {
    width: '48px',
    height: '48px',
    background: '#dbeafe',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  confidenceBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    background: '#dcfce7',
    color: '#166534',
    padding: '2px 8px',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: 600,
    marginTop: '4px',
  },
  actions: {
    padding: '0 1.5rem 1.25rem',
    display: 'flex',
    gap: '0.75rem',
  },
  buttonPrimary: {
    background: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    fontWeight: 600,
    fontSize: '0.85rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    flex: 1,
  },
  buttonOutline: {
    background: '#ffffff',
    color: '#334155',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    fontWeight: 600,
    fontSize: '0.85rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    flex: 1,
  },
  errorText: {
    color: '#dc2626',
    fontSize: '0.8rem',
    margin: '0 1.5rem 1rem',
  },
  footerLocation: {
    background: '#f8fafc',
    padding: '0.75rem 1.5rem',
    borderTop: '1px solid #f1f5f9',
    fontSize: '0.75rem',
    color: '#475569',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
};