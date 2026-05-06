/**
 * Blind Date - Main JavaScript (Supabase Version)
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Blind Date initialized with Supabase.");
    
    const db = window.supabaseClient;
    if (!db) {
        console.error("Supabase client not found.");
        return;
    }

    // --- Admin Credentials (Hardcoded for initial setup) ---
    const ADMIN_ID = "xodn9900";
    const ADMIN_PW = "dkvmflzk12!";

    // --- Login Handler ---
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const idInput = document.getElementById('username').value;
            const pwInput = document.getElementById('password').value;
            
            // 1. Check Hardcoded Admin
            if (idInput === ADMIN_ID && pwInput === ADMIN_PW) {
                alert("관리자 계정으로 로그인합니다.");
                sessionStorage.setItem('currentUser', JSON.stringify({ id: ADMIN_ID, role: 'admin' }));
                window.location.href = 'index.html'; 
                return;
            }

            // 2. Check Supabase DB
            const { data: user, error } = await db
                .from('users')
                .select('*')
                .eq('id', idInput)
                .eq('password', pwInput)
                .single();

            if (error || !user) {
                alert('아이디 또는 비밀번호가 올바르지 않습니다.');
                return;
            }

            if (user.status === 'pending') {
                alert('아직 승인 대기 중입니다. 지인 확인 후 승인해 드릴게요!');
                return;
            }

            alert(`${user.name}님, 환영합니다!`);
            sessionStorage.setItem('currentUser', JSON.stringify(user));
            // Redirect to main page (to be created)
            // window.location.href = 'main.html';
        });
    }

    // --- Signup Handler ---
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('signupId').value;
            const password = document.getElementById('signupPassword').value;
            const name = document.getElementById('signupName').value;
            const phone = document.getElementById('signupPhone').value;
            const referrer = document.getElementById('signupReferrer').value;
            
            // Check if ID already exists
            const { data: existing } = await db.from('users').select('id').eq('id', id).single();
            if (existing) {
                alert('이미 존재하는 아이디입니다.');
                return;
            }

            // Insert new user
            const { error } = await db.from('users').insert([{
                id,
                password,
                name,
                phone,
                referrer,
                role: 'user',
                status: 'pending',
                created_at: new Date().toISOString()
            }]);

            if (error) {
                alert('회원가입 처리 중 오류가 발생했습니다: ' + error.message);
            } else {
                alert(`${name}님, 회원가입 요청이 전송되었습니다.\n지인 확인 후 승인해 드릴 예정입니다.`);
                window.location.href = 'index.html';
            }
        });
    }

    // --- Subtle parallax effect ---
    document.addEventListener('mousemove', (e) => {
        const loginBox = document.querySelector('.login-box');
        if (!loginBox) return;
        const moveX = (window.innerWidth / 2 - e.pageX) / 50;
        const moveY = (window.innerHeight / 2 - e.pageY) / 50;
        loginBox.style.transform = `translate(${moveX}px, ${moveY}px)`;
    });
});
