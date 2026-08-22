(function () {
    "use strict";

    if (window.__TETRIS_IMAGE_LOADER_INITIALIZED__) {
        return;
    }

    window.__TETRIS_IMAGE_LOADER_INITIALIZED__ = true;

    const IMAGE_SELECTOR = 'img:not([data-tetris-loader="off"])';
    const EXIT_DURATION = 180;
    const COMPACT_SIZE = 72;
    const trackedImages = new WeakSet();
    const records = new WeakMap();
    const activeRecords = new Set();
    let portal = null;
    let animationFrame = 0;

    const shapes = [
        {
            name: "t",
            cells: [[0, 0], [1, 0], [2, 0], [1, 1]]
        },
        {
            name: "l",
            cells: [[0, 0], [0, 1], [1, 1], [2, 1]]
        },
        {
            name: "o",
            cells: [[1, 0], [2, 0], [1, 1], [2, 1]]
        }
    ];

    function ensurePortal() {
        if (portal && portal.isConnected) {
            return portal;
        }

        portal = document.createElement("div");
        portal.className = "tetris-image-loader-portal";
        portal.setAttribute("aria-hidden", "true");
        document.body.appendChild(portal);
        return portal;
    }

    function createOverlay() {
        const overlay = document.createElement("div");
        const board = document.createElement("div");

        overlay.className = "tetris-image-loader";
        overlay.setAttribute("aria-hidden", "true");
        board.className = "tetris-image-loader__board";

        shapes.forEach((shape) => {
            const piece = document.createElement("span");
            piece.className = `tetris-image-loader__piece tetris-image-loader__piece--${shape.name}`;

            shape.cells.forEach(([x, y]) => {
                const block = document.createElement("i");
                block.className = "tetris-image-loader__block";
                block.style.setProperty("--tetris-x", x);
                block.style.setProperty("--tetris-y", y);
                piece.appendChild(block);
            });

            board.appendChild(piece);
        });

        const line = document.createElement("span");
        line.className = "tetris-image-loader__line";
        board.appendChild(line);
        overlay.appendChild(board);

        return overlay;
    }

    function hasUsableSource(image) {
        return Boolean(image.currentSrc || image.getAttribute("src") || image.getAttribute("srcset"));
    }

    function isSettled(image) {
        return image.complete;
    }

    function cancelExit(record) {
        if (!record.exitTimer) {
            return;
        }

        window.clearTimeout(record.exitTimer);
        record.exitTimer = 0;
    }

    function removeOverlay(record) {
        cancelExit(record);

        if (record.overlay) {
            record.overlay.remove();
            record.overlay = null;
        }
    }

    function finishLoading(image, immediate) {
        const record = records.get(image);

        if (!record) {
            return;
        }

        activeRecords.delete(record);

        if (!record.overlay) {
            return;
        }

        if (immediate) {
            removeOverlay(record);
            return;
        }

        record.overlay.classList.add("tetris-image-loader--leaving");
        cancelExit(record);
        record.exitTimer = window.setTimeout(() => removeOverlay(record), EXIT_DURATION);
    }

    function beginLoading(image) {
        const record = records.get(image);

        if (!record || !image.isConnected || !hasUsableSource(image) || isSettled(image)) {
            finishLoading(image, true);
            return;
        }

        cancelExit(record);

        if (!record.overlay) {
            record.overlay = createOverlay();
            ensurePortal().appendChild(record.overlay);
        }

        record.overlay.classList.remove("tetris-image-loader--leaving");
        activeRecords.add(record);
        schedulePositionSync();
    }

    function readPosition(record) {
        const { image } = record;

        if (!image.isConnected) {
            return { record, remove: true };
        }

        const rect = image.getBoundingClientRect();
        const style = window.getComputedStyle(image);
        const opacity = Number.parseFloat(style.opacity || "1");
        const visible = rect.width > 1 && rect.height > 1 &&
            rect.right > 0 && rect.bottom > 0 &&
            rect.left < window.innerWidth && rect.top < window.innerHeight &&
            style.display !== "none" && style.visibility !== "hidden" && opacity > 0.08;

        return {
            record,
            rect,
            visible,
            radius: style.borderRadius,
            compact: Math.min(rect.width, rect.height) < COMPACT_SIZE
        };
    }

    function writePosition(measurement) {
        const { record, rect, visible, radius, compact } = measurement;
        const { overlay } = record;

        if (!overlay) {
            return;
        }

        overlay.hidden = !visible;

        if (!visible) {
            return;
        }

        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        overlay.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
        overlay.style.setProperty("--tetris-loader-radius", radius);
        overlay.classList.toggle("tetris-image-loader--compact", compact);
    }

    function syncPositions() {
        animationFrame = 0;

        if (!activeRecords.size) {
            return;
        }

        const measurements = Array.from(activeRecords, readPosition);

        measurements.forEach((measurement) => {
            if (measurement.remove) {
                finishLoading(measurement.record.image, true);
                return;
            }

            writePosition(measurement);
        });

        if (activeRecords.size) {
            animationFrame = window.requestAnimationFrame(syncPositions);
        }
    }

    function schedulePositionSync() {
        if (!animationFrame && activeRecords.size) {
            animationFrame = window.requestAnimationFrame(syncPositions);
        }
    }

    const lazyObserver = "IntersectionObserver" in window
        ? new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                lazyObserver.unobserve(entry.target);
                beginLoading(entry.target);
            });
        }, { rootMargin: "240px" })
        : null;

    function armImage(image) {
        window.queueMicrotask(() => {
            if (!image.isConnected || !hasUsableSource(image) || isSettled(image)) {
                finishLoading(image, true);
                return;
            }

            if (image.loading === "lazy" && lazyObserver) {
                lazyObserver.observe(image);
                return;
            }

            beginLoading(image);
        });
    }

    function trackImage(image) {
        if (!(image instanceof HTMLImageElement) || trackedImages.has(image)) {
            return;
        }

        trackedImages.add(image);
        records.set(image, {
            image,
            overlay: null,
            exitTimer: 0
        });
        image.addEventListener("load", () => finishLoading(image, false));
        image.addEventListener("error", () => finishLoading(image, false));
        armImage(image);
    }

    function trackTree(node) {
        if (!(node instanceof Element)) {
            return;
        }

        if (node.matches(IMAGE_SELECTOR)) {
            trackImage(node);
        }

        node.querySelectorAll(IMAGE_SELECTOR).forEach(trackImage);
    }

    function removeTree(node) {
        if (!(node instanceof Element)) {
            return;
        }

        const images = node.matches(IMAGE_SELECTOR)
            ? [node, ...node.querySelectorAll(IMAGE_SELECTOR)]
            : Array.from(node.querySelectorAll(IMAGE_SELECTOR));

        images.forEach((image) => {
            lazyObserver?.unobserve(image);
            finishLoading(image, true);
        });
    }

    function handleMutations(mutations) {
        mutations.forEach((mutation) => {
            if (mutation.type === "attributes") {
                const image = mutation.target;
                lazyObserver?.unobserve(image);
                finishLoading(image, true);
                armImage(image);
                return;
            }

            mutation.addedNodes.forEach(trackTree);
            mutation.removedNodes.forEach(removeTree);
        });
    }

    function initialize() {
        ensurePortal();
        document.querySelectorAll(IMAGE_SELECTOR).forEach(trackImage);

        const mutationObserver = new MutationObserver(handleMutations);
        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["src", "srcset", "sizes", "loading"]
        });

        window.addEventListener("resize", schedulePositionSync, { passive: true });
        window.addEventListener("scroll", schedulePositionSync, { passive: true, capture: true });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
}());
