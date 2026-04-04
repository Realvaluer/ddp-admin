import { supabase } from './supabase';

const TABLE = 'DDP_analytics';

// Configurable exclude list — these emails (and their associated sessions) are filtered out everywhere
const EXCLUDED_EMAILS = [
  'saadumerani@gmail.com',
];

// Normalise for case-insensitive comparison
const EXCLUDED_SET = new Set(EXCLUDED_EMAILS.map(e => e.toLowerCase()));

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// Build a set of session_ids associated with excluded emails
function getExcludedSessions(rows) {
  const excludedSessions = new Set();
  for (const row of rows) {
    if (row.user_email && EXCLUDED_SET.has(row.user_email.toLowerCase())) {
      excludedSessions.add(row.session_id);
    }
  }
  return excludedSessions;
}

function isExcluded(row, excludedSessions) {
  if (row.user_email && EXCLUDED_SET.has(row.user_email.toLowerCase())) return true;
  if (excludedSessions.has(row.session_id)) return true;
  return false;
}

// Parse referrer URL into a readable source name
export function parseSource(referrer) {
  if (!referrer) return 'Direct';
  try {
    const url = new URL(referrer);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host.includes('google')) return 'Google';
    if (host.includes('instagram') || host === 'l.instagram.com') return 'Instagram';
    if (host.includes('facebook') || host === 'l.facebook.com' || host === 'm.facebook.com') return 'Facebook';
    if (host.includes('twitter') || host === 'x.com' || host === 't.co') return 'X (Twitter)';
    if (host.includes('linkedin')) return 'LinkedIn';
    if (host.includes('youtube')) return 'YouTube';
    if (host.includes('whatsapp') || host === 'wa.me') return 'WhatsApp';
    if (host.includes('tiktok')) return 'TikTok';
    if (host.includes('reddit')) return 'Reddit';
    if (host.includes('snapchat')) return 'Snapchat';
    if (host.includes('telegram') || host === 't.me') return 'Telegram';
    if (host.includes('bing')) return 'Bing';
    if (host.includes('yahoo')) return 'Yahoo';
    if (host.includes('dxbdipfinder') || host.includes('dxpdipfinder')) return 'Direct';

    return host;
  } catch {
    return 'Direct';
  }
}

export async function fetchOverviewStats(since) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('event_type, session_id, user_email, duration_ms')
    .gte('created_at', since);
  if (error) throw error;

  const excludedSessions = getExcludedSessions(data);
  const filtered = data.filter(r => !isExcluded(r, excludedSessions));

  const pageviews = filtered.filter(r => r.event_type === 'pageview');
  const uniqueVisits = new Set(filtered.map(r => r.session_id));

  // Unique visitors: deduplicate by email if logged in, otherwise by session_id
  const emailsSeen = new Set();
  const anonSessions = new Set();
  for (const r of filtered) {
    if (r.user_email) {
      emailsSeen.add(r.user_email.toLowerCase());
    } else {
      anonSessions.add(r.session_id);
    }
  }
  const emailSessionIds = new Set();
  for (const r of filtered) {
    if (r.user_email) emailSessionIds.add(r.session_id);
  }
  for (const sid of emailSessionIds) anonSessions.delete(sid);
  const uniqueVisitors = emailsSeen.size + anonSessions.size;

  const sessionEnds = filtered.filter(r => r.event_type === 'session_end' && r.duration_ms);
  const totalTimeMs = sessionEnds.reduce((sum, r) => sum + (r.duration_ms || 0), 0);
  const totalTimeHours = (totalTimeMs / 3600000).toFixed(1);

  return {
    uniqueVisits: uniqueVisits.size,
    uniqueVisitors,
    pageviews: pageviews.length,
    totalTimeHours,
    totalEvents: filtered.length,
  };
}

export async function fetchLiveUserCount() {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .select('session_id, user_email')
    .gte('created_at', fiveMinAgo);
  if (error) throw error;
  const excludedSessions = getExcludedSessions(data);
  const filtered = data.filter(r => !isExcluded(r, excludedSessions));
  const unique = new Set(filtered.map(r => r.session_id));
  return unique.size;
}

export async function fetchDailyVisitors(since) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('created_at, session_id, user_email, event_type')
    .eq('event_type', 'pageview')
    .gte('created_at', since)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const excludedSessions = getExcludedSessions(data);
  const filtered = data.filter(r => !isExcluded(r, excludedSessions));

  const byDay = {};
  const pagesByDay = {};
  for (const row of filtered) {
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

export async function fetchTopSources(since) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('session_id, user_email, referrer')
    .eq('event_type', 'pageview')
    .gte('created_at', since);
  if (error) throw error;

  const excludedSessions = getExcludedSessions(data);
  const filtered = data.filter(r => !isExcluded(r, excludedSessions));

  // Get first referrer per session (the entry point)
  const sessionSource = {};
  for (const row of filtered) {
    if (!sessionSource[row.session_id]) {
      sessionSource[row.session_id] = parseSource(row.referrer);
    }
  }

  // Count sessions per source
  const counts = {};
  for (const source of Object.values(sessionSource)) {
    counts[source] = (counts[source] || 0) + 1;
  }

  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([source, visits]) => ({ source, visits }));
}

