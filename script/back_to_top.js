// Back to Top functionality
document.addEventListener('DOMContentLoaded', () => {
    const backToTopBtn = document.createElement('button');
    backToTopBtn.innerHTML = '▲';
    backToTopBtn.className = 'back-to-top';
    backToTopBtn.id = 'backToTopBtn';
    document.body.appendChild(backToTopBtn);

    window.addEventListener('scroll', () => {
        if (window.scrollY > 80) {
            backToTopBtn.classList.add('show');
        } else {
            backToTopBtn.classList.remove('show');
        }
    });

    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
});
