document.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => {
        const src = card.getAttribute('data-preview');
        const modal = document.getElementById('previewModal');
        const img = document.getElementById('previewImg');
        img.src = src;
        modal.classList.add('active');
    });
});

document.getElementById('closePreview').addEventListener('click', () => {
    document.getElementById('previewModal').classList.remove('active');
});

document.getElementById('previewModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        e.currentTarget.classList.remove('active');
    }
});