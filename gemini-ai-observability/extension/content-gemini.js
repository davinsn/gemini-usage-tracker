console.log('[gemini-obs] ===============================');
console.log('[gemini-obs] CONTENT SCRIPT LOADED');
console.log('[gemini-obs] URL:', location.href);
console.log('[gemini-obs] ===============================');

(() => {
    console.log('[gemini-obs] IIFE STARTED');

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
    // EMAIL DETECTION
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

        if (!matches?.length) {
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

    const detectGeminiAccountEmail = () => {

        // --------------------------------------------------------
        // 1. Look for Google account/profile elements
        // --------------------------------------------------------

        const selectors = [
            '[aria-label*="Google Account" i]',
            '[aria-label*="account" i]',
            '[data-tooltip*="Google Account" i]',
            '[data-tooltip*="account" i]',
            '[title*="Google Account" i]',
            '[title*="account" i]'
        ];

        for (const selector of selectors) {

            const elements =
                document.querySelectorAll(selector);

            for (const element of elements) {

                const values = [
                    element.getAttribute('aria-label'),
                    element.getAttribute('data-tooltip'),
                    element.getAttribute('title'),
                    element.textContent
                ];

                for (const value of values) {

                    const email =
                        extractEmail(value);

                    if (email) {
                        console.log(
                            '[gemini-obs] Account detected from profile element:',
                            email
                        );

                        return email;
                    }
                }
            }
        }

        // --------------------------------------------------------
        // 2. Inspect buttons near the top of the Gemini page
        // --------------------------------------------------------

        const topElements = [
            ...document.querySelectorAll(
                'button, [role="button"], a'
            )
        ].filter(element => {

            const rect =
                element.getBoundingClientRect();

            return (
                rect.top >= 0 &&
                rect.top < 200 &&
                rect.width > 0 &&
                rect.height > 0
            );
        });

        for (const element of topElements) {

            const values = [
                element.getAttribute('aria-label'),
                element.getAttribute('title'),
                element.getAttribute('data-tooltip'),
                element.textContent
            ];

            for (const value of values) {

                const email =
                    extractEmail(value);

                if (email) {
                    console.log(
                        '[gemini-obs] Account detected from top navigation:',
                        email
                    );

                    return email;
                }
            }
        }

        // --------------------------------------------------------
        // 3. Look through elements that Google commonly uses
        // --------------------------------------------------------

        const possibleAccountElements = [
            ...document.querySelectorAll(
                '[class*="account" i], ' +
                '[class*="profile" i], ' +
                '[class*="avatar" i]'
            )
        ];

        for (const element of possibleAccountElements) {

            const values = [
                element.getAttribute('aria-label'),
                element.getAttribute('title'),
                element.getAttribute('data-tooltip'),
                element.textContent
            ];

            for (const value of values) {

                const email =
                    extractEmail(value);

                if (email) {
                    console.log(
                        '[gemini-obs] Account detected from account/profile element:',
                        email
                    );

                    return email;
                }
            }
        }

        return null;
    };

    // ============================================================
    // WAIT FOR GOOGLE ACCOUNT INFORMATION
    // ============================================================

    let employeeEmail = null;

    const detectAccountWithRetry = (
        attempts = 20,
        delay = 1000
    ) => {

        employeeEmail =
            detectGeminiAccountEmail();

        if (employeeEmail) {

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
                '[gemini-obs] STOPPED: Could not detect Gemini account email.'
            );

            console.error(
                '[gemini-obs] Make sure you are signed into Gemini.'
            );

            return;
        }

        console.log(
            `[gemini-obs] Waiting for Google account information... (${attempts} attempts remaining)`
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

        // ========================================================
        // SESSION STATE
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

            const payload = {

                type:
                    'GEMINI_USAGE_EVENT',

                config: {
                    ...cfg,

                    employeeEmail
                },

                event: {

                    email:
                        employeeEmail,

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
                '[gemini-obs] EVENT →',
                event.event_type,
                payload
            );

            try {

                chrome.runtime.sendMessage(
                    payload,
                    (response) => {

                        if (
                            chrome.runtime.lastError
                        ) {

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
        // INPUT DETECTION
        // ========================================================

        const findPromptInput = () => {

            const candidates = [
                ...document.querySelectorAll(
                    'textarea, [contenteditable="true"], [role="textbox"]'
                )
            ];

            const visible =
                candidates.filter((el) => {

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
        // READ INPUT
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

            console.log(
                '[gemini-obs] ================================='
            );

            console.log(
                '[gemini-obs] START INTERACTION'
            );

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

            console.log(
                '[gemini-obs] Prompt:',
                prompt
            );

            if (!prompt) {

                console.warn(
                    '[gemini-obs] Empty prompt — ignoring'
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
                    '[gemini-obs] Interaction already active — ignoring duplicate'
                );

                return;
            }

            if (
                signature === lastPromptSignature &&
                !activeInteraction
            ) {

                console.log(
                    '[gemini-obs] Same prompt already processed — ignoring'
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

            console.log(
                '[gemini-obs] NEW INTERACTION:',
                activeInteraction
            );

            send({

                event_type:
                    'interaction_started',

                interaction_id:
                    interactionId,

                prompt_length:
                    prompt.length,

                metadata: {

                    collector:
                        'dom-v4',

                    prompt_capture:
                        'pre-submit'
                }
            });

            console.log(
                '[gemini-obs] interaction_started SENT:',
                interactionId
            );
        };

        // ========================================================
        // GEMINI RESPONSE TEXT
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
                candidates.filter((el) => {

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

            console.log(
                '[gemini-obs] COMPLETE INTERACTION'
            );

            console.log(
                '[gemini-obs] Interaction ID:',
                interaction.interactionId
            );

            console.log(
                '[gemini-obs] Latency:',
                latency,
                'ms'
            );

            console.log(
                '[gemini-obs] Response length:',
                responseLength
            );

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
                        'dom-v4',

                    completion_detection:
                        'mutation-idle'
                }
            });

            activeInteraction = null;

            clearTimeout(
                completionTimer
            );

            completionTimer = null;

            console.log(
                '[gemini-obs] Interaction state cleared'
            );
        };

        // ========================================================
        // ENTER DETECTION
        // ========================================================

        document.addEventListener(
            'keydown',
            (event) => {

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
            (event) => {

                const button =
                    event.target?.closest?.(
                        'button'
                    );

                if (!button) {
                    return;
                }

                const ariaLabel =
                    button.getAttribute(
                        'aria-label'
                    ) || '';

                const title =
                    button.getAttribute(
                        'title'
                    ) || '';

                const text =
                    button.innerText || '';

                const combined =
                    `${ariaLabel} ${title} ${text}`;

                const isSend =
                    /send/i.test(combined) &&
                    !button.disabled;

                if (!isSend) {
                    return;
                }

                console.log(
                    '[gemini-obs] SEND BUTTON CLICK'
                );

                startInteraction();
            },
            true
        );

        // ========================================================
        // RESPONSE MUTATION DETECTION
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

        console.log(
            '[gemini-obs] MutationObserver started'
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
                    'dom-v4',

                url_host:
                    location.host
            }
        });

        console.log(
            '[gemini-obs] session_started SENT'
        );

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
    // START ACCOUNT DETECTION
    // ============================================================

    detectAccountWithRetry();

})();