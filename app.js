const payload = window.SECURE_PAYLOAD || {};

const state = {
    modalOpen: false,
    unlocking: false,
    content: null,
    flipperKey: extractFlipperKey(),
};

const elements = {
    lockScreen: document.getElementById("lock-screen"),
    dashboard: document.getElementById("dashboard"),
    lockForm: document.getElementById("lock-form"),
    passcodeInput: document.getElementById("passcode-input"),
    openButton: document.getElementById("open-button"),
    lockError: document.getElementById("lock-error"),
    lockBadge: document.getElementById("lock-badge"),
    lockTitle: document.getElementById("lock-title"),
    lockSubtitle: document.getElementById("lock-subtitle"),
    passcodeLabel: document.getElementById("passcode-label"),
    lockHint: document.getElementById("lock-hint"),
    launchStatusLabel: document.getElementById("launch-status-label"),
    launchStatusCopy: document.getElementById("launch-status-copy"),
    heroEyebrow: document.getElementById("hero-eyebrow"),
    heroTitle: document.getElementById("hero-title"),
    heroIntro: document.getElementById("hero-intro"),
    tripLabel: document.getElementById("trip-label"),
    returnDate: document.getElementById("return-date"),
    dailyNoteDate: document.getElementById("daily-note-date"),
    dailyNoteTitle: document.getElementById("daily-note-title"),
    dailyNoteBody: document.getElementById("daily-note-body"),
    dailySpecialLabel: document.getElementById("daily-special-label"),
    dailySpecial: document.getElementById("daily-special"),
    reassuranceList: document.getElementById("reassurance-list"),
    openWhenGrid: document.getElementById("open-when-grid"),
    footerNote: document.getElementById("footer-note"),
    randomNoteButton: document.getElementById("random-note-button"),
    modal: document.getElementById("note-modal"),
    modalTrigger: document.getElementById("modal-trigger"),
    modalTitle: document.getElementById("modal-title"),
    modalPreview: document.getElementById("modal-preview"),
    modalBody: document.getElementById("modal-body"),
    closeModalButton: document.getElementById("close-modal-button"),
};

function getPublicApp() {
    return payload.publicApp || {};
}

function extractFlipperKey() {
    const hashText = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
    if (!hashText) {
        return "";
    }

    const params = new URLSearchParams(hashText);
    const flipperKey = (params.get("fkey") || "").trim();

    if (flipperKey) {
        try {
            window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        } catch (_error) {
            // Ignore history issues on local file launches.
        }
    }

    return flipperKey;
}

function base64ToBytes(base64Text) {
    const binary = window.atob(base64Text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

async function deriveUnlockKey(passcode, flipperKey) {
    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        encoder.encode(`${passcode}::${flipperKey}`),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    return window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: base64ToBytes(payload.salt),
            iterations: payload.iterations,
            hash: "SHA-256",
        },
        keyMaterial,
        {
            name: "AES-GCM",
            length: 256,
        },
        false,
        ["decrypt"]
    );
}

async function decryptPrivateContent(passcode, flipperKey) {
    if (!window.crypto || !window.crypto.subtle) {
        throw new Error("This browser does not support Web Crypto.");
    }

    const key = await deriveUnlockKey(passcode, flipperKey);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: base64ToBytes(payload.iv),
            tagLength: 128,
        },
        key,
        base64ToBytes(payload.sealed)
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decryptedBuffer));
}

function normalizeParagraphs(content) {
    if (Array.isArray(content)) {
        return content;
    }

    if (typeof content === "string" && content.trim()) {
        return [content];
    }

    return ["Add your note here."];
}

function renderParagraphs(container, content) {
    container.innerHTML = "";
    normalizeParagraphs(content).forEach((paragraph) => {
        const text = document.createElement("p");
        text.textContent = paragraph;
        container.appendChild(text);
    });
}

function parseDateValue(dateValue) {
    if (dateValue instanceof Date) {
        return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate(), 12, 0, 0);
    }

    if (typeof dateValue === "string" && dateValue.trim()) {
        return new Date(`${dateValue}T12:00:00`);
    }

    return null;
}

