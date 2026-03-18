document.addEventListener('DOMContentLoaded', () => {
    const items = document.querySelectorAll('.item');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const modal = document.getElementById('previewModal');
    const previewImg = document.getElementById('previewImg');
    const closePreview = document.getElementById('closePreview');

    let currentIndex = 3;
    let timer = null;

    // --- 修改後的圖片加載監測 (優化線上顯示問題) ---
    items.forEach(item => {
        const img = item.querySelector('img');

        const handleLoad = () => {
            // 確保 DOM 操作在下一幀執行，增加穩定性
            requestAnimationFrame(() => {
                item.classList.add('loaded');
            });
        };

        // 判斷圖片是否已加載完成（包含線上快取情況）
        if (img.complete && img.naturalWidth > 0) {
            handleLoad();
        } else {
            // 監聽加載成功
            img.addEventListener('load', handleLoad);
            // 監聽加載失敗 (避免因為路徑錯誤導致無限轉圈)
            img.addEventListener('error', handleLoad);
        }
    });

    function layout() {
        const isMobile = window.innerWidth <= 768;
        const step = isMobile ? 80 : 150;     
        const scaleStep = 0.8;                
        const opacityStep = 0.6;              

        items.forEach((item, i) => {
            const dis = i - currentIndex; 
            const absDis = Math.abs(dis);

            let tx = dis * step;
            if (dis > 0) tx += (isMobile ? 30 : 80);
            if (dis < 0) tx -= (isMobile ? 30 : 80);

            const scale = Math.pow(scaleStep, absDis);
            const opacity = Math.pow(opacityStep, absDis);
            const rotateY = dis === 0 ? 0 : (dis > 0 ? -40 : 40);
            const zIndex = items.length - absDis;

            item.style.transform = `translateX(${tx}px) scale(${scale}) rotateY(${rotateY}deg)`;
            item.style.opacity = opacity;
            item.style.zIndex = zIndex;
            item.style.filter = dis === 0 ? 'none' : 'blur(2px)';
        });
    }

    function moveToNext() {
        currentIndex++;
        if (currentIndex >= items.length) currentIndex = 0;
        layout();
    }

    function moveToPrev() {
        currentIndex--;
        if (currentIndex < 0) currentIndex = items.length - 1;
        layout();
    }

    function startAutoPlay() {
        if (timer || modal.classList.contains('active')) return;
        timer = setInterval(moveToNext, 3000);
    }

    function stopAutoPlay() {
        if (timer) { clearInterval(timer); timer = null; }
    }

    nextBtn.onclick = (e) => { e.stopPropagation(); moveToNext(); stopAutoPlay(); startAutoPlay(); };
    prevBtn.onclick = (e) => { e.stopPropagation(); moveToPrev(); stopAutoPlay(); startAutoPlay(); };

    items.forEach((item, i) => {
        item.onclick = (e) => {
            if (i === currentIndex) {
                const img = item.querySelector('img');
                previewImg.src = img.src;
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
                stopAutoPlay();
            } else {
                currentIndex = i;
                layout();
                stopAutoPlay();
                startAutoPlay();
            }
        };
    });

    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        startAutoPlay();
    };

    closePreview.onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
    document.onkeydown = (e) => { if (e.key === 'Escape') closeModal(); };

    window.onresize = layout;
    layout();
    startAutoPlay();
});