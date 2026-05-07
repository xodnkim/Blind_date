// Supabase Configuration
const SUPABASE_URL = 'https://tgadwymewkfztonyjxur.supabase.co';
const SUPABASE_KEY = 'sb_publishable_t0OqQc9Rh1HI_A8gN8k8fg_I-Kl9j5Q';

// Telegram Configuration
window.TELEGRAM_TOKEN = '8600992125:AAGR36cuMHt7eycfPcVKGtinyqBva8O_AGo';
window.TELEGRAM_CHAT_ID = '5032978316';

try {
    if (typeof supabase !== 'undefined') {
        const { createClient } = supabase;
        window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('Supabase client initialized successfully.');
    } else {
        console.error('Supabase library not loaded from CDN.');
    }
} catch (e) {
    console.error('Error initializing Supabase client:', e);
}
