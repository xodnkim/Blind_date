/**
 * Blind Date - Main JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log("Blind Date initialized.");

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('username').value;
            alert(`${id}님, 환영합니다! 곧 서비스가 시작됩니다.`);
        });
    }

    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('signupId').value;
            alert(`${id}님, 회원가입 요청이 전송되었습니다. 관리자 승인을 기다려주세요.`);
            window.location.href = 'index.html';
        });
    }

    // Add a subtle parallax effect to the login box
    document.addEventListener('mousemove', (e) => {
        const loginBox = document.querySelector('.login-box');
        if (!loginBox) return;

        const moveX = (window.innerWidth / 2 - e.pageX) / 50;
        const moveY = (window.innerHeight / 2 - e.pageY) / 50;

        loginBox.style.transform = `translate(${moveX}px, ${moveY}px)`;
    });
});
