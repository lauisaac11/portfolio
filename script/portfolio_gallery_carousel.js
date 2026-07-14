(() => {
    "use strict";

    const CONFIG = Object.freeze({
        swipeDistance: 48,
        swipeDominance: 1.2,
        swipeDuration: 700,
        syntheticClickDelay: 500
    });

    const galleries = Array.from(document.querySelectorAll("[data-portfolio-gallery]"));

    if (galleries.length === 0) {
        return;
    }

    const preview = createPreviewController();

    galleries.forEach((gallery) => {
        initializeGallery(gallery, preview);
    });

    /**
     * Keeps carousel state, input handling and rendering separate from the preview layer.
     */
    function initializeGallery(gallery, previewController) {
        const carousel = gallery.querySelector("[data-gallery-carousel]");
        const stage = gallery.querySelector("[data-gallery-stage]");
        const slides = Array.from(gallery.querySelectorAll("[data-gallery-slide]"));
        const previousButton = gallery.querySelector("[data-gallery-previous]");
        const nextButton = gallery.querySelector("[data-gallery-next]");
        const status = gallery.querySelector("[data-gallery-status]");

        if (!carousel || !stage || slides.length === 0 || !previousButton || !nextButton || !status) {
            return;
        }

        const links = slides.map((slide) => slide.querySelector("[data-gallery-open]"));
        let activeIndex = 0;
        let touchState = null;
        let suppressClickUntil = 0;

        carousel.classList.add("is-enhanced");
        previousButton.disabled = slides.length < 2;
        nextButton.disabled = slides.length < 2;

        render(false);

        previousButton.addEventListener("click", () => {
            setActive(activeIndex - 1);
        });

        nextButton.addEventListener("click", () => {
            setActive(activeIndex + 1);
        });

        links.forEach((link, index) => {
            if (!link) {
                return;
            }

            link.addEventListener("click", (event) => {
                if (Date.now() < suppressClickUntil) {
                    event.preventDefault();
                    return;
                }

                if (index !== activeIndex) {
                    event.preventDefault();
                    setActive(index, true);
                    return;
                }

                if (previewController) {
                    event.preventDefault();
                    const image = link.querySelector("img");
                    previewController.open({
                        src: link.href,
                        alt: image ? image.alt : slides[index].dataset.title || "作品預覽",
                        trigger: link
                    });
                }
            });
        });

        carousel.addEventListener("keydown", (event) => {
            if (shouldIgnoreNavigationEvent(event)) {
                return;
            }

            let nextIndex = null;

            switch (event.code) {
                case "ArrowLeft":
                    nextIndex = activeIndex - 1;
                    break;
                case "ArrowRight":
                    nextIndex = activeIndex + 1;
                    break;
                case "Home":
                    nextIndex = 0;
                    break;
                case "End":
                    nextIndex = slides.length - 1;
                    break;
                default:
                    return;
            }

            event.preventDefault();
            // Do not stop propagation: the global desktop Konami sequence must still receive the keys.
            const focusTarget =
                event.code === "ArrowLeft" || event.code === "Home"
                    ? previousButton
                    : nextButton;

            // Keep the visible keyboard focus on a real control instead of drawing an outline around the artwork.
            focusTarget.focus({ preventScroll: true });
            setActive(nextIndex);
        });

        if (galleries.length === 1) {
            document.addEventListener("keydown", (event) => {
                const target = event.target;

                if (
                    shouldIgnoreNavigationEvent(event) ||
                    (target instanceof Node && carousel.contains(target)) ||
                    isInteractiveKeyboardTarget(target)
                ) {
                    return;
                }

                if (event.code === "ArrowLeft") {
                    event.preventDefault();
                    // Background navigation intentionally keeps focus where it is, so no artwork outline appears.
                    setActive(activeIndex - 1);
                } else if (event.code === "ArrowRight") {
                    event.preventDefault();
                    setActive(activeIndex + 1);
                }
            });
        }

        stage.addEventListener("touchstart", (event) => {
            if (event.touches.length !== 1) {
                touchState = null;
                return;
            }

            const touch = event.touches[0];
            touchState = {
                identifier: touch.identifier,
                startX: touch.clientX,
                startY: touch.clientY,
                lastX: touch.clientX,
                lastY: touch.clientY,
                startedAt: Date.now()
            };
        }, { passive: true });

        stage.addEventListener("touchmove", (event) => {
            if (!touchState || event.touches.length !== 1) {
                touchState = null;
                return;
            }

            const touch = findTouch(event.touches, touchState.identifier);

            if (!touch) {
                touchState = null;
                return;
            }

            touchState.lastX = touch.clientX;
            touchState.lastY = touch.clientY;
        }, { passive: true });

        stage.addEventListener("touchend", (event) => {
            if (!touchState) {
                return;
            }

            const touch = findTouch(event.changedTouches, touchState.identifier);

            if (touch) {
                touchState.lastX = touch.clientX;
                touchState.lastY = touch.clientY;
            }

            const deltaX = touchState.lastX - touchState.startX;
            const deltaY = touchState.lastY - touchState.startY;
            const elapsed = Date.now() - touchState.startedAt;
            const isHorizontalSwipe =
                elapsed <= CONFIG.swipeDuration &&
                Math.abs(deltaX) >= CONFIG.swipeDistance &&
                Math.abs(deltaX) > Math.abs(deltaY) * CONFIG.swipeDominance;

            touchState = null;

            if (!isHorizontalSwipe) {
                return;
            }

            suppressClickUntil = Date.now() + CONFIG.syntheticClickDelay;
            setActive(activeIndex + (deltaX < 0 ? 1 : -1));
        }, { passive: true });

        stage.addEventListener("touchcancel", () => {
            touchState = null;
        }, { passive: true });

        function setActive(index, shouldFocus = false) {
            activeIndex = normalizeIndex(index, slides.length);
            render(shouldFocus);
        }

        function render(shouldFocus) {
            slides.forEach((slide, index) => {
                const position = resolvePosition(index, activeIndex, slides.length);
                const link = links[index];
                const isActive = position === "active";
                const isHidden = position === "hidden";

                slide.dataset.position = position;
                slide.setAttribute("aria-hidden", String(isHidden));

                if (link) {
                    link.tabIndex = isActive ? 0 : -1;

                    if (isActive) {
                        link.setAttribute("aria-current", "true");
                    } else {
                        link.removeAttribute("aria-current");
                    }
                }
            });

            const activeTitle = slides[activeIndex].dataset.title || `作品 ${activeIndex + 1}`;
            status.textContent =
                `${String(activeIndex + 1).padStart(2, "0")}／${String(slides.length).padStart(2, "0")}　${activeTitle}`;

            if (shouldFocus && links[activeIndex]) {
                requestAnimationFrame(() => {
                    links[activeIndex].focus({ preventScroll: true });
                });
            }
        }
    }

    function resolvePosition(index, activeIndex, length) {
        if (index === activeIndex) {
            return "active";
        }

        const forward = (index - activeIndex + length) % length;
        const backward = forward - length;
        const offset = Math.abs(backward) < Math.abs(forward) ? backward : forward;

        if (offset === -1) {
            return "previous";
        }

        if (offset === 1) {
            return "next";
        }

        if (offset === -2) {
            return "previous-far";
        }

        if (offset === 2) {
            return "next-far";
        }

        return "hidden";
    }

    function normalizeIndex(index, length) {
        return ((index % length) + length) % length;
    }

    function findTouch(touchList, identifier) {
        for (let index = 0; index < touchList.length; index += 1) {
            if (touchList[index].identifier === identifier) {
                return touchList[index];
            }
        }

        return null;
    }

    function shouldIgnoreNavigationEvent(event) {
        return Boolean(
            event.defaultPrevented ||
            event.isComposing ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            document.querySelector("[data-gallery-modal].is-active, .konami-rocket-overlay")
        );
    }

    function isInteractiveKeyboardTarget(target) {
        if (!(target instanceof Element)) {
            return false;
        }

        return Boolean(target.closest(
            "a, button, input, select, textarea, [contenteditable], " +
            "[role='textbox'], [role='slider'], [role='spinbutton']"
        ));
    }

    /**
     * Uses a regular fixed layer instead of a native top-layer dialog so the Konami overlay
     * can always remain above it. It intentionally does not alter page scroll styles.
     */
    function createPreviewController() {
        const modal = document.querySelector("[data-gallery-modal]");
        const image = modal ? modal.querySelector("[data-gallery-preview-image]") : null;
        const closeButton = modal ? modal.querySelector("[data-gallery-preview-close]") : null;
        const errorMessage = modal ? modal.querySelector("[data-gallery-preview-error]") : null;

        if (!modal || !image || !closeButton || !errorMessage) {
            return null;
        }

        let trigger = null;
        let isOpen = false;

        closeButton.addEventListener("click", () => {
            close();
        });

        modal.addEventListener("click", (event) => {
            if (event.target === modal) {
                close();
            }
        });

        image.addEventListener("error", () => {
            image.hidden = true;
            errorMessage.hidden = false;
        });

        document.addEventListener("keydown", (event) => {
            if (!isOpen) {
                return;
            }

            if (event.code === "Escape") {
                event.preventDefault();
                close();
                return;
            }

            if (event.code === "Tab") {
                event.preventDefault();
                closeButton.focus();
            }
        });

        window.addEventListener("pagehide", () => {
            close(false);
        });

        return {
            open({ src, alt, trigger: nextTrigger }) {
                trigger = nextTrigger || document.activeElement;
                isOpen = true;
                image.hidden = false;
                image.alt = alt;
                errorMessage.hidden = true;
                image.src = src;
                modal.classList.add("is-active");
                modal.setAttribute("aria-hidden", "false");
                closeButton.focus({ preventScroll: true });
            }
        };

        function close(restoreFocus = true) {
            if (!isOpen) {
                return;
            }

            isOpen = false;
            modal.classList.remove("is-active");
            modal.setAttribute("aria-hidden", "true");
            image.removeAttribute("src");
            image.hidden = false;
            errorMessage.hidden = true;

            if (restoreFocus && trigger && trigger.isConnected) {
                trigger.focus({ preventScroll: true });
            }

            trigger = null;
        }
    }
})();
