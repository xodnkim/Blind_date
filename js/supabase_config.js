// Supabase Configuration
const SUPABASE_URL = 'https://tgadwymewkfztonyjxur.supabase.co';
const SUPABASE_KEY = 'sb_publishable_t0OqQc9Rh1HI_A8gN8k8fg_I-Kl9j5Q';

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

window.supabaseClient = _supabase;