function formatDate(dateValue, options) {
    const parsedDate = parseDateValue(dateValue);
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        return typeof dateValue === "string" && dateValue ? dateValue : "Soon";
    }

    return parsedDate.toLocaleDateString(undefined, options);
}

function getIsoDate(dateValue) {
    const parsedDate = parseDateValue(dateValue);
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        return "";
    }

    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
    const day = String(parsedDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getDailyMessage() {
    const content = state.content || {};
    const dailyDefaults = content.dailyMessage || {};
    const messages = Array.isArray(content.dailyMessages) ? content.dailyMessages : [];

    if (!messages.length) {
        return {
            title: dailyDefaults.fallbackTitle || "For today",
            body: dailyDefaults.fallbackBody || "Add a daily message in source_content.js.",
            special: dailyDefaults.fallbackSpecial || "Add a little daily extra in source_content.js.",
        };
    }

    const today = parseDateValue(new Date());
    const todayKey = getIsoDate(today);
    const exactMatch = messages.find((message) => message.date === todayKey);
    const selectedMessage = exactMatch || messages[0];

    return {
        title: selectedMessage.title || dailyDefaults.fallbackTitle || "For today",
        body: selectedMessage.body || dailyDefaults.fallbackBody || "Add a daily message in source_content.js.",
        special:
            selectedMessage.special ||
            dailyDefaults.fallbackSpecial ||
            "Add a little daily extra in source_content.js.",
    };
}

function renderLockScreen() {
    const publicApp = getPublicApp();
    const flipperReady = Boolean(state.flipperKey);

    elements.lockBadge.textContent = publicApp.lockBadge || "Private";
    elements.lockTitle.textContent = publicApp.lockTitle || "Locked In";
    elements.lockSubtitle.textContent = publicApp.lockSubtitle || "Use the Flipper launch first.";
    elements.passcodeLabel.textContent = publicApp.passcodeLabel || "Passcode";
    elements.passcodeInput.placeholder = publicApp.passcodePlaceholder || "Your code";
    elements.openButton.textContent = state.unlocking
        ? "Opening..."
        : publicApp.openButtonLabel || "Open";
    elements.launchStatusLabel.textContent = publicApp.flipperRequiredLabel || "Launch status";
    elements.launchStatusCopy.textContent = flipperReady
        ? publicApp.flipperRequiredReady || "Flipper launch key detected. Enter the passcode."
        : publicApp.flipperRequiredMissing || "Launch this with the Flipper first.";
    elements.lockHint.textContent = flipperReady
        ? publicApp.passcodeHint || ""
        : publicApp.flipperRequiredMissing || "Launch this with the Flipper first.";

    elements.passcodeInput.disabled = !flipperReady || state.unlocking;
    elements.openButton.disabled = !flipperReady || state.unlocking;
}

function renderDailyMessage() {
    const dailyMessage = getDailyMessage();
    const content = state.content || {};

    elements.dailyNoteDate.textContent = formatDate(new Date(), {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    });
    elements.dailyNoteTitle.textContent = dailyMessage.title;
    renderParagraphs(elements.dailyNoteBody, dailyMessage.body);
    elements.dailySpecialLabel.textContent =
        (content.dailyMessage && content.dailyMessage.specialLabel) || "Little thing for today";
    elements.dailySpecial.textContent = dailyMessage.special;
}

function renderDashboard() {
    const content = state.content || {};
    const hero = content.hero || {};
    const trip = content.trip || {};
    const reassurance = Array.isArray(content.reassurance) ? content.reassurance : [];
    const openWhen = Array.isArray(content.openWhen) ? content.openWhen : [];

    elements.heroEyebrow.textContent = hero.eyebrow || "";
    elements.heroTitle.textContent = hero.title || "";
    elements.heroIntro.textContent = hero.intro || "";
    elements.tripLabel.textContent = trip.label || "";
    elements.returnDate.textContent = formatDate(trip.returnDate, {
        month: "long",
        day: "numeric",
        year: "numeric",
    });
    elements.randomNoteButton.textContent =
        getPublicApp().randomNoteButtonLabel || "Show me a note";
    renderDailyMessage();
    elements.footerNote.textContent = content.footerNote || "";

    elements.reassuranceList.innerHTML = "";
    reassurance.forEach((line) => {
        const item = document.createElement("li");
        item.textContent = line;
        elements.reassuranceList.appendChild(item);
    });

    elements.openWhenGrid.innerHTML = "";
    openWhen.forEach((note, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "note-card";
        button.style.setProperty("--tilt", `${index % 2 === 0 ? -1 : 1}deg`);

        const trigger = document.createElement("p");
        trigger.className = "note-trigger";
        trigger.textContent = note.trigger;

        const title = document.createElement("h3");
        title.textContent = note.title;

        const preview = document.createElement("p");
        preview.textContent = note.preview;

        button.appendChild(trigger);
        button.appendChild(title);
        button.appendChild(preview);
        button.addEventListener("click", () => openNote(note));
        elements.openWhenGrid.appendChild(button);
    });
}

function animateDashboard() {
    const revealItems = Array.from(document.querySelectorAll(".reveal"));
    revealItems.forEach((item, index) => {
        item.classList.remove("is-visible");
        item.style.transitionDelay = `${120 * index}ms`;
        requestAnimationFrame(() => {
            item.classList.add("is-visible");
        });
    });
}

function unlockApp() {
    renderDashboard();
    elements.lockForm.reset();
    elements.lockScreen.classList.add("hidden");
    elements.dashboard.classList.remove("hidden");
    animateDashboard();
}

function openNote(note) {
    state.modalOpen = true;
    elements.modalTrigger.textContent = note.trigger;
    elements.modalTitle.textContent = note.title;
    elements.modalPreview.textContent = note.preview;
    renderParagraphs(elements.modalBody, note.body);

    elements.modal.classList.remove("hidden");
    elements.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    elements.closeModalButton.focus();
}

function closeModal() {
    state.modalOpen = false;
    elements.modal.classList.add("hidden");
    elements.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
}

function openRandomNote() {
    const content = state.content || {};
    const notes = Array.isArray(content.openWhen) ? content.openWhen : [];
    if (!notes.length) {
        return;
    }

    const randomIndex = Math.floor(Math.random() * notes.length);
    openNote(notes[randomIndex]);
}

async function handlePasscodeSubmit(event) {
    event.preventDefault();

    if (!state.flipperKey) {
        renderLockScreen();
        elements.lockError.textContent = getPublicApp().flipperRequiredMissing || "Launch this with the Flipper.";
        return;
    }

    const enteredPasscode = elements.passcodeInput.value.trim();
    if (!enteredPasscode) {
        return;
    }

    state.unlocking = true;
    elements.lockError.textContent = "";
    renderLockScreen();

    try {
        state.content = await decryptPrivateContent(enteredPasscode, state.flipperKey);
        unlockApp();
    } catch (_error) {
        state.content = null;
        elements.lockError.textContent =
            getPublicApp().passcodeError || "That passcode did not unlock it.";
        elements.passcodeInput.select();
    } finally {
        state.unlocking = false;
        if (!elements.lockScreen.classList.contains("hidden")) {
            renderLockScreen();
        }
    }
}

function wireEvents() {
    elements.lockForm.addEventListener("submit", (event) => {
        void handlePasscodeSubmit(event);
    });
    elements.randomNoteButton.addEventListener("click", openRandomNote);
    elements.closeModalButton.addEventListener("click", closeModal);
    elements.modal.addEventListener("click", (event) => {
        if (event.target === elements.modal) {
            closeModal();
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && state.modalOpen) {
            closeModal();
        }
    });
}

function init() {
    renderLockScreen();
    wireEvents();

    if (state.flipperKey) {
        elements.passcodeInput.focus();
    }
}

init();
