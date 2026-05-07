/**
 * 비밀번호 마이그레이션 API - 기존 평문 비밀번호를 SHA-256 해시로 변환
 * 
 * 사용법: 브라우저에서 한 번만 호출
 *   POST /api/migrate_passwords
 *   Header: X-API-Key: bd_notify_2026_s3cr3t_k3y
 * 
 * ⚠️ 마이그레이션 완료 후 이 파일을 삭제하세요!
 */

export default async function handler(req, res) {
    // API Key 검증
    const NOTIFY_SECRET = process.env.NOTIFY_SECRET;
    if (NOTIFY_SECRET) {
        const apiKey = req.headers['x-api-key'];
        if (apiKey !== NOTIFY_SECRET) {
            return res.status(403).json({ error: 'Forbidden' });
        }
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tgadwymewkfztonyjxur.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

    if (!SUPABASE_KEY) {
        return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not configured' });
    }

    try {
        // 1. Fetch all users
        const fetchRes = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id,password`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        const users = await fetchRes.json();

        if (!Array.isArray(users)) {
            return res.status(500).json({ error: 'Failed to fetch users', detail: users });
        }

        let migrated = 0;
        let skipped = 0;

        for (const user of users) {
            // SHA-256 해시는 64자 hex 문자열 → 이미 해시되었으면 건너뜀
            if (user.password && user.password.length === 64 && /^[0-9a-f]+$/.test(user.password)) {
                skipped++;
                continue;
            }

            // SHA-256 해싱
            const encoder = new TextEncoder();
            const data = encoder.encode(user.password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashedPassword = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            // Update in DB
            const updateRes = await fetch(
                `${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(user.id)}`,
                {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({ password: hashedPassword })
                }
            );

            if (updateRes.ok) {
                migrated++;
            } else {
                console.error(`Failed to update user ${user.id}:`, await updateRes.text());
            }
        }

        return res.status(200).json({
            success: true,
            message: `Migration complete. Migrated: ${migrated}, Skipped (already hashed): ${skipped}`
        });
    } catch (err) {
        console.error('Migration error:', err);
        return res.status(500).json({ error: err.message });
    }
}
