import { useState, useEffect, useCallback, useRef } from 'react';
import { BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart } from 'recharts';
import {
  daysAgo,
  fetchOverviewStats,
  fetchLiveUserCount,
  fetchDailyVisitors,
  fetchTopProperties,
  fetchTopCommunities,
  fetchUsers,
  fetchMostActiveUsers,
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
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatPrice(aed) {
  if (!aed) return '—';
  if (aed >= 1000000) return `AED ${(aed / 1000000).toFixed(2)}M`;
  if (aed >= 1000) return `AED ${(aed / 1000).toFixed(0)}K`;
  return `AED ${aed.toLocaleString()}`;
}

export default function Dashboard({ onLogout }) {
  const [range, setRange] = useState(RANGES[0]);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});
  const [liveFeed, setLiveFeed] = useState([]);
  const [liveUsers, setLiveUsers] = useState(0);
  const liveInterval = useRef(null);
  const liveUserInterval = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const since = daysAgo(range.days);
      const [stats, liveCount, daily, properties, communities, users, activeUsers] = await Promise.all([
        fetchOverviewStats(since),
        fetchLiveUserCount(),
        fetchDailyVisitors(since),
        fetchTopProperties(since),
        fetchTopCommunities(since),
        fetchUsers(),
        fetchMostActiveUsers(since),
      ]);
      setLiveUsers(liveCount);
      setData({ stats, daily, properties, communities, users, activeUsers });
    } catch (err) {
      console.error('Failed to load dashboard data:', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { loadData(); }, [loadData]);

  // Live user count polling
  useEffect(() => {
    const poll = async () => {
      try { setLiveUsers(await fetchLiveUserCount()); } catch {}
    };
    liveUserInterval.current = setInterval(poll, 30000);
    return () => clearInterval(liveUserInterval.current);
  }, []);

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

  const { stats = {}, daily = [], properties = [], communities = [], users = [], activeUsers = [] } = data;

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
            {/* KPI cards */}
            <div className="stat-grid">
              <StatCard label="Live Now" value={liveUsers} accent="var(--red)" pulse />
              <StatCard label="Unique Visitors" value={stats.uniqueVisitors ?? '—'} />
              <StatCard label="Pages Viewed" value={stats.pageviews ?? '—'} />
              <StatCard label="Total Time Spent" value={stats.totalTimeHours ? `${stats.totalTimeHours}h` : '—'} />
            </div>

            {/* Daily visitors + pages chart */}
            <div className="card fade-in" style={{ animationDelay: '0.05s' }}>
              <div className="section-title">Daily Activity</div>
              {daily.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={daily}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: 'var(--muted)' }}
                    />
                    <Bar yAxisId="left" dataKey="visitors" fill="var(--accent)" opacity={0.3} radius={[4, 4, 0, 0]} name="Unique Visitors" />
                    <Line yAxisId="right" type="monotone" dataKey="pages" stroke="var(--accent2)" strokeWidth={2} dot={false} name="Pages Viewed" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <p className="empty">No visitor data yet</p>
              )}
            </div>

            {/* Top 10 Users */}
            <div className="card fade-in" style={{ animationDelay: '0.08s' }}>
              <div className="section-title">Top 10 Users</div>
              {activeUsers.length > 0 ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>User</th>
                        <th className="hide-mobile" style={{ textAlign: 'right' }}>Page Views</th>
                        <th className="hide-mobile" style={{ textAlign: 'right' }}>Properties</th>
                        <th style={{ textAlign: 'right' }}>Events</th>
                        <th className="hide-mobile" style={{ textAlign: 'right' }}>Time</th>
                        <th>Last Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeUsers.map((u, i) => (
                        <tr key={u.email || u.sessionId || i}>
                          <td className="rank">{i + 1}</td>
                          <td className="mono">{u.email || <span className="muted">{u.sessionId?.slice(0, 10)}...</span>}</td>
                          <td className="hide-mobile" style={{ textAlign: 'right' }}>{u.pageviews}</td>
                          <td className="hide-mobile" style={{ textAlign: 'right' }}>{u.propertyViews}</td>
                          <td style={{ textAlign: 'right' }}><span className="count-badge">{u.events}</span></td>
                          <td className="hide-mobile" style={{ textAlign: 'right' }}>{u.totalTimeMins > 0 ? `${u.totalTimeMins}m` : '—'}</td>
                          <td className="mono muted" style={{ fontSize: '0.7rem' }}>{formatDate(u.lastSeen)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty">No user data yet</p>
              )}
            </div>

            {/* Top 10 Communities */}
            <div className="card fade-in" style={{ animationDelay: '0.1s' }}>
              <div className="section-title">Top 10 Communities</div>
              {communities.length > 0 ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr><th>#</th><th>Community</th><th style={{ textAlign: 'right' }}>Views</th><th style={{ textAlign: 'right' }}>Unique Viewers</th></tr>
                    </thead>
                    <tbody>
                      {communities.map((c, i) => (
                        <tr key={i}>
                          <td className="rank">{i + 1}</td>
                          <td>{c.community}</td>
                          <td style={{ textAlign: 'right' }}>{c.views}</td>
                          <td style={{ textAlign: 'right' }}>{c.viewers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty">No community data yet — view some properties to populate</p>
              )}
            </div>

            {/* Top 10 Properties */}
            <div className="card fade-in" style={{ animationDelay: '0.12s' }}>
              <div className="section-title">Top 10 Properties</div>
              {properties.length > 0 ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Property</th>
                        <th style={{ textAlign: 'right' }}>Price</th>
                        <th style={{ textAlign: 'right' }}>Dip %</th>
                        <th style={{ textAlign: 'right' }}>Views</th>
                        <th className="hide-mobile" style={{ textAlign: 'right' }}>Viewers</th>
                        <th>Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {properties.map((p, i) => {
                        const purposeLabel = (p.purpose?.toLowerCase() === 'rent' || p.purpose?.toLowerCase() === 'for rent') ? 'Rent' : 'Sale';
                        const readyLabel = (p.ready_off_plan === 'off_plan' || p.ready_off_plan === 'Off Plan') ? 'Off Plan' : null;
                        return (
                        <tr key={i}>
                          <td className="rank">{i + 1}</td>
                          <td>
                            <span className="prop-name-row">
                              <a href={`https://dxbdipfinder.com/listing/${p.property_id}`} target="_blank" rel="noopener noreferrer" className="prop-link">
                                {p.property_name}
                              </a>
                              {readyLabel && <span className="prop-tag tag-offplan">{readyLabel}</span>}
                              {!readyLabel && <span className="prop-tag tag-ready">Ready</span>}
                              <span className={`prop-tag ${purposeLabel === 'Rent' ? 'tag-rent' : 'tag-sale'}`}>{purposeLabel}</span>
                            </span>
                          </td>
                          <td className="mono" style={{ textAlign: 'right', fontSize: '0.75rem' }}>
                            {formatPrice(p.price)}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {p.change_pct != null ? (
                              <span className={`dip-badge ${p.change_pct < 0 ? 'dip-neg' : 'dip-pos'}`}>
                                {p.change_pct < 0 ? '' : '+'}{Number(p.change_pct).toFixed(1)}%
                              </span>
                            ) : '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}>{p.views}</td>
                          <td className="hide-mobile" style={{ textAlign: 'right' }}>{p.viewers}</td>
                          <td>
                            <a href={p.url || `https://dxbdipfinder.com/listing/${p.property_id}`} target="_blank" rel="noopener noreferrer" className="ext-link" title={p.url ? 'View on source' : 'View on DxbDipFinder'}>
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M12 9v4a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1h4M9 2h5v5M6 10l8-8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </a>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
              <div className="section-title">All Visitors</div>
              {users.length > 0 ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr><th>User</th><th style={{ textAlign: 'right' }}>Total Events</th><th className="hide-mobile">Most Viewed Property</th><th>Last Seen</th></tr>
                    </thead>
                    <tbody>
                      {users.map((u, i) => (
                        <tr key={u.email || u.sessionId || i}>
                          <td className="mono">{u.email || <span className="muted">{u.sessionId?.slice(0, 12)}...</span>}</td>
                          <td style={{ textAlign: 'right' }}>{u.events}</td>
                          <td className="hide-mobile">{u.topProperty || '—'}</td>
                          <td className="mono muted" style={{ fontSize: '0.7rem' }}>{formatDate(u.lastSeen)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty">No visitors yet</p>
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
                <span className="live-count">{liveUsers} online</span>
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
                          {ev.event_type.replace('_', ' ')}
                        </span>
                        <span className="live-page">{ev.page || ''}</span>
                        {ev.property_name && <span className="live-prop">{ev.property_name}</span>}
                        <span className="live-data muted hide-mobile">{preview}</span>
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

function StatCard({ label, value, accent, pulse }) {
  return (
    <div className="card stat-card fade-in">
      <div className="section-title">{label}</div>
      <div className="stat-value" style={accent ? { color: accent } : undefined}>
        {pulse && value > 0 && <span className="live-dot" style={{ marginRight: 8, width: 10, height: 10 }} />}
        {value}
      </div>
    </div>
  );
}
