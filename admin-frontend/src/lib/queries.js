import { supabase } from './supabase';

const TABLE = 'DDP_analytics';

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function fetchOverviewStats(since) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('event_type, session_id, user_email')
    .gte('created_at', since);
  if (error) throw error;

  const pageviews = data.filter(r => r.event_type === 'pageview');
  const sessionIds = new Set(pageviews.map(r => r.session_id));
  const emails = new Set(data.filter(r => r.user_email).map(r => r.user_email));

  return {
    totalSessions: sessionIds.size,
    uniqueUsers: emails.size,
    pageviews: pageviews.length,
    totalEvents: data.length,
  };
}

export async function fetchAvgSession(since) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('duration_ms')
    .eq('event_type', 'session_end')
    .gte('created_at', since);
  if (error) throw error;
  if (!data.length) return 0;

  const total = data.reduce((sum, r) => sum + (r.duration_ms || 0), 0);
  return Math.round(total / data.length / 1000);
}

export async function fetchDailyVisitors(since) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('created_at, session_id')
    .eq('event_type', 'pageview')
    .gte('created_at', since)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const byDay = {};
  for (const row of data) {
    const date = new Date(row.created_at);
    const key = date.toISOString().slice(0, 10);
    if (!byDay[key]) byDay[key] = new Set();
    byDay[key].add(row.session_id);
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, sessions]) => {
      const d = new Date(key + 'T00:00:00');
      return { date: `${d.getDate()} ${months[d.getMonth()]}`, visitors: sessions.size };
    });
}

export async function fetchTopFilters(since) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('event_data')
    .eq('event_type', 'filter')
    .gte('created_at', since);
  if (error) throw error;

  const counts = {};
  for (const row of data) {
    const ed = row.event_data;
    if (!ed || typeof ed !== 'object') continue;
    for (const [key, val] of Object.entries(ed)) {
      if (val == null || val === '' || val === 'any') continue;
      const label = `${key}: ${val}`;
      counts[label] = (counts[label] || 0) + 1;
    }
  }

  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([filter, count]) => ({ filter, count }));
}

export async function fetchTopProperties(since) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('property_id, property_name, user_email')
    .eq('event_type', 'property_view')
    .gte('created_at', since);
  if (error) throw error;

  const grouped = {};
  for (const row of data) {
    const pid = row.property_id;
    if (!pid) continue;
    if (!grouped[pid]) grouped[pid] = { property_name: row.property_name || pid, views: 0, viewers: new Set() };
    grouped[pid].views++;
    if (row.user_email) grouped[pid].viewers.add(row.user_email);
  }

  return Object.values(grouped)
    .sort((a, b) => b.views - a.views)
    .slice(0, 20)
    .map(r => ({ property_name: r.property_name, views: r.views, viewers: r.viewers.size }));
}

export async function fetchTopClicks(since) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('event_data')
    .eq('event_type', 'click')
    .gte('created_at', since);
  if (error) throw error;

  const counts = {};
  for (const row of data) {
    const button = row.event_data?.button;
    if (!button) continue;
    counts[button] = (counts[button] || 0) + 1;
  }

  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([button, count]) => ({ button, count }));
}

export async function fetchUsers() {
  // Fetch ALL users ever — no date filter
  const { data, error } = await supabase
    .from(TABLE)
    .select('user_email, event_type, property_name, created_at')
    .not('user_email', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const users = {};
  for (const row of data) {
    const email = row.user_email;
    if (!users[email]) users[email] = { email, events: 0, lastSeen: row.created_at, propertyCounts: {} };
    users[email].events++;
    if (row.property_name) {
      users[email].propertyCounts[row.property_name] = (users[email].propertyCounts[row.property_name] || 0) + 1;
    }
  }

  return Object.values(users)
    .sort((a, b) => b.events - a.events)
    .map(u => {
      const topProperty = Object.entries(u.propertyCounts).sort(([, a], [, b]) => b - a)[0];
      return {
        email: u.email,
        events: u.events,
        lastSeen: u.lastSeen,
        topProperty: topProperty ? topProperty[0] : null,
      };
    });
}

export async function fetchLiveFeed() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}
