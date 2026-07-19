(() => {
    "use strict";

    const STATE_KEY = "__PORTFOLIO_ANALYTICS_STATE__";
    const PROJECT_OPEN_EVENT = "portfolio:project-open";
    const PORTFOLIO_SESSION_KEY = "portfolio.analytics.portfolio_section_view.v1";
    const ENGAGEMENT_DURATION_MS = 30_000;
    const VALID_GA_ID = /^G-[A-Z0-9]+$/;
    const VALID_CLARITY_ID = /^[a-z0-9]+$/i;
    const ALLOWED_EVENTS = new Set([
        "resume_download",
        "contact_email_click",
        "github_click",
        "linkedin_click",
        "project_open",
        "portfolio_section_view",
        "engaged_30_seconds",
        "contact_cta_click"
    ]);

    if (window[STATE_KEY]?.initialized) {
        return;
    }

    const state = {
        initialized: true,
        cleanups: []
    };

    Object.defineProperty(window, STATE_KEY, {
        value: state,
        configurable: false,
        enumerable: false,
        writable: false
    });

    const runtimeConfig = readRuntimeConfig();

    if (!canCollectAnalytics(runtimeConfig)) {
        return;
    }

    const clarityProjectId = isClarityAllowedOnPage()
        ? runtimeConfig.clarityProjectId
        : "";
    const providers = [
        createGoogleAnalytics(runtimeConfig.gaMeasurementId),
        createClarityAnalytics(clarityProjectId)
    ].filter(Boolean);

    if (providers.length === 0) {
        return;
    }

    const trackEvent = createEventTracker(providers);
    let disposeEngagementTracking = () => {};

    state.cleanups.push(bindConversionEvents(trackEvent));
    state.cleanups.push(observePortfolioSection(trackEvent));
    state.cleanups.push(() => disposeEngagementTracking());
    state.cleanups.push(bindPageLifecycle(startPageView));
    startPageView();

    function startPageView() {
        disposeEngagementTracking();
        providers.forEach((provider) => provider.trackPageView?.(getSafePageContext()));
        disposeEngagementTracking = scheduleEngagementEvent(trackEvent);
    }

    function cleanup() {
        state.cleanups.splice(0).forEach((dispose) => dispose?.());
    }

    function bindPageLifecycle(onBfcacheRestore) {
        const onPageHide = (event) => {
            if (!event.persisted) {
                cleanup();
            }
        };
        const onPageShow = (event) => {
            if (event.persisted) {
                onBfcacheRestore();
            }
        };

        window.addEventListener("pagehide", onPageHide);
        window.addEventListener("pageshow", onPageShow);

        return () => {
            window.removeEventListener("pagehide", onPageHide);
            window.removeEventListener("pageshow", onPageShow);
        };
    }

    function readRuntimeConfig() {
        const value = window.__PORTFOLIO_ANALYTICS_CONFIG__;

        if (!value || typeof value !== "object") {
            return {};
        }

        return {
            environment: value.environment,
            gaMeasurementId: normalizeId(value.gaMeasurementId),
            clarityProjectId: normalizeId(value.clarityProjectId)
        };
    }

    function normalizeId(value) {
        return typeof value === "string" ? value.trim() : "";
    }

    function isClarityAllowedOnPage() {
        const isSensitivePage = document.body?.dataset.analyticsClarity === "disabled";
        const referrerHasQuery = urlHasQuery(document.referrer);

        // Clarity records page and clicked URLs outside the custom-event payload.
        // Skip it where the DOM contains Email destinations or where the current
        // URL/referrer has query parameters; GA4 still receives a sanitized path.
        return !isSensitivePage && window.location.search === "" && !referrerHasQuery;
    }

    function urlHasQuery(value) {
        if (!value) {
            return false;
        }

        try {
            return new URL(value).search !== "";
        } catch (_error) {
            return true;
        }
    }

    function canCollectAnalytics(config) {
        if (config.environment !== "production" || window.location.protocol === "file:") {
            return false;
        }

        const hostname = window.location.hostname.toLowerCase();
        const isLocalHostname =
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "::1" ||
            hostname === "[::1]" ||
            hostname.endsWith(".localhost") ||
            hostname.endsWith(".local");

        return !isLocalHostname;
    }

    function createGoogleAnalytics(measurementId) {
        if (!VALID_GA_ID.test(measurementId)) {
            return null;
        }

        window.dataLayer = Array.isArray(window.dataLayer) ? window.dataLayer : [];

        if (typeof window.gtag !== "function") {
            window.gtag = function gtag() {
                window.dataLayer.push(arguments);
            };
        }

        // Advertising storage and signals stay disabled; this integration is
        // limited to first-party portfolio usage analytics.
        window.gtag("consent", "default", {
            ad_storage: "denied",
            ad_user_data: "denied",
            ad_personalization: "denied",
            analytics_storage: "granted"
        });
        window.gtag("js", new Date());
        const safePageContext = getSafePageContext();

        window.gtag("config", measurementId, {
            send_page_view: false,
            allow_google_signals: false,
            allow_ad_personalization_signals: false,
            ads_data_redaction: true,
            ...safePageContext
        });

        loadExternalScriptOnce({
            provider: "ga4",
            selector: "script[src^='https://www.googletagmanager.com/gtag/js']",
            src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
        });

        return {
            trackPageView(pageContext) {
                window.gtag("event", "page_view", pageContext);
            },
            trackEvent(eventName, parameters) {
                window.gtag("event", eventName, {
                    ...getSafePageContext(),
                    ...parameters
                });
            }
        };
    }

    function createClarityAnalytics(projectId) {
        if (!VALID_CLARITY_ID.test(projectId)) {
            return null;
        }

        if (typeof window.clarity !== "function") {
            window.clarity = function clarity() {
                (window.clarity.q = window.clarity.q || []).push(arguments);
            };
        }

        loadExternalScriptOnce({
            provider: "clarity",
            selector: "script[src^='https://www.clarity.ms/tag/']",
            src: `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`
        });

        return {
            trackEvent(eventName) {
                window.clarity("event", eventName);
            }
        };
    }

    function loadExternalScriptOnce({ provider, selector, src }) {
        if (document.querySelector(selector)) {
            return;
        }

        const script = document.createElement("script");
        script.async = true;
        script.src = src;
        script.dataset.portfolioAnalyticsProvider = provider;
        document.head.append(script);
    }

    function getSafePageContext() {
        const pathname = window.location.pathname || "/";

        return {
            page_path: pathname,
            page_location: `${window.location.origin}${pathname}`,
            page_title: getGenericPageTitle(pathname)
        };
    }

    function getGenericPageTitle(pathname) {
        const filename = pathname.endsWith("/")
            ? "index.html"
            : pathname.split("/").filter(Boolean).pop() || "index.html";
        const titles = {
            "index.html": "首頁",
            "introduction.html": "關於我",
            "portfolio.html": "作品集",
            "ip_design.html": "形象設計",
            "poster_design.html": "海報設計",
            "tender_design.html": "標案設計",
            "text_design.html": "文字設計"
        };

        return titles[filename] || "作品集網站";
    }

    function createEventTracker(activeProviders) {
        return (eventName, rawParameters = {}) => {
            if (!ALLOWED_EVENTS.has(eventName)) {
                return;
            }

            const parameters = sanitizeEventParameters(eventName, rawParameters);

            if (eventName === "project_open" && !parameters.project_name) {
                return;
            }

            activeProviders.forEach((provider) => provider.trackEvent?.(eventName, parameters));
        };
    }

    function sanitizeEventParameters(eventName, rawParameters) {
        if (eventName === "project_open") {
            return {
                project_name: sanitizeProjectName(rawParameters.project_name)
            };
        }

        if (eventName === "contact_email_click") {
            return allowListedParameter("contact_method", rawParameters.contact_method, [
                "gmail",
                "mailto",
                "copy"
            ]);
        }

        if (eventName === "contact_cta_click") {
            return allowListedParameter("cta_location", rawParameters.cta_location, [
                "about_hero",
                "about_contact"
            ]);
        }

        return {};
    }

    function allowListedParameter(key, value, allowedValues) {
        return allowedValues.includes(value) ? { [key]: value } : {};
    }

    function sanitizeProjectName(value) {
        if (typeof value !== "string") {
            return "";
        }

        const normalized = value
            .replace(/[\u0000-\u001f\u007f]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80);

        // Guard against accidentally forwarding an email-like value from
        // future markup. Project titles are curated site content only.
        return /\S+@\S+\.\S+/.test(normalized) ? "" : normalized;
    }

    function bindConversionEvents(trackEvent) {
        const onClick = (event) => {
            if (!(event.target instanceof Element)) {
                return;
            }

            const trackedElement = event.target.closest("[data-analytics-event], a[href]");

            if (!trackedElement) {
                return;
            }

            const resolved = resolveClickEvent(trackedElement);

            if (resolved) {
                trackEvent(resolved.eventName, resolved.parameters);
            }
        };

        const onProjectOpen = (event) => {
            const projectName = event.detail?.projectName;
            trackEvent("project_open", { project_name: projectName });
        };

        document.addEventListener("click", onClick, true);
        document.addEventListener(PROJECT_OPEN_EVENT, onProjectOpen);

        return () => {
            document.removeEventListener("click", onClick, true);
            document.removeEventListener(PROJECT_OPEN_EVENT, onProjectOpen);
        };
    }

    function resolveClickEvent(element) {
        const explicitEvent = element.dataset.analyticsEvent;

        if (explicitEvent) {
            return {
                eventName: explicitEvent,
                parameters: {
                    contact_method: element.dataset.analyticsMethod,
                    cta_location: element.dataset.analyticsLocation
                }
            };
        }

        if (!(element instanceof HTMLAnchorElement)) {
            return null;
        }

        const rawHref = element.getAttribute("href") || "";

        if (/^mailto:/i.test(rawHref)) {
            return {
                eventName: "contact_email_click",
                parameters: { contact_method: "mailto" }
            };
        }

        let url;

        try {
            url = new URL(rawHref, document.baseURI);
        } catch (_error) {
            return null;
        }

        const hostname = url.hostname.toLowerCase();

        if (hostname === "github.com" || hostname.endsWith(".github.com")) {
            return { eventName: "github_click", parameters: {} };
        }

        if (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) {
            return { eventName: "linkedin_click", parameters: {} };
        }

        const filename = decodeURIComponent(url.pathname.split("/").pop() || "");

        if (/\b(?:resume|cv)\b|履歷/i.test(filename)) {
            return { eventName: "resume_download", parameters: {} };
        }

        return null;
    }

    function observePortfolioSection(trackEvent) {
        const section = document.querySelector("[data-analytics-section='portfolio']");

        if (!section || hasSessionEvent(PORTFOLIO_SESSION_KEY)) {
            return () => {};
        }

        if (!("IntersectionObserver" in window)) {
            return () => {};
        }

        const observer = new IntersectionObserver((entries) => {
            const isVisible = entries.some((entry) => entry.isIntersecting);

            if (!isVisible || hasSessionEvent(PORTFOLIO_SESSION_KEY)) {
                return;
            }

            markSessionEvent(PORTFOLIO_SESSION_KEY);
            trackEvent("portfolio_section_view");
            observer.disconnect();
        }, {
            threshold: 0.15
        });

        observer.observe(section);
        return () => observer.disconnect();
    }

    function hasSessionEvent(key) {
        try {
            return window.sessionStorage.getItem(key) === "1";
        } catch (_error) {
            return Boolean(state[key]);
        }
    }

    function markSessionEvent(key) {
        state[key] = true;

        try {
            window.sessionStorage.setItem(key, "1");
        } catch (_error) {
            // The in-memory marker still prevents duplicates on this document.
        }
    }

    function scheduleEngagementEvent(trackEvent) {
        let remaining = ENGAGEMENT_DURATION_MS;
        let timerId = 0;
        let visibleSince = 0;
        let sent = false;

        const stopTimer = () => {
            if (!timerId) {
                return;
            }

            window.clearTimeout(timerId);
            timerId = 0;
            remaining = Math.max(0, remaining - (performance.now() - visibleSince));
        };

        const send = () => {
            timerId = 0;

            if (sent) {
                return;
            }

            sent = true;
            trackEvent("engaged_30_seconds");
        };

        const startTimer = () => {
            if (sent || timerId || document.visibilityState !== "visible") {
                return;
            }

            visibleSince = performance.now();
            timerId = window.setTimeout(send, remaining);
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                startTimer();
            } else {
                stopTimer();
            }
        };

        document.addEventListener("visibilitychange", onVisibilityChange);
        startTimer();

        return () => {
            stopTimer();
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }
})();
