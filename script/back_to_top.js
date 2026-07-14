// Back to Top functionality
document.addEventListener('DOMContentLoaded', () => {
    const backToTopBtn = document.createElement('button');
    backToTopBtn.textContent = '▲';
    backToTopBtn.className = 'back-to-top';
    backToTopBtn.id = 'backToTopBtn';
    backToTopBtn.type = 'button';
    backToTopBtn.setAttribute('aria-label', '回到頁面頂端');
    backToTopBtn.title = '回到頁面頂端';
    document.body.appendChild(backToTopBtn);

    window.addEventListener('scroll', () => {
        if (window.scrollY > 80) {
            backToTopBtn.classList.add('show');
        } else {
            backToTopBtn.classList.remove('show');
        }
    }, { passive: true });

    backToTopBtn.addEventListener('click', () => {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        window.scrollTo({
            top: 0,
            behavior: reduceMotion ? 'auto' : 'smooth'
        });
    });
});
