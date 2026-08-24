console.log('[gemini-obs] ===============================');
console.log('[gemini-obs] CONTENT SCRIPT LOADED');
console.log('[gemini-obs] URL:', location.href);
console.log('[gemini-obs] ===============================');

(() => {
    console.log('[gemini-obs] IIFE STARTED');
    console.log('[gemini-obs] VERSION = DOM-V6-ACCOUNT-FIX');

    // ============================================================
    // CONFIG
    // ============================================================

    const cfg = window.GEMINI_OBS_CONFIG;

    console.log('[gemini-obs] CONFIG:', cfg);

    if (!cfg?.apiBaseUrl) {
        console.error(
            '[gemini-obs] STOPPED: apiBaseUrl is missing'
        );
        return;
    }

    // ============================================================
    // EMAIL EXTRACTION
    // ============================================================

    const EMAIL_REGEX =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const extractEmail = (value) => {
        if (typeof value !== 'string') {
            return null;
        }

        const matches = value.match(
            /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
        );

        if (!matches) {
            return null;
        }

        for (const match of matches) {
            const email = match.trim().toLowerCase();

            if (EMAIL_REGEX.test(email)) {
                return email;
            }
        }

        return null;
    };

    // ============================================================
    // GEMINI ACCOUNT DETECTION
    // ============================================================

    const detectGeminiAccountEmail = () => {
        console.log(
            '[gemini-obs] Searching for Google Account element...'
        );

        // --------------------------------------------------------
        // PRIMARY SOURCE
        // --------------------------------------------------------

        const accountElements =
            document.querySelectorAll(
                '[aria-label^="Google Account" i]'
            );

        for (const element of accountElements) {
            const ariaLabel =
                element.getAttribute('aria-label');

            console.log(
                '[gemini-obs] Google Account candidate:',
                ariaLabel
            );

            const email = extractEmail(ariaLabel);

            if (email) {
                console.log(
                    '[gemini-obs] REAL GOOGLE ACCOUNT:',
                    email
                );

                return email;
            }
        }

        // --------------------------------------------------------
        // FALLBACK: GOOGLE ACCOUNT ATTRIBUTES
        // --------------------------------------------------------

        const accountCandidates =
            document.querySelectorAll(
                '[aria-label*="Google Account" i], ' +
                '[data-tooltip*="Google Account" i], ' +
                '[title*="Google Account" i]'
            );

        for (const element of accountCandidates) {
            const values = [
                element.getAttribute('aria-label'),
                element.getAttribute('data-tooltip'),
                element.getAttribute('title')
            ];

            for (const value of values) {
                const email = extractEmail(value);

                if (email) {
                    console.log(
                        '[gemini-obs] Account detected:',
                        email
                    );

                    return email;
                }
            }
        }

        // --------------------------------------------------------
        // ACCOUNT MENU
        // --------------------------------------------------------

        const menuElements = [
            ...document.querySelectorAll(
                '[role="menu"] *, ' +
                '[role="dialog"] *, ' +
                '[class*="account" i] *, ' +
                '[class*="profile" i] *'
            )
        ];

        for (const element of menuElements) {
            const text =
                element.textContent?.trim() || '';

            const email = extractEmail(text);

            if (email) {
                console.log(
                    '[gemini-obs] Account detected from menu:',
                    email
                );

                return email;
            }
        }

        console.log(
            '[gemini-obs] No Google account email found yet.'
        );

        return null;
    };

    // ============================================================
    // ACCOUNT STATE
    // ============================================================

    let employeeEmail = null;

    // Prevent the collector from being initialized twice.
    let collectorInitialized = false;

    // ============================================================
    // WAIT FOR ACCOUNT
    // ============================================================

    const detectAccountWithRetry = (
        attempts = 30,
        delay = 1000
    ) => {
        const detectedEmail =
            detectGeminiAccountEmail();

        if (detectedEmail) {
            employeeEmail =
                detectedEmail.toLowerCase();

            console.log(
                '[gemini-obs] ================================='
            );

            console.log(
                '[gemini-obs] REAL GEMINI ACCOUNT DETECTED'
            );

            console.log(
                '[gemini-obs] Employee:',
                employeeEmail
            );

            console.log(
                '[gemini-obs] ================================='
            );

            initializeCollector();

            return;
        }

        if (attempts <= 0) {
            console.error(
                '[gemini-obs] COULD NOT DETECT GEMINI ACCOUNT'
            );

            return;
        }

        console.log(
            `[gemini-obs] Waiting for Gemini account... (${attempts} attempts remaining)`
        );

        setTimeout(() => {
            detectAccountWithRetry(
                attempts - 1,
                delay
            );
        }, delay);
    };

    // ============================================================
    // INITIALIZE COLLECTOR
    // ============================================================

    const initializeCollector = () => {

        if (collectorInitialized) {
            console.warn(
                '[gemini-obs] Collector already initialized'
            );

            return;
        }

        collectorInitialized = true;

        // ========================================================
        // SESSION
        // ========================================================

        const sessionId =
            crypto.randomUUID();

        let activeInteraction = null;
        let lastPromptSignature = null;
        let completionTimer = null;

        console.log(
            '[gemini-obs] Tracking employee:',
            employeeEmail
        );

        console.log(
            '[gemini-obs] Session:',
            sessionId
        );

        // ========================================================
        // SEND EVENT
        // ========================================================

        const send = (event) => {

            if (!employeeEmail) {
                console.error(
                    '[gemini-obs] EVENT BLOCKED: No employee email'
                );

                return;
            }

            // IMPORTANT:
            // employeeEmail is explicitly included in BOTH
            // the outer message and the event.
            //
            // This prevents the background script from having
            // to guess which account generated the event.

            const payload = {

                type: 'GEMINI_USAGE_EVENT',

                employeeEmail: employeeEmail,

                event: {

                    email: employeeEmail,

                    employeeEmail: employeeEmail,

                    department:
                        cfg.department ?? null,

                    role:
                        cfg.role ?? null,

                    session_id:
                        sessionId,

                    occurred_at:
                        new Date().toISOString(),

                    ...event
                }
            };

            console.log(
                '[gemini-obs] ================================='
            );

            console.log(
                '[gemini-obs] SENDING EVENT'
            );

            console.log(
                '[gemini-obs] employeeEmail:',
                employeeEmail
            );

            console.log(
                '[gemini-obs] event_type:',
                event.event_type
            );

            console.log(
                '[gemini-obs] payload:',
                payload
            );

            console.log(
                '[gemini-obs] ================================='
            );

            try {

                chrome.runtime.sendMessage(
                    payload,
                    (response) => {

                        if (chrome.runtime.lastError) {

                            console.error(
                                '[gemini-obs] SEND ERROR:',
                                chrome.runtime.lastError.message
                            );

                            return;
                        }

                        console.log(
                            '[gemini-obs] BACKGROUND RESPONSE:',
                            response
                        );
                    }
                );

            } catch (error) {

                console.error(
                    '[gemini-obs] SEND EXCEPTION:',
                    error
                );
            }
        };

        // ========================================================
        // FIND PROMPT INPUT
        // ========================================================

        const findPromptInput = () => {

            const candidates = [
                ...document.querySelectorAll(
                    'textarea, [contenteditable="true"], [role="textbox"]'
                )
            ];

            const visible =
                candidates.filter(el => {

                    const rect =
                        el.getBoundingClientRect();

                    const style =
                        getComputedStyle(el);

                    return (
                        rect.width > 0 &&
                        rect.height > 0 &&
                        style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        !el.disabled
                    );
                });

            const textarea =
                visible.find(
                    el =>
                        el.tagName === 'TEXTAREA'
                );

            if (textarea) {
                return textarea;
            }

            const editable =
                visible.find(
                    el =>
                        el.getAttribute(
                            'contenteditable'
                        ) === 'true'
                );

            if (editable) {
                return editable;
            }

            return visible[0] || null;
        };

        // ========================================================
        // GET INPUT TEXT
        // ========================================================

        const getInputText = (input) => {

            if (!input) {
                return '';
            }

            if (
                input instanceof HTMLTextAreaElement ||
                input instanceof HTMLInputElement
            ) {
                return input.value || '';
            }

            return (
                input.innerText ||
                input.textContent ||
                ''
            );
        };

        // ========================================================
        // START INTERACTION
        // ========================================================

        const startInteraction = () => {

            const input =
                findPromptInput();

            if (!input) {
                console.warn(
                    '[gemini-obs] No prompt input found'
                );

                return;
            }

            const prompt =
                getInputText(input).trim();

            if (!prompt) {
                console.warn(
                    '[gemini-obs] Empty prompt'
                );

                return;
            }

            const signature =
                `${prompt.length}:${prompt}`;

            if (
                activeInteraction &&
                activeInteraction.signature === signature
            ) {
                console.log(
                    '[gemini-obs] Duplicate interaction ignored'
                );

                return;
            }

            if (
                signature === lastPromptSignature &&
                !activeInteraction
            ) {
                console.log(
                    '[gemini-obs] Same prompt already processed'
                );

                return;
            }

            lastPromptSignature =
                signature;

            const interactionId =
                crypto.randomUUID();

            const startedAt =
                Date.now();

            activeInteraction = {
                interactionId,
                startedAt,
                signature,
                promptLength:
                    prompt.length
            };

            send({

                event_type:
                    'interaction_started',

                interaction_id:
                    interactionId,

                prompt_length:
                    prompt.length,

                metadata: {

                    collector:
                        'dom-v6',

                    prompt_capture:
                        'pre-submit'
                }
            });
        };

        // ========================================================
        // GEMINI RESPONSE
        // ========================================================

        const getGeminiResponseText = () => {

            const candidates = [
                ...document.querySelectorAll(
                    '[data-message-author-role="model"]'
                ),

                ...document.querySelectorAll(
                    '[data-message-author-role="assistant"]'
                ),

                ...document.querySelectorAll(
                    '.model-response-text'
                )
            ];

            const visible =
                candidates.filter(el => {

                    const rect =
                        el.getBoundingClientRect();

                    return (
                        rect.width > 0 &&
                        rect.height > 0
                    );
                });

            if (!visible.length) {
                return '';
            }

            const latest =
                visible[visible.length - 1];

            return (
                latest.innerText ||
                latest.textContent ||
                ''
            ).trim();
        };

        // ========================================================
        // COMPLETE INTERACTION
        // ========================================================

        const completeInteraction = () => {

            if (!activeInteraction) {
                return;
            }

            const interaction =
                activeInteraction;

            const response =
                getGeminiResponseText();

            const latency =
                Date.now() -
                interaction.startedAt;

            const responseElements = [
                ...document.querySelectorAll(
                    'message-content .markdown.markdown-main-panel.md-content'
                )
            ];

            const responseElement =
                responseElements[
                    responseElements.length - 1
                ];

            const responseText =
                responseElement?.innerText?.trim() ||
                response;

            const responseLength =
                responseText.length;

            send({

                event_type:
                    'interaction_completed',

                interaction_id:
                    interaction.interactionId,

                prompt_length:
                    interaction.promptLength,

                response_length:
                    responseLength,

                latency_ms:
                    latency,

                metadata: {

                    collector:
                        'dom-v6',

                    completion_detection:
                        'mutation-idle'
                }
            });

            activeInteraction = null;

            clearTimeout(
                completionTimer
            );

            completionTimer = null;
        };

        // ========================================================
        // ENTER
        // ========================================================

        document.addEventListener(
            'keydown',
            event => {

                if (event.key !== 'Enter') {
                    return;
                }

                if (event.shiftKey) {
                    return;
                }

                const input =
                    findPromptInput();

                const targetIsInput =
                    input &&
                    (
                        event.target === input ||
                        input.contains?.(event.target)
                    );

                if (!targetIsInput) {
                    return;
                }

                startInteraction();
            },
            true
        );

        // ========================================================
        // SEND BUTTON
        // ========================================================

        document.addEventListener(
            'click',
            event => {

                const button =
                    event.target?.closest?.(
                        'button'
                    );

                if (!button) {
                    return;
                }

                const combined = [
                    button.getAttribute('aria-label'),
                    button.getAttribute('title'),
                    button.innerText
                ]
                    .filter(Boolean)
                    .join(' ');

                const isSend =
                    /send/i.test(combined) &&
                    !button.disabled;

                if (!isSend) {
                    return;
                }

                startInteraction();
            },
            true
        );

        // ========================================================
        // MUTATION OBSERVER
        // ========================================================

        const observer =
            new MutationObserver(() => {

                if (!activeInteraction) {
                    return;
                }

                clearTimeout(
                    completionTimer
                );

                completionTimer =
                    setTimeout(() => {

                        completeInteraction();

                    }, 2500);
            });

        observer.observe(
            document.documentElement,
            {
                childList: true,
                subtree: true,
                characterData: true
            }
        );

        // ========================================================
        // SESSION START
        // ========================================================

        send({

            event_type:
                'session_started',

            interaction_id:
                crypto.randomUUID(),

            metadata: {

                collector:
                    'dom-v6',

                url_host:
                    location.host
            }
        });

        console.log(
            '[gemini-obs] ================================='
        );

        console.log(
            '[gemini-obs] GEMINI OBSERVER READY'
        );

        console.log(
            '[gemini-obs] Employee:',
            employeeEmail
        );

        console.log(
            '[gemini-obs] Session:',
            sessionId
        );

        console.log(
            '[gemini-obs] ================================='
        );
    };

    // ============================================================
    // START
    // ============================================================

    detectAccountWithRetry();

})();