(() => {
    "use strict";

    const root = document.querySelector("[data-hero-media]");

    if (!(root instanceof HTMLElement)) {
        return;
    }

    const video = root.querySelector("[data-hero-video]");
    const fallback = root.querySelector("[data-hero-fallback]");

    if (!(video instanceof HTMLVideoElement) || !(fallback instanceof HTMLImageElement)) {
        return;
    }

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animatedFallbackSource = fallback.dataset.animatedSrc || "";
    const stillFallbackSource = fallback.dataset.stillSrc || "";

    let mode = "pending";
    let pageIsActive = !document.hidden;
    let validationStarted = false;
    let probeTimeoutId = 0;
    let fallbackHideTimeoutId = 0;

    function safePlay() {
        const playPromise = video.play();

        if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => {
                // Autoplay policy failures leave the transparent first frame visible.
            });
        }
    }

    function preferredFallbackSource() {
        if (reducedMotionQuery.matches || !pageIsActive) {
            return stillFallbackSource || animatedFallbackSource;
        }

        return animatedFallbackSource || stillFallbackSource;
    }

    function syncPlayback() {
        if (mode === "video") {
            if (reducedMotionQuery.matches || !pageIsActive) {
                video.pause();
            } else {
                safePlay();
            }

            return;
        }

        if (mode === "fallback") {
            const nextSource = preferredFallbackSource();

            if (nextSource && fallback.getAttribute("src") !== nextSource) {
                fallback.src = nextSource;
            }
        }
    }

    function clearProbeTimeout() {
        if (probeTimeoutId) {
            window.clearTimeout(probeTimeoutId);
            probeTimeoutId = 0;
        }
    }

    function clearFallbackHideTimeout() {
        if (fallbackHideTimeoutId) {
            window.clearTimeout(fallbackHideTimeoutId);
            fallbackHideTimeoutId = 0;
        }
    }

    function activateVideo() {
        if (mode !== "pending") {
            return;
        }

        clearProbeTimeout();
        clearFallbackHideTimeout();
        mode = "video";
        fallback.setAttribute("aria-hidden", "true");
        video.hidden = false;
        video.removeAttribute("aria-hidden");
        video.classList.add("is-ready");
        fallbackHideTimeoutId = window.setTimeout(() => {
            fallback.hidden = true;
            fallbackHideTimeoutId = 0;
        }, 220);
        syncPlayback();
    }

    function activateFallback() {
        clearProbeTimeout();
        clearFallbackHideTimeout();

        if (mode === "fallback") {
            syncPlayback();
            return;
        }

        mode = "fallback";
        video.pause();
        // Keep the transparent video in the layout as the intrinsic sizing
        // element. The fallback is absolutely positioned, so hiding the video
        // would collapse this auto-sized flex column to 0 x 0 in WebKit.
        video.hidden = false;
        video.setAttribute("aria-hidden", "true");
        video.classList.remove("is-ready");
        fallback.hidden = false;
        fallback.removeAttribute("aria-hidden");
        syncPlayback();
    }

    /*
     * A browser may report VP9 support but discard its alpha plane. Sampling
     * transparent corner pixels prevents an opaque video from being revealed.
     */
    function decodedFrameHasAlpha() {
        if (!video.videoWidth || !video.videoHeight) {
            return false;
        }

        const sampleCanvas = document.createElement("canvas");
        const sampleContext = sampleCanvas.getContext("2d", {
            alpha: true,
            willReadFrequently: true
        });

        if (!sampleContext) {
            return false;
        }

        sampleCanvas.width = 4;
        sampleCanvas.height = 1;

        const maxX = video.videoWidth - 1;
        const maxY = video.videoHeight - 1;
        const samplePoints = [
            [0, 0],
            [maxX, 0],
            [0, maxY],
            [maxX, maxY]
        ];

        samplePoints.forEach(([sourceX, sourceY], destinationX) => {
            sampleContext.drawImage(
                video,
                sourceX,
                sourceY,
                1,
                1,
                destinationX,
                0,
                1,
                1
            );
        });

        const pixels = sampleContext.getImageData(0, 0, 4, 1).data;

        for (let index = 3; index < pixels.length; index += 4) {
            if (pixels[index] < 245) {
                return true;
            }
        }

        return false;
    }

    function validateDecodedFrame() {
        if (validationStarted || mode !== "pending") {
            return;
        }

        validationStarted = true;

        window.requestAnimationFrame(() => {
            try {
                if (decodedFrameHasAlpha()) {
                    activateVideo();
                } else {
                    activateFallback();
                }
            } catch (_error) {
                activateFallback();
            }
        });
    }

    fallback.addEventListener("error", () => {
        if (fallback.getAttribute("src") !== stillFallbackSource && stillFallbackSource) {
            fallback.src = stillFallbackSource;
            return;
        }

        fallback.hidden = true;
    });

    video.addEventListener("loadeddata", validateDecodedFrame, { once: true });
    video.addEventListener("error", activateFallback, { once: true });

    // Some engines report VP9 support but never emit loadeddata or error.
    probeTimeoutId = window.setTimeout(activateFallback, 5000);

    document.addEventListener("visibilitychange", () => {
        pageIsActive = !document.hidden;
        syncPlayback();
    });

    window.addEventListener("pagehide", () => {
        pageIsActive = false;
        syncPlayback();
    });

    window.addEventListener("pageshow", () => {
        pageIsActive = !document.hidden;
        syncPlayback();
    });

    if (typeof reducedMotionQuery.addEventListener === "function") {
        reducedMotionQuery.addEventListener("change", syncPlayback);
    } else {
        reducedMotionQuery.addListener(syncPlayback);
    }

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        validateDecodedFrame();
    }
})();
