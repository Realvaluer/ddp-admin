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

  // Get top 10 by views
  const top = Object.values(grouped)
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  // Enrich missing data — try Supabase first, then fallback to main app API
  const needEnrich = top.filter(p => !p.purpose || !p.ready_off_plan || p.price == null || !p.url);
  if (needEnrich.length > 0) {
    const ids = needEnrich.map(p => Number(p.property_id)).filter(Boolean);

    // Try Supabase ddf_listings
    let listingMap = {};
    if (ids.length > 0) {
      try {
        const { data: listings, error: listErr } = await supabase
          .from('ddf_listings')
          .select('id, property_name, community, price_aed, change_pct, url, ready_off_plan, purpose')
          .or(ids.map(id => `id.eq.${id}`).join(','));
        if (listErr) console.warn('Supabase listings query failed:', listErr.message);
        if (listings && listings.length > 0) {
          for (const l of listings) listingMap[String(l.id)] = l;
        }
      } catch (e) {
        console.warn('Supabase listings error:', e);
      }
    }

    // Fallback: fetch from main app API for any still missing
    const stillMissing = needEnrich.filter(p => !listingMap[p.property_id]);
    if (stillMissing.length > 0) {
      for (const p of stillMissing) {
        try {
          const res = await fetch(`https://www.dxbdipfinder.com/api/listings/${p.property_id}`);
          if (res.ok) {
            const l = await res.json();
            listingMap[p.property_id] = {
              id: l.id,
              property_name: l.property_name,
              community: l.community,
              price_aed: l.price_aed,
              change_pct: l.change_pct,
              url: l.url,
              ready_off_plan: l.ready_off_plan,
              purpose: l.purpose,
            };
          }
        } catch {}
      }
    }

    // Apply enrichment
    for (const p of top) {
      const l = listingMap[p.property_id];
      if (!l) continue;
      if (p.price == null) p.price = l.price_aed;
      if (p.change_pct == null) p.change_pct = l.change_pct;
      if (!p.url) p.url = l.url;
      if (!p.community) p.community = l.community;
      if (!p.property_name || p.property_name === p.property_id) p.property_name = l.property_name || l.community;
      if (!p.ready_off_plan) p.ready_off_plan = l.ready_off_plan || null;
      if (!p.purpose) p.purpose = l.purpose || null;
    }
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
    .select('property_id, event_data, user_email')
    .eq('event_type', 'property_view')
    .gte('created_at', since);
  if (error) throw error;

  // Collect property IDs that have no community in event_data
  const missingCommunityIds = new Set();
  for (const row of data) {
    if (!row.event_data?.community && row.property_id) {
      missingCommunityIds.add(Number(row.property_id));
    }
  }

  // Enrich from listings table
  const communityMap = {};
  if (missingCommunityIds.size > 0) {
    const ids = [...missingCommunityIds].filter(Boolean);
    if (ids.length > 0) {
      const { data: listings } = await supabase
        .from('ddf_listings')
        .select('id, community')
        .or(ids.map(id => `id.eq.${id}`).join(','));
      if (listings) {
        for (const l of listings) communityMap[String(l.id)] = l.community;
      }
    }
  }

  const grouped = {};
  for (const row of data) {
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
