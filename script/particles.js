(() => {
    "use strict";

    const canvas = document.getElementById("particleCanvas");

    if (!(canvas instanceof HTMLCanvasElement)) {
        return;
    }

    const context = canvas.getContext("2d", { alpha: true });

    if (!context) {
        return;
    }

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const particleSizes = [4, 8, 12];
    const particleAlphas = [0.15, 0.3, 0.6];
    const pointer = { x: null, y: null, radius: 120 };

    let width = 0;
    let height = 0;
    let particles = [];
    let animationFrameId = 0;
    let resizeFrameId = 0;

    class Particle {
        constructor(x, y, velocityX, velocityY, size, color) {
            this.x = x;
            this.y = y;
            this.velocityX = velocityX;
            this.velocityY = velocityY;
            this.size = size;
            this.color = color;
        }

        draw() {
            context.fillStyle = this.color;
            context.fillRect(
                Math.floor(this.x),
                Math.floor(this.y),
                this.size,
                this.size
            );
        }

        update() {
            this.x += this.velocityX;
            this.y += this.velocityY;

            if (this.x > width) this.x = 0;
            if (this.x < 0) this.x = width;
            if (this.y > height) this.y = 0;
            if (this.y < 0) this.y = height;

            if (pointer.x !== null && pointer.y !== null) {
                const deltaX = pointer.x - this.x;
                const deltaY = pointer.y - this.y;
                const distance = Math.hypot(deltaX, deltaY);

                if (distance > 0 && distance < pointer.radius) {
                    const force = (pointer.radius - distance) / pointer.radius;
                    this.x -= (deltaX / distance) * force * 4;
                    this.y -= (deltaY / distance) * force * 4;
                }
            }

            this.draw();
        }
    }

    function configureCanvas() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.imageSmoothingEnabled = false;
    }

    function createParticles() {
        const mobileMultiplier = width < 600 ? 0.65 : 1;
        const motionMultiplier = reducedMotionQuery.matches ? 0.4 : 1;
        const count = Math.max(
            16,
            Math.min(
                180,
                Math.round((width * height) / 12000 * mobileMultiplier * motionMultiplier)
            )
        );

        particles = Array.from({ length: count }, () => {
            const size = particleSizes[Math.floor(Math.random() * particleSizes.length)];
            const alpha = particleAlphas[Math.floor(Math.random() * particleAlphas.length)];

            return new Particle(
                Math.random() * width,
                Math.random() * height,
                Math.random() * 0.4 - 0.2,
                Math.random() * 0.3 + 0.1,
                size,
                `rgba(255, 255, 255, ${alpha})`
            );
        });
    }

    function drawParticles(shouldUpdate) {
        context.clearRect(0, 0, width, height);

        for (const particle of particles) {
            if (shouldUpdate) {
                particle.update();
            } else {
                particle.draw();
            }
        }
    }

    function stopAnimation() {
        if (animationFrameId) {
            window.cancelAnimationFrame(animationFrameId);
            animationFrameId = 0;
        }
    }

    function animate() {
        drawParticles(true);
        animationFrameId = window.requestAnimationFrame(animate);
    }

    function startAnimation() {
        stopAnimation();

        if (reducedMotionQuery.matches) {
            drawParticles(false);
            return;
        }

        if (!document.hidden) {
            animate();
        }
    }

    function rebuildScene() {
        configureCanvas();
        createParticles();
        startAnimation();
    }

    function handleResize() {
        if (resizeFrameId) {
            window.cancelAnimationFrame(resizeFrameId);
        }

        resizeFrameId = window.requestAnimationFrame(() => {
            resizeFrameId = 0;
            rebuildScene();
        });
    }

    function handleMotionPreferenceChange() {
        createParticles();
        startAnimation();
    }

    window.addEventListener("mousemove", (event) => {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
    }, { passive: true });

    window.addEventListener("mouseout", () => {
        pointer.x = null;
        pointer.y = null;
    }, { passive: true });

    window.addEventListener("resize", handleResize, { passive: true });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopAnimation();
        } else {
            startAnimation();
        }
    });

    window.addEventListener("pagehide", stopAnimation);
    window.addEventListener("pageshow", startAnimation);

    if (typeof reducedMotionQuery.addEventListener === "function") {
        reducedMotionQuery.addEventListener("change", handleMotionPreferenceChange);
    } else {
        reducedMotionQuery.addListener(handleMotionPreferenceChange);
    }

    rebuildScene();
})();
