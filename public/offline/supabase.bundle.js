// Supabase bundle stub - dynamically loaded for optional cloud sync
// This file is a placeholder; the actual Supabase client is loaded on demand
export function createClient(url, key, opts) {
  console.warn('[offline/supabase.bundle] Supabase client stub loaded. Cloud sync unavailable in this build.');
  return {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: null, error: { message: 'Cloud sync not configured' } }),
      signUp: async () => ({ data: null, error: { message: 'Cloud sync not configured' } }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({ data: null, error: null }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ then: async (r) => { if (r) r({ data: [], error: null }); return { data: [], error: null }; } }) }) }),
      insert: () => ({ select: () => ({ single: () => ({ then: async (r) => { if (r) r({ data: null, error: { message: 'offline' } }); return { data: null, error: { message: 'offline' } }; } }) }) }),
      update: () => ({ eq: () => ({ then: async (r) => { if (r) r({ data: null, error: null }); return { data: null, error: null }; } }) }),
      delete: () => ({ eq: () => ({ then: async (r) => { if (r) r({ error: null }); return { error: null }; } }) }),
      upsert: async () => ({ error: null }),
    }),
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: { message: 'offline' } }),
        remove: async () => ({ error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: '' }, error: null }),
      }),
    },
  };
}
