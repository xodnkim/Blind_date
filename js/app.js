/**
 * Blind Date - Main JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log("Blind Date initialized.");

    // Simple reveal animation for hero elements
    const heroTitle = document.querySelector('.hero-title');
    const heroDesc = document.querySelector('.hero-desc');
    const ctaGroup = document.querySelector('.cta-group');
    const heroVisual = document.querySelector('.hero-visual');

    if (heroTitle) {
        heroTitle.style.opacity = '0';
        heroTitle.style.transform = 'translateY(30px)';
        heroTitle.style.transition = 'all 0.8s ease-out';
    }
    
    if (heroDesc) {
        heroDesc.style.opacity = '0';
        heroDesc.style.transform = 'translateY(30px)';
        heroDesc.style.transition = 'all 0.8s ease-out 0.2s';
    }

    if (ctaGroup) {
        ctaGroup.style.opacity = '0';
        ctaGroup.style.transform = 'translateY(30px)';
        ctaGroup.style.transition = 'all 0.8s ease-out 0.4s';
    }

    // Trigger animations
    setTimeout(() => {
        if (heroTitle) {
            heroTitle.style.opacity = '1';
            heroTitle.style.transform = 'translateY(0)';
        }
        if (heroDesc) {
            heroDesc.style.opacity = '1';
            heroDesc.style.transform = 'translateY(0)';
        }
        if (ctaGroup) {
            ctaGroup.style.opacity = '1';
            ctaGroup.style.transform = 'translateY(0)';
        }
    }, 100);

    // Mouse parallax effect for the main card
    document.addEventListener('mousemove', (e) => {
        if (!heroVisual) return;
        const xAxis = (window.innerWidth / 2 - e.pageX) / 25;
        const yAxis = (window.innerHeight / 2 - e.pageY) / 25;
        const card = heroVisual.querySelector('.main-card');
        if (card) {
            card.style.transform = `rotateY(${xAxis}deg) rotateX(${yAxis}deg)`;
        }
    });
});
