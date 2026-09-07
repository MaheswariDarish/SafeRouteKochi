import React, { useEffect, useState } from 'react';
import { X, Download, Printer, MapPin, RefreshCw } from 'lucide-react';

export default function MunicipalityReport({ onClose, onShowOnMap }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('lighting');

  const load = () => {
    setLoading(true);
    setError('');
    fetch('/api/municipality/report')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        return r.json();
      })
      .then(setReport)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const generatedAt = report?.generated_at
    ? new Date(report.generated_at).toLocaleString()
    : '';
  const tabs = report?.tabs || [];
  const current = tabs.find((t) => t.key === activeTab) || tabs[0];

  return (
    <div className="municipality-report">
      <header className="mr-head">
        <div>
          <h1>Municipality safety report</h1>
          <p>
            SafeRoute · Kochi{generatedAt ? ` · generated ${generatedAt}` : ''}
            {report ? ` · ${report.total_issues} items flagged` : ''}
          </p>
        </div>
        <div className="mr-head-actions">
          <button className="gm-secondary-button" onClick={load}>
            <RefreshCw size={15} /> Refresh
          </button>
          <a className="gm-secondary-button" href="/api/municipality/report?format=csv">
            <Download size={15} /> CSV
          </a>
          <button className="gm-secondary-button" onClick={() => window.print()}>
            <Printer size={15} /> Print
          </button>
          <button className="gm-icon-btn mr-no-print" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
      </header>

      {loading && <div className="mr-body mr-muted">Building report…</div>}
      {error && <div className="mr-body gm-inline-warning">{error}</div>}

      {report && !loading && (
        <div className="mr-body">
          <div className="mr-tabs mr-no-print">
            {tabs.map((t) => (
              <button
                key={t.key}
                className={`mr-tab ${current?.key === t.key ? 'active' : ''}`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
                <span className="mr-tab-count">{report.tab_totals[t.key]}</span>
              </button>
            ))}
          </div>

          {current && (
            <>
              <p className="mr-summary">{current.summary}</p>

              <div className="mr-tiles">
                {current.groups.map((g) => (
                  <div key={g.key} className="mr-tile">
                    <strong>{g.rows.length}</strong>
                    <span>{g.label}</span>
                  </div>
                ))}
                {current.groups.length === 0 && (
                  <div className="mr-muted">Nothing flagged in this category.</div>
                )}
              </div>

              {current.key === 'potholes' && current.zones?.length > 0 && (
                <section className="mr-section">
                  <h2>
                    Pothole-prone clusters <span className="mr-count">{current.zones.length}</span>
                  </h2>
                  <table className="mr-table">
                    <thead>
                      <tr>
                        <th>Centre</th>
                        <th>Reports in cluster</th>
                        <th>Severity</th>
                        <th className="mr-no-print" />
                      </tr>
                    </thead>
                    <tbody>
                      {current.zones.map((z, i) => (
                        <tr key={i}>
                          <td className="mr-coord">
                            {z.lat.toFixed(5)}, {z.lng.toFixed(5)}
                          </td>
                          <td>{z.count}</td>
                          <td>
                            <span className={`mr-status mr-status-${z.severity === 'high' ? 'pending' : 'verified'}`}>
                              {z.severity}
                            </span>
                          </td>
                          <td className="mr-no-print">
                            <button
                              className="gm-text-btn gm-text-btn-sm"
                              onClick={() => onShowOnMap(z.lat, z.lng)}
                            >
                              <MapPin size={13} /> Map
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {current.groups.map((g) => (
                <section key={g.key} className="mr-section">
                  <h2>
                    {g.label} <span className="mr-count">{g.rows.length}</span>
                  </h2>
                  <table className="mr-table">
                    <thead>
                      <tr>
                        <th>Location</th>
                        <th>Area</th>
                        <th>Coordinates</th>
                        <th>Detail</th>
                        <th>Status</th>
                        <th>Reported by</th>
                        <th className="mr-no-print" />
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r) => (
                        <tr key={r.id} className={r.recurrence_count ? 'mr-row-chronic' : ''}>
                          <td>
                            {r.label}
                            {r.recurrence_count > 0 && (
                              <span className="mr-chronic-tag">recurring ×{r.recurrence_count}</span>
                            )}
                          </td>
                          <td>{r.area || '—'}</td>
                          <td className="mr-coord">
                            {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                          </td>
                          <td>{r.detail}</td>
                          <td>
                            <span className={`mr-status mr-status-${r.status}`}>{r.status}</span>
                          </td>
                          <td>{r.reported_by || '—'}</td>
                          <td className="mr-no-print">
                            <button
                              className="gm-text-btn gm-text-btn-sm"
                              onClick={() => onShowOnMap(r.lat, r.lng)}
                            >
                              <MapPin size={13} /> Map
                            </button>
                          </td>
                        </tr>
                      ))}
                      {g.rows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="mr-muted">None.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </section>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