export async function fetchTopProperties(since) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('property_id, property_name, user_email, session_id, event_data')
    .eq('event_type', 'property_view')
    .gte('created_at', since);
  if (error) throw error;

  const excludedSessions = getExcludedSessions(data);
  const filtered = data.filter(r => !isExcluded(r, excludedSessions));

  const grouped = {};
  for (const row of filtered) {
    const pid = row.property_id;
    if (!pid) continue;
    if (!grouped[pid]) grouped[pid] = {
      property_id: pid,
      property_name: row.property_name || pid,
      url: row.event_data?.url || null,
      price: row.event_data?.price || null,
      change_pct: row.event_data?.change_pct ?? null,
      community: row.event_data?.community || null,
      purpose: row.event_data?.purpose || null,
      ready_off_plan: row.event_data?.ready_off_plan || null,
      views: 0,
      viewers: new Set(),
    };
    grouped[pid].views++;
    if (row.user_email) grouped[pid].viewers.add(row.user_email);
    if (!grouped[pid].url && row.event_data?.url) grouped[pid].url = row.event_data.url;
    if (grouped[pid].price == null && row.event_data?.price) grouped[pid].price = row.event_data.price;
    if (grouped[pid].change_pct == null && row.event_data?.change_pct != null) grouped[pid].change_pct = row.event_data.change_pct;
    if (!grouped[pid].community && row.event_data?.community) grouped[pid].community = row.event_data.community;
    if (!grouped[pid].purpose && row.event_data?.purpose) grouped[pid].purpose = row.event_data.purpose;
    if (!grouped[pid].ready_off_plan && row.event_data?.ready_off_plan) grouped[pid].ready_off_plan = row.event_data.ready_off_plan;
  }

  const top = Object.values(grouped)
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const enrichResults = await Promise.allSettled(
    top.map(p =>
      fetch(`https://www.dxbdipfinder.com/api/listings/${p.property_id}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )
  );
  for (let i = 0; i < top.length; i++) {
    const l = enrichResults[i].status === 'fulfilled' ? enrichResults[i].value : null;
    if (!l) continue;
    const p = top[i];
    p.purpose = l.purpose || l.listing_type || p.purpose || null;
    p.ready_off_plan = l.ready_off_plan || p.ready_off_plan || null;
    if (p.price == null) p.price = l.price_aed || l.current_price || null;
    if (p.change_pct == null) p.change_pct = l.change_pct ?? l.dip_percent ?? null;
    if (!p.url) p.url = l.url || l.listing_url || null;
    if (!p.community) p.community = l.community || l.location || null;
    if (!p.property_name || p.property_name === p.property_id) p.property_name = l.property_name || l.community || p.property_name;
  }

  return top.map(r => ({
    property_id: r.property_id,
    property_name: r.property_name,
    url: r.url,
    price: r.price,
    change_pct: r.change_pct,
    ready_off_plan: r.ready_off_plan || null,
    purpose: r.purpose || null,
    views: r.views,
    viewers: r.viewers.size,
  }));
}

export async function fetchTopCommunities(since) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('property_id, event_data, user_email, session_id')
    .eq('event_type', 'property_view')
    .gte('created_at', since);
  if (error) throw error;

  const excludedSessions = getExcludedSessions(data);
  const filtered = data.filter(r => !isExcluded(r, excludedSessions));

  const missingCommunityIds = new Set();
  for (const row of filtered) {
    if (!row.event_data?.community && row.property_id) {
      missingCommunityIds.add(Number(row.property_id));
    }
  }

  const communityMap = {};
  if (missingCommunityIds.size > 0) {
    const ids = [...missingCommunityIds].filter(Boolean);
    const results = await Promise.allSettled(
      ids.map(id =>
        fetch(`https://www.dxbdipfinder.com/api/listings/${id}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    );
    for (let i = 0; i < ids.length; i++) {
      const l = results[i].status === 'fulfilled' ? results[i].value : null;
      if (l?.community) communityMap[String(ids[i])] = l.community;
    }
  }

  const grouped = {};
  for (const row of filtered) {
    const community = row.event_data?.community || communityMap[row.property_id] || null;
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
    .select('session_id, user_email, event_type, property_name, created_at, referrer')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const excludedSessions = getExcludedSessions(data);
  const filtered = data.filter(r => !isExcluded(r, excludedSessions));

  const visitors = {};
  for (const row of filtered) {
    const key = row.user_email || `session:${row.session_id}`;
    if (!visitors[key]) visitors[key] = {
      email: row.user_email || null,
      sessionId: row.session_id,
      events: 0,
      lastSeen: row.created_at,
      firstSource: parseSource(row.referrer),
      propertyCounts: {},
    };
    visitors[key].events++;
    visitors[key].lastSeen = row.created_at; // update to latest
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
        source: u.firstSource,
        topProperty: topProperty ? topProperty[0] : null,
      };
    });
}

export async function fetchMostActiveUsers(since) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('user_email, session_id, event_type, property_name, created_at, duration_ms, referrer')
    .gte('created_at', since)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const excludedSessions = getExcludedSessions(data);
  const filtered = data.filter(r => !isExcluded(r, excludedSessions));

  const users = {};
  for (const row of filtered) {
    const key = row.user_email || `session:${row.session_id}`;
    if (!users[key]) users[key] = {
      email: row.user_email || null,
      sessionId: row.session_id,
      events: 0,
      pageviews: 0,
      propertyViews: 0,
      totalTimeMs: 0,
      lastSeen: row.created_at,
      source: parseSource(row.referrer),
    };
    users[key].events++;
    users[key].lastSeen = row.created_at;
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
    .limit(100);
  if (error) throw error;

  const excludedSessions = getExcludedSessions(data);
  return data.filter(r => !isExcluded(r, excludedSessions)).slice(0, 50);
}
