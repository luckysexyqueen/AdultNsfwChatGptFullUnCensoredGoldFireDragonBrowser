// Data-only browser adapter. Plugin-provided code is never imported or evaluated.
export const LIMIT = 65536;
const secret = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|hf_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b)/;
export function safeText(value, max = 2000) {
  if (typeof value !== 'string' || value.length > max || secret.test(value)) throw new Error('Invalid or sensitive plugin text');
  return value;
}
export function normalizePlugin(raw) {
  if (!raw || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(raw.id)) throw new Error('Invalid plugin id');
  return Object.freeze({
    id: raw.id,
    name: safeText(raw.name, 160),
    version: safeText(raw.version, 80),
    description: safeText(raw.description),
    context: safeText(raw.context || '', 8000),
    // Only a reviewed adapter can opt in. Package metadata alone cannot activate prompts.
    autoEnable: raw.autoEnable === true && !!raw.context,
    capabilities: Object.freeze(raw.context ? ['catalog', 'prompt-context'] : ['catalog']),
  });
}
export function parseRegistry(value) {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.plugins) || value.plugins.length > 100) throw new Error('Unsupported plugin registry');
  const seen = new Set();
  const plugins = [];
  for (const raw of value.plugins) {
    try {
      const plugin = normalizePlugin(raw);
      if (seen.has(plugin.id)) continue;
      seen.add(plugin.id);
      plugins.push(plugin);
    } catch { /* A bad entry must not disable healthy plugins. */ }
  }
  return Object.freeze(plugins);
}
export function createManager(plugins, storage) {
  const preferences = new Map();
  for (const plugin of plugins) {
    let value;
    try { value = storage?.getItem(`gfd-plugin:${plugin.id}:${plugin.version}`); } catch { /* private browsing */ }
    preferences.set(plugin.id, value === '1' || (value !== '0' && plugin.autoEnable));
  }
  const list = () => plugins.map(p => ({ ...p, enabled: preferences.get(p.id) === true }));
  return Object.freeze({
    list,
    setEnabled(id, enabled) {
      const plugin = plugins.find(p => p.id === id);
      if (!plugin || !plugin.context || typeof enabled !== 'boolean') return false;
      preferences.set(id, enabled);
      try { storage?.setItem(`gfd-plugin:${id}:${plugin.version}`, enabled ? '1' : '0'); } catch { /* memory-only fallback */ }
      return true;
    },
    extendInstructions(instructions = '') {
      const contexts = list().filter(p => p.enabled && p.context).map(p => `[Website plugin: ${p.name}]\n${p.context}`);
      // Bound total context and never mutate/persist the conversation's original instructions.
      return [instructions, contexts.join('\n\n').slice(0, 16000)].filter(Boolean).join('\n\n');
    },
  });
}
export async function loadRegistry(url, { fetcher = fetch, storage, timeout = 4000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetcher(url, { signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
    if (!response.ok) throw new Error('Plugin registry unavailable');
    if (!/application\/json/i.test(response.headers.get('content-type') || '')) throw new Error('Plugin registry must be JSON');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT) { await reader.cancel(); throw new Error('Plugin registry too large'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return createManager(parseRegistry(JSON.parse(new TextDecoder().decode(bytes))), storage);
  } finally { clearTimeout(timer); }
}
