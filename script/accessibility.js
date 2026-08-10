(() => {
    "use strict";

    const STORAGE_KEY = "portfolio.motion.paused.v1";
    const MOBILE_BREAKPOINT = 780;

    initializeNavigation();
    initializeMotionControl();

    /**
     * Gives the shared navigation true button semantics, complete keyboard access,
     * accurate expanded state and predictable Escape/outside-click behaviour.
     */
    function initializeNavigation() {
        const nav = document.querySelector("[data-site-nav]");

        if (!(nav instanceof HTMLElement)) {
            return;
        }

        const menuButton = nav.querySelector("[data-nav-toggle]");
        const dropdown = nav.querySelector("[data-nav-dropdown]");
        const dropdownButton = nav.querySelector("[data-dropdown-toggle]");
        const hoverCapable = window.matchMedia("(hover: hover) and (pointer: fine)");

        function setMobileMenu(open, returnFocus = false) {
            if (!(menuButton instanceof HTMLButtonElement)) {
                return;
            }

            nav.classList.toggle("is-open", open);
            menuButton.setAttribute("aria-expanded", String(open));
            menuButton.setAttribute("aria-label", open ? "關閉主要導覽選單" : "開啟主要導覽選單");

            if (!open) {
                setDropdown(false);
            }

            if (returnFocus) {
                menuButton.focus({ preventScroll: true });
            }
        }

        function setDropdown(open, returnFocus = false) {
            if (!(dropdown instanceof HTMLElement) || !(dropdownButton instanceof HTMLButtonElement)) {
                return;
            }

            dropdown.classList.toggle("active", open);
            dropdownButton.setAttribute("aria-expanded", String(open));

            if (returnFocus) {
                dropdownButton.focus({ preventScroll: true });
            }
        }

        menuButton?.addEventListener("click", () => {
            setMobileMenu(!nav.classList.contains("is-open"));
        });

        dropdownButton?.addEventListener("click", (event) => {
            const isPointerClick = event.detail > 0;
            const isOpen = Boolean(dropdown?.classList.contains("active"));

            // Pointer entry opens hover-capable menus before click fires. Keep
            // that state instead of immediately toggling it closed.
            setDropdown(hoverCapable.matches && isPointerClick ? true : !isOpen);
        });

        if (dropdown instanceof HTMLElement) {
            dropdown.addEventListener("pointerenter", () => {
                if (hoverCapable.matches) {
                    setDropdown(true);
                }
            });

            dropdown.addEventListener("pointerleave", () => {
                if (hoverCapable.matches && !dropdown.contains(document.activeElement)) {
                    setDropdown(false);
                }
            });

            dropdown.addEventListener("focusout", () => {
                window.requestAnimationFrame(() => {
                    if (!dropdown.contains(document.activeElement)) {
                        setDropdown(false);
                    }
                });
            });
        }

        nav.addEventListener("click", (event) => {
            const target = event.target;

            if (target instanceof Element && target.closest(".nav-links a[href]")) {
                setMobileMenu(false);
            }
        });

        document.addEventListener("click", (event) => {
            if (event.target instanceof Node && !nav.contains(event.target)) {
                setDropdown(false);
                setMobileMenu(false);
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.code !== "Escape") {
                return;
            }

            if (dropdown?.classList.contains("active")) {
                event.preventDefault();
                setDropdown(false, true);
                return;
            }

            if (nav.classList.contains("is-open")) {
                event.preventDefault();
                setMobileMenu(false, true);
            }
        });

        window.addEventListener("resize", () => {
            if (window.innerWidth > MOBILE_BREAKPOINT) {
                setMobileMenu(false);
            }
        }, { passive: true });
    }

    /**
     * One compact control covers every non-essential animation on the page.
     * Session storage carries the visitor's choice across this static multi-page site.
     */
    function initializeMotionControl() {
        const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        const button = document.createElement("button");
        let explicitPreference = readStoredPreference();
        let paused = explicitPreference ?? reducedMotionQuery.matches;

        button.type = "button";
        button.className = "site-motion-toggle";
        button.setAttribute("aria-live", "polite");
        document.body.appendChild(button);

        applyMotionState(false);

        button.addEventListener("click", () => {
            explicitPreference = !paused;
            paused = explicitPreference;
            storePreference(explicitPreference);
            applyMotionState(true);
        });

        const handleReducedMotionChange = () => {
            if (explicitPreference === null) {
                paused = reducedMotionQuery.matches;
                applyMotionState(false);
            }
        };

        if (typeof reducedMotionQuery.addEventListener === "function") {
            reducedMotionQuery.addEventListener("change", handleReducedMotionChange);
        } else {
            reducedMotionQuery.addListener(handleReducedMotionChange);
        }

        function applyMotionState(announce) {
            document.documentElement.classList.toggle("site-motion-paused", paused);
            button.setAttribute("aria-pressed", String(paused));
            button.setAttribute("aria-label", paused ? "播放網站動畫" : "暫停網站動畫");
            button.title = paused ? "播放動畫" : "暫停動畫";

            document.dispatchEvent(new CustomEvent("site:motionchange", {
                detail: { paused, announce }
            }));
        }

        function readStoredPreference() {
            try {
                const stored = window.sessionStorage.getItem(STORAGE_KEY);

                if (stored === "true") return true;
                if (stored === "false") return false;
            } catch (_error) {
                // Storage can be unavailable in strict privacy modes; the control still works.
            }

            return null;
        }

        function storePreference(value) {
            try {
                window.sessionStorage.setItem(STORAGE_KEY, String(value));
            } catch (_error) {
                // No-op: the current page still honours the visitor's choice.
            }
        }
    }
})();
