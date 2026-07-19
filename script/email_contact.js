(() => {
    "use strict";

    const EMAIL_ADDRESS = "isaaclaujx@gmail.com";
    const EMAIL_SUBJECT = "作品集聯絡";
    const GMAIL_COMPOSE_URL = "https://mail.google.com/mail/";
    const dialog = document.querySelector("[data-email-dialog]");
    const openers = [...document.querySelectorAll("[data-email-contact]")];

    if (
        typeof HTMLDialogElement === "undefined" ||
        !(dialog instanceof HTMLDialogElement) ||
        openers.length === 0
    ) {
        return;
    }

    const panel = dialog.querySelector(".about-email-dialog__panel");
    const closeButton = dialog.querySelector("[data-email-dialog-close]");
    const copyButton = dialog.querySelector("[data-email-copy]");
    const status = dialog.querySelector("[data-email-status]");
    const externalOptions = dialog.querySelectorAll("[data-email-dialog-option]");

    let activeOpener = null;

    function setPageScrollLocked(locked) {
        document.documentElement.classList.toggle("about-email-dialog-open", locked);
    }

    function clearStatus() {
        if (status instanceof HTMLElement) {
            status.textContent = "";
        }
    }

    function closeDialog() {
        if (dialog.open) {
            dialog.close();
        }
    }

    function buildGmailUrl() {
        const url = new URL(GMAIL_COMPOSE_URL);
        url.searchParams.set("view", "cm");
        url.searchParams.set("fs", "1");
        url.searchParams.set("to", EMAIL_ADDRESS);
        url.searchParams.set("su", EMAIL_SUBJECT);
        return url.toString();
    }

    function openEmailDestination(action) {
        if (action === "gmail") {
            window.open(buildGmailUrl(), "_blank", "noopener,noreferrer");
            return;
        }

        if (action === "mailto") {
            window.open(`mailto:${EMAIL_ADDRESS}`, "_self");
        }
    }

    function openDialog(event) {
        if (typeof dialog.showModal !== "function") {
            event.preventDefault();
            openEmailDestination("mailto");
            return;
        }

        event.preventDefault();
        activeOpener = event.currentTarget;
        clearStatus();
        setPageScrollLocked(true);

        if (!dialog.open) {
            dialog.showModal();
        }
    }

    function fallbackCopy() {
        const textarea = document.createElement("textarea");
        textarea.value = EMAIL_ADDRESS;
        textarea.readOnly = true;
        textarea.setAttribute("aria-hidden", "true");
        textarea.style.position = "fixed";
        textarea.style.inset = "0 auto auto -9999px";
        document.body.append(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        return copied;
    }

    async function copyEmail() {
        let copied = false;

        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
                await navigator.clipboard.writeText(EMAIL_ADDRESS);
                copied = true;
            } else {
                copied = fallbackCopy();
            }
        } catch (_error) {
            copied = fallbackCopy();
        }

        if (status instanceof HTMLElement) {
            status.textContent = copied
                ? `Email 已複製：${EMAIL_ADDRESS}`
                : `無法自動複製，請手動複製：${EMAIL_ADDRESS}`;
        }

        if (copyButton instanceof HTMLElement) {
            copyButton.focus();
        }
    }

    openers.forEach((opener) => opener.addEventListener("click", openDialog));

    closeButton?.addEventListener("click", closeDialog);
    copyButton?.addEventListener("click", copyEmail);

    externalOptions.forEach((option) => {
        option.addEventListener("click", (event) => {
            event.preventDefault();
            const action = event.currentTarget.dataset.emailAction;
            closeDialog();
            openEmailDestination(action);
        });
    });

    dialog.addEventListener("click", (event) => {
        if (event.target !== dialog || !(panel instanceof HTMLElement)) {
            return;
        }

        const rect = panel.getBoundingClientRect();
        const clickedOutsidePanel =
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom;

        if (clickedOutsidePanel) {
            closeDialog();
        }
    });

    // Handle Escape ourselves so Safari cannot override the intended focus
    // restoration after completing its native dialog-cancel algorithm.
    dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        closeDialog();
    });

    dialog.addEventListener("close", () => {
        setPageScrollLocked(false);
        clearStatus();

        if (activeOpener instanceof HTMLElement && document.contains(activeOpener)) {
            activeOpener.focus();
        }

        activeOpener = null;
    });

    window.addEventListener("pagehide", () => setPageScrollLocked(false), { once: true });
})();
