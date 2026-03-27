import { useState, useEffect, useCallback, useRef } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  daysAgo,
  fetchOverviewStats,
  fetchAvgSession,
  fetchDailyVisitors,
  fetchTopFilters,
  fetchTopProperties,
  fetchTopClicks,
  fetchUsers,
  fetchLiveFeed,
} from '../lib/queries';

const RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

const TABS = ['overview', 'users', 'live'];

const EVENT_BADGE = {
  pageview:      { bg: 'rgba(0,212,170,0.1)', color: 'var(--accent)' },
  filter:        { bg: 'rgba(0,153,255,0.1)', color: 'var(--accent2)' },
  click:         { bg: 'rgba(245,158,11,0.1)', color: 'var(--warn)' },
  property_view: { bg: 'rgba(168,85,247,0.1)', color: '#a855f7' },
  session_end:   { bg: 'rgba(255,255,255,0.06)', color: 'var(--muted)' },
};

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Dashboard({ onLogout }) {
  const [range, setRange] = useState(RANGES[0]);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});
  const [liveFeed, setLiveFeed] = useState([]);
  const liveInterval = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const since = daysAgo(range.days);
      const [stats, avgSession, daily, filters, properties, clicks, users] = await Promise.all([
        fetchOverviewStats(since),
        fetchAvgSession(since),
        fetchDailyVisitors(since),
        fetchTopFilters(since),
        fetchTopProperties(since),
        fetchTopClicks(since),
        fetchUsers(since),
      ]);
      setData({ stats, avgSession, daily, filters, properties, clicks, users });
    } catch (err) {
      console.error('Failed to load dashboard data:', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { loadData(); }, [loadData]);

  // Live feed polling
  useEffect(() => {
    if (tab !== 'live') {
      clearInterval(liveInterval.current);
      return;
    }
    const load = async () => {
      try { setLiveFeed(await fetchLiveFeed()); } catch {}
    };
    load();
    liveInterval.current = setInterval(load, 15000);
    return () => clearInterval(liveInterval.current);
  }, [tab]);

  const { stats = {}, avgSession = 0, daily = [], filters = [], properties = [], clicks = [], users = [] } = data;

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <span className="header-title">DxbDipFinder - Admin</span>
        </div>
        <div className="header-right">
          <div className="tab-group">
            {TABS.map(t => (
              <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t === 'live' && <span className="live-dot" />}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="range-group">
            {RANGES.map(r => (
              <button key={r.label} className={`range-btn ${range.label === r.label ? 'active' : ''}`} onClick={() => setRange(r)}>
                {r.label}
              </button>
            ))}
          </div>
          <button className="icon-btn" onClick={loadData} title="Refresh">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 8a6 6 0 0111.47-2.47M14 8a6 6 0 01-11.47 2.47" strokeLinecap="round" />
              <path d="M14 2v4h-4M2 14v-4h4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className="icon-btn" onClick={onLogout} title="Logout">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M14 8H6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      <main className="main">
        {loading && <div className="loading-bar" />}

        {/* ─── Overview Tab ─── */}
        {tab === 'overview' && (
          <div className="fade-in">
            {/* Stat cards */}
            <div className="stat-grid">
              <StatCard label="Sessions" value={stats.totalSessions ?? '—'} />
              <StatCard label="Page Views" value={stats.pageviews ?? '—'} />
              <StatCard label="Logged-in Users" value={stats.uniqueUsers ?? '—'} />
              <StatCard label="Avg Session" value={avgSession ? `${avgSession}s` : '—'} />
              <StatCard label="Total Events" value={stats.totalEvents ?? '—'} />
            </div>

            {/* Daily visitors chart */}
            <div className="card fade-in" style={{ animationDelay: '0.05s' }}>
              <div className="section-title">Daily Visitors</div>
              {daily.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={daily}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: 'var(--muted)' }}
                      itemStyle={{ color: 'var(--accent)' }}
                    />
                    <Line type="monotone" dataKey="visitors" stroke="var(--accent)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="empty">No visitor data yet</p>
              )}
            </div>

            {/* Filters + Clicks */}
            <div className="two-col fade-in" style={{ animationDelay: '0.1s' }}>
              <div className="card">
                <div className="section-title">Top Filters</div>
                {filters.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(200, filters.length * 28)}>
                    <BarChart data={filters} layout="vertical" margin={{ left: 100, right: 20 }}>
                      <CartesianGrid stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="filter" tick={{ fill: 'var(--text)', fontSize: 11 }} tickLine={false} axisLine={false} width={100} />
                      <Tooltip
                        contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: 'var(--muted)' }}
                        itemStyle={{ color: 'var(--accent2)' }}
                      />
                      <Bar dataKey="count" fill="var(--accent2)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="empty">No filter data yet</p>
                )}
              </div>

              <div className="card">
                <div className="section-title">Button Clicks</div>
                {clicks.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr><th>Button</th><th style={{ textAlign: 'right' }}>Count</th></tr>
                    </thead>
                    <tbody>
                      {clicks.map(c => (
                        <tr key={c.button}>
                          <td>{c.button}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span className="count-badge">{c.count}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="empty">No click data yet</p>
                )}
              </div>
            </div>

            {/* Most viewed properties */}
            <div className="card fade-in" style={{ animationDelay: '0.15s' }}>
              <div className="section-title">Most Viewed Properties</div>
              {properties.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr><th>#</th><th>Property Name</th><th style={{ textAlign: 'right' }}>Views</th><th style={{ textAlign: 'right' }}>Unique Viewers</th></tr>
                  </thead>
                  <tbody>
                    {properties.map((p, i) => (
                      <tr key={i}>
                        <td className="rank">{i + 1}</td>
                        <td>{p.property_name}</td>
                        <td style={{ textAlign: 'right' }}>{p.views}</td>
                        <td style={{ textAlign: 'right' }}>{p.viewers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty">No property view data yet</p>
              )}
            </div>
          </div>
        )}

        {/* ─── Users Tab ─── */}
        {tab === 'users' && (
          <div className="fade-in">
            <div className="card">
              <div className="section-title">Logged-in Users</div>
              {users.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr><th>Email</th><th style={{ textAlign: 'right' }}>Total Events</th><th>Most Viewed Property</th><th>Last Seen</th></tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.email}>
                        <td className="mono">{u.email}</td>
                        <td style={{ textAlign: 'right' }}>{u.events}</td>
                        <td>{u.topProperty || '—'}</td>
                        <td className="mono muted">{formatDate(u.lastSeen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty">No logged-in users yet</p>
              )}
            </div>
          </div>
        )}

        {/* ─── Live Tab ─── */}
        {tab === 'live' && (
          <div className="fade-in">
            <div className="card">
              <div className="section-title">
                <span className="live-dot" />
                Live Feed
              </div>
              {liveFeed.length > 0 ? (
                <div className="live-list">
                  {liveFeed.map(ev => {
                    const badge = EVENT_BADGE[ev.event_type] || EVENT_BADGE.session_end;
                    const preview = ev.event_data ? JSON.stringify(ev.event_data).slice(0, 80) : '';
                    return (
                      <div key={ev.id} className="live-row">
                        <span className="live-time mono">{formatTime(ev.created_at)}</span>
                        <span className="event-badge" style={{ background: badge.bg, color: badge.color }}>
                          {ev.event_type}
                        </span>
                        <span className="live-page">{ev.page || ''}</span>
                        {ev.property_name && <span className="live-prop">{ev.property_name}</span>}
                        {preview && <span className="live-data muted">{preview}</span>}
                        <span className="live-user mono">{ev.user_email || ev.session_id?.slice(0, 8)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="empty">No events yet</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="card stat-card fade-in">
      <div className="section-title">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
