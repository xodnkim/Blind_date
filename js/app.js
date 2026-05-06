/**
 * Blind Date - Main JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log("Blind Date initialized.");

    // --- Admin Credentials ---
    const ADMIN_ID = "xodn9900";
    const ADMIN_PW = "dkvmflzk12!";

    // --- Login Handler ---
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('username').value;
            const pw = document.getElementById('password').value;
            
            if (id === ADMIN_ID && pw === ADMIN_PW) {
                alert("관리자 계정으로 로그인합니다.");
                // Store admin session
                sessionStorage.setItem('isAdmin', 'true');
                // Redirect to admin dashboard (to be created or just a placeholder)
                window.location.href = 'index.html'; // For now back to index, or we could create admin.html
            } else {
                alert(`${id}님, 환영합니다! 회원 승인 대기 중입니다.`);
            }
        });
    }

    // --- Signup Handler ---
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('signupId').value;
            const phone = document.getElementById('signupPhone').value;
            const referrer = document.getElementById('signupReferrer').value;
            
            console.log("Signup Request:", { id, phone, referrer });
            
            alert(`${id}님, 회원가입 요청이 전송되었습니다.\n추천인(${referrer}) 확인 후 관리자가 승인해드릴 예정입니다.`);
            window.location.href = 'index.html';
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
