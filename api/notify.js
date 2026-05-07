/**
 * Vercel Serverless Function: /api/notify
 * 텔레그램 알림을 서버 사이드에서 처리 (봇 토큰 클라이언트 미노출)
 *
 * 보안:
 *   - X-API-Key 비밀 헤더 검증 (필수)
 *   - Origin 검증 (허용된 도메인만)
 *   - 메시지 길이 제한 (1000자)
 *   - IP 기반 Rate Limiting (분당 5회)
 */

// 간단한 메모리 기반 Rate Limiter
const rateLimitMap = new Map();
const RATE_LIMIT = 5;
const RATE_WINDOW = 60000; // 1분

function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, start: now };

    if (now - entry.start > RATE_WINDOW) {
        rateLimitMap.set(ip, { count: 1, start: now });
        return false;
    }
    if (entry.count >= RATE_LIMIT) return true;

    entry.count++;
    rateLimitMap.set(ip, entry);
    return false;
}

// 허용할 도메인 목록
const ALLOWED_ORIGINS = [
    'https://meeting-sable-chi.vercel.app',
    'http://localhost',
    'http://127.0.0.1'
];

export default async function handler(req, res) {
    // 1. API Key 검증 (필수 - 외부 호출 차단)
    const NOTIFY_SECRET = process.env.NOTIFY_SECRET;
    if (NOTIFY_SECRET) {
        const apiKey = req.headers['x-api-key'];
        if (apiKey !== NOTIFY_SECRET) {
            return res.status(403).json({ error: 'Forbidden: invalid API key' });
        }
    }

    // 2. Origin 검증
    const origin = req.headers['origin'] || req.headers['referer'] || '';
    const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));

    if (!isAllowed) {
        return res.status(403).json({ error: 'Forbidden: invalid origin' });
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Rate Limiting
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
    if (isRateLimited(ip)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    // 메시지 길이 제한 (1000자)
    if (message.length > 1000) {
        return res.status(400).json({ error: 'Message too long (max 1000 chars)' });
    }

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: message,
                    parse_mode: 'HTML'
                })
            }
        );

        const data = await response.json();
        if (!data.ok) return res.status(500).json({ error: data.description });

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('Telegram send error:', err);
        return res.status(500).json({ error: 'Failed to send notification' });
    }
}
