// Supabase Configuration
const SUPABASE_URL = 'https://tgadwymewkfztonyjxur.supabase.co';
const SUPABASE_KEY = 'sb_publishable_t0OqQc9Rh1HI_A8gN8k8fg_I-Kl9j5Q';

// Telegram 설정은 서버 환경변수에서 관리됩니다. (api/notify.js 참고)

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
