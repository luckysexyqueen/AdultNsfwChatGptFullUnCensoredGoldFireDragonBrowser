import { createClient } from '@supabase/supabase-js';

const runtimeEnv = (globalThis as typeof globalThis & {
  __ENV__?: {
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
  };
}).__ENV__;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || runtimeEnv?.SUPABASE_URL || 'https://offline.invalid';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || runtimeEnv?.SUPABASE_ANON_KEY || 'offline-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
