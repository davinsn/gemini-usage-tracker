console.log('[gemini-obs] ===============================');
console.log('[gemini-obs] CONTENT SCRIPT LOADED');
console.log('[gemini-obs] URL:', location.href);
console.log('[gemini-obs] ===============================');

(() => {
    console.log('[gemini-obs] IIFE STARTED');
    console.log('[gemini-obs] VERSION = DOM-V8-TOKEN-ESTIMATE');

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
    // TOKEN ESTIMATION
    // ============================================================
    // Rough estimate:
    // ~4 characters = ~1 token
    //
    // This is an estimate only.
    // Actual Gemini tokenization can differ.
    // ============================================================

    const estimateTokens = (text) => {
        if (typeof text !== 'string' || !text.length) {
            return 0;
        }

        return Math.ceil(text.length / 4);
    };

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

            const email =
                extractEmail(ariaLabel);

            if (email) {

                console.log(
                    '[gemini-obs] REAL GOOGLE ACCOUNT:',
                    email
                );

                return email;
            }
        }

        // --------------------------------------------------------
        // FALLBACK ATTRIBUTES
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

                const email =
                    extractEmail(value);

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
        // ACCOUNT MENU / DIALOG
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

            const email =
                extractEmail(text);

            if (email) {

                console.log(
                    '[gemini-obs] Account detected from menu:',
                    email
                );

                return email;
            }
        }

        return null;
    };

    // ============================================================
    // ACCOUNT STATE
    // ============================================================

    let employeeEmail = null;
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

        let lastKnownPrompt = '';

        let completionTimer = null;

        // Prevent Enter + Send button duplication
        let lastInteractionStartedAt = 0;

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

            const payload = {

                type: 'GEMINI_USAGE_EVENT',

                provider: 'google',

                product: 'gemini',

                employeeEmail: employeeEmail,

                event: {

                    email: employeeEmail,

                    employeeEmail: employeeEmail,

                    provider: 'google',

                    product: 'gemini',

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
                '[gemini-obs] EVENT:',
                event.event_type
            );

            chrome.runtime.sendMessage(
                payload
            )
            .then(response => {

                if (!response?.accepted) {

                    console.error(
                        '[gemini-obs] EVENT REJECTED:',
                        response
                    );

                    return;
                }

                console.log(
                    '[gemini-obs] EVENT ACCEPTED'
                );
            })
            .catch(error => {

                console.error(
                    '[gemini-obs] SERVICE WORKER ERROR:',
                    error
                );
            });
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

            const now = Date.now();

            // Prevent Enter + Send click
            if (
                now - lastInteractionStartedAt < 500
            ) {

                return;
            }

            lastInteractionStartedAt = now;

            const input =
                findPromptInput();

            let prompt = '';

            // Try live input
            if (input) {

                prompt =
                    getInputText(input).trim();
            }

            // Fallback
            if (!prompt) {

                prompt =
                    lastKnownPrompt;
            }

            if (!prompt) {

                console.warn(
                    '[gemini-obs] Could not capture prompt'
                );

                return;
            }

            // ====================================================
            // ESTIMATE PROMPT TOKENS
            // ====================================================

            const promptTokens =
                estimateTokens(prompt);

            console.log(
                '[gemini-obs] Prompt captured:',
                prompt.length,
                'chars'
            );

            console.log(
                '[gemini-obs] Estimated prompt tokens:',
                promptTokens
            );

            const signature =
                `${prompt.length}:${prompt}`;

            // Same interaction
            if (
                activeInteraction &&
                activeInteraction.signature === signature
            ) {

                return;
            }

            // Same prompt already completed
            if (
                signature === lastPromptSignature &&
                !activeInteraction
            ) {

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

                prompt,

                promptLength:
                    prompt.length,

                promptTokens:
                    promptTokens
            };

            // ====================================================
            // SEND START EVENT
            // ====================================================

            send({

                event_type:
                    'interaction_started',

                interaction_id:
                    interactionId,

                prompt_length:
                    prompt.length,

                prompt_tokens:
                    promptTokens,

                estimated_tokens:
                    promptTokens,

                metadata: {

                    collector:
                        'dom-v8',

                    prompt_capture:
                        'pre-submit',

                    token_estimation:
                        'characters-divided-by-4'
                }
            });

            lastKnownPrompt = '';
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

            // ====================================================
            // TOKEN ESTIMATION
            // ====================================================

            const promptTokens =
                interaction.promptTokens || 0;

            const completionTokens =
                estimateTokens(responseText);

            const estimatedTokens =
                promptTokens +
                completionTokens;

            // ====================================================
            // LOG TOKEN DATA
            // ====================================================

            console.log(
                '[gemini-obs] ==============================='
            );

            console.log(
                '[gemini-obs] INTERACTION COMPLETED'
            );

            console.log(
                '[gemini-obs] Prompt characters:',
                interaction.promptLength
            );

            console.log(
                '[gemini-obs] Response characters:',
                responseLength
            );

            console.log(
                '[gemini-obs] Estimated prompt tokens:',
                promptTokens
            );

            console.log(
                '[gemini-obs] Estimated completion tokens:',
                completionTokens
            );

            console.log(
                '[gemini-obs] Estimated total tokens:',
                estimatedTokens
            );

            console.log(
                '[gemini-obs] Latency:',
                latency,
                'ms'
            );

            console.log(
                '[gemini-obs] ==============================='
            );

            // ====================================================
            // SEND COMPLETION EVENT
            // ====================================================

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

                // TOKEN DATA
                prompt_tokens:
                    promptTokens,

                completion_tokens:
                    completionTokens,

                estimated_tokens:
                    estimatedTokens,

                // Optional alias
                total_tokens:
                    estimatedTokens,

                metadata: {

                    collector:
                        'dom-v8',

                    completion_detection:
                        'mutation-idle',

                    token_estimation:
                        'characters-divided-by-4'
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

                    button.getAttribute(
                        'aria-label'
                    ),

                    button.getAttribute(
                        'title'
                    ),

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
                    'dom-v8',

                url_host:
                    location.host
            }
        });

        // ========================================================
        // READY
        // ========================================================

        console.log(
            '[gemini-obs] ================================='
        );

        console.log(
            '[gemini-obs] GEMINI OBSERVER READY'
        );

        console.log(
            '[gemini-obs] Token estimation: ENABLED'
        );

        console.log(
            '[gemini-obs] Method: ~4 characters = 1 token'
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