/**
 * Vercel Serverless Function: /api/notify
 * 텔레그램 알림을 서버 사이드에서 처리하여 봇 토큰을 클라이언트에 노출하지 않습니다.
 * 
 * Vercel 대시보드에서 환경변수 설정 필요:
 *   TELEGRAM_TOKEN  = 봇 토큰
 *   TELEGRAM_CHAT_ID = 채팅 ID
 */

export default async function handler(req, res) {
    // CORS 허용 (본인 도메인만 허용하도록 변경 권장)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
        console.error('Telegram env variables not set.');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'message is required' });
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
        if (!data.ok) {
            return res.status(500).json({ error: data.description });
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('Telegram send error:', err);
        return res.status(500).json({ error: 'Failed to send notification' });
    }
}
