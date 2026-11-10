// Japan search suggestions through a fixed upstream. This is not an open URL proxy.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q || q.length > 180) return res.status(400).json({ error: 'Search query must be 1–180 characters' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = new URL('https://suggestqueries.google.com/complete/search');
    url.search = new URLSearchParams({ client: 'firefox', q, hl: 'ko', gl: 'jp' }).toString();
    const upstream = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'GoldFireDragonBrowser/1.3.5.9' } });
    if (!upstream.ok) throw new Error('Search upstream unavailable');
    const payload = await upstream.json();
    const suggestions = Array.isArray(payload?.[1]) ? payload[1].filter(v => typeof v === 'string').slice(0, 10) : [];
    return res.status(200).json({ query: q, suggestions, searchUrl: 'https://www.google.co.jp/search?' + new URLSearchParams({ q, gl: 'jp', hl: 'ko', safe: 'off' }), executionRegion: process.env.VERCEL_REGION || null, japaneseEgressVerified: false });
  } catch (error) {
    return res.status(502).json({ error: 'Japan search upstream request failed' });
  } finally { clearTimeout(timer); }
}
