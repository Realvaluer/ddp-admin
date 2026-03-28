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
    .select('event_type, session_id, user_email, duration_ms')
    .gte('created_at', since);
  if (error) throw error;

  const pageviews = data.filter(r => r.event_type === 'pageview');
  const uniqueVisitors = new Set(data.map(r => r.session_id));
  const sessionEnds = data.filter(r => r.event_type === 'session_end' && r.duration_ms);
  const totalTimeMs = sessionEnds.reduce((sum, r) => sum + (r.duration_ms || 0), 0);
  const totalTimeHours = (totalTimeMs / 3600000).toFixed(1);

  return {
    uniqueVisitors: uniqueVisitors.size,
    pageviews: pageviews.length,
    totalTimeHours,
    totalEvents: data.length,
  };
}

export async function fetchLiveUserCount() {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .select('session_id')
    .gte('created_at', fiveMinAgo);
  if (error) throw error;
  const unique = new Set(data.map(r => r.session_id));
  return unique.size;
}

export async function fetchDailyVisitors(since) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('created_at, session_id, event_type')
    .eq('event_type', 'pageview')
    .gte('created_at', since)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const byDay = {};
  const pagesByDay = {};
  for (const row of data) {
    const date = new Date(row.created_at);
    const key = date.toISOString().slice(0, 10);
    if (!byDay[key]) byDay[key] = new Set();
    byDay[key].add(row.session_id);
    pagesByDay[key] = (pagesByDay[key] || 0) + 1;
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, sessions]) => {
      const d = new Date(key + 'T00:00:00');
      return {
        date: `${d.getDate()} ${months[d.getMonth()]}`,
        visitors: sessions.size,
        pages: pagesByDay[key] || 0,
      };
    });
}

export async function fetchTopProperties(since) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('property_id, property_name, user_email, event_data')
    .eq('event_type', 'property_view')
    .gte('created_at', since);
  if (error) throw error;

  const grouped = {};
  for (const row of data) {
    const pid = row.property_id;
    if (!pid) continue;
    if (!grouped[pid]) grouped[pid] = {
      property_id: pid,
      property_name: row.property_name || pid,
      url: row.event_data?.url || null,
      price: row.event_data?.price || null,
      change_pct: row.event_data?.change_pct ?? null,
      views: 0,
      viewers: new Set(),
    };
    grouped[pid].views++;
    if (row.user_email) grouped[pid].viewers.add(row.user_email);
    if (!grouped[pid].url && row.event_data?.url) grouped[pid].url = row.event_data.url;
    if (grouped[pid].price == null && row.event_data?.price) grouped[pid].price = row.event_data.price;
    if (grouped[pid].change_pct == null && row.event_data?.change_pct != null) grouped[pid].change_pct = row.event_data.change_pct;
  }

  return Object.values(grouped)
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)
    .map(r => ({
      property_id: r.property_id,
      property_name: r.property_name,
      url: r.url,
      price: r.price,
      change_pct: r.change_pct,
      views: r.views,
      viewers: r.viewers.size,
    }));
}

export async function fetchTopCommunities(since) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('event_data, user_email')
    .eq('event_type', 'property_view')
    .gte('created_at', since);
  if (error) throw error;

  const grouped = {};
  for (const row of data) {
    const community = row.event_data?.community;
    if (!community) continue;
    if (!grouped[community]) grouped[community] = { community, views: 0, viewers: new Set() };
    grouped[community].views++;
    if (row.user_email) grouped[community].viewers.add(row.user_email);
  }

  return Object.values(grouped)
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)
    .map(r => ({ community: r.community, views: r.views, viewers: r.viewers.size }));
}

export async function fetchUsers() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('session_id, user_email, event_type, property_name, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const visitors = {};
  for (const row of data) {
    const key = row.user_email || `session:${row.session_id}`;
    if (!visitors[key]) visitors[key] = {
      email: row.user_email || null,
      sessionId: row.session_id,
      events: 0,
      lastSeen: row.created_at,
      propertyCounts: {},
    };
    visitors[key].events++;
    if (row.property_name) {
      visitors[key].propertyCounts[row.property_name] = (visitors[key].propertyCounts[row.property_name] || 0) + 1;
    }
  }

  return Object.values(visitors)
    .sort((a, b) => b.events - a.events)
    .map(u => {
      const topProperty = Object.entries(u.propertyCounts).sort(([, a], [, b]) => b - a)[0];
      return {
        email: u.email,
        sessionId: u.sessionId,
        events: u.events,
        lastSeen: u.lastSeen,
        topProperty: topProperty ? topProperty[0] : null,
      };
    });
}

export async function fetchMostActiveUsers(since) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('user_email, session_id, event_type, property_name, created_at, duration_ms')
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const users = {};
  for (const row of data) {
    const key = row.user_email || `session:${row.session_id}`;
    if (!users[key]) users[key] = {
      email: row.user_email || null,
      sessionId: row.session_id,
      events: 0,
      pageviews: 0,
      propertyViews: 0,
      totalTimeMs: 0,
      lastSeen: row.created_at,
    };
    users[key].events++;
    if (row.event_type === 'pageview') users[key].pageviews++;
    if (row.event_type === 'property_view') users[key].propertyViews++;
    if (row.event_type === 'session_end' && row.duration_ms) users[key].totalTimeMs += row.duration_ms;
  }

  return Object.values(users)
    .sort((a, b) => b.events - a.events)
    .slice(0, 10)
    .map(u => ({
      ...u,
      totalTimeMins: Math.round(u.totalTimeMs / 60000),
    }));
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
