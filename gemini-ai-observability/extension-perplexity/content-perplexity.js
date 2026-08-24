console.log('[perplexity-obs] ===============================');
console.log('[perplexity-obs] CONTENT SCRIPT LOADED');
console.log('[perplexity-obs] URL:', location.href);
console.log('[perplexity-obs] ===============================');

(() => {

    console.log('[perplexity-obs] IIFE STARTED');
    console.log('[perplexity-obs] VERSION = DOM-V1 + TOKEN-ESTIMATION');

    // ============================================================
    // CONFIG
    // ============================================================

    const cfg = window.PERPLEXITY_OBS_CONFIG;

    console.log('[perplexity-obs] CONFIG:', cfg);

    if (!cfg?.apiBaseUrl) {
        console.error(
            '[perplexity-obs] STOPPED: apiBaseUrl is missing'
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

            const email =
                match.trim().toLowerCase();

            if (EMAIL_REGEX.test(email)) {
                return email;
            }
        }

        return null;
    };

    // ============================================================
    // PERPLEXITY ACCOUNT DETECTION
    // ============================================================

    const detectPerplexityAccountEmail = () => {

        console.log(
            '[perplexity-obs] Searching for Perplexity account...'
        );

        // --------------------------------------------------------
        // Search visible DOM attributes/text for an email
        // --------------------------------------------------------

        const elements = [
            ...document.querySelectorAll(
                '[aria-label], [title], [data-tooltip], button, a'
            )
        ];

        for (const element of elements) {

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
                        '[perplexity-obs] PERPLEXITY ACCOUNT DETECTED:',
                        email
                    );

                    return email;
                }
            }
        }

        // --------------------------------------------------------
        // Search dialogs / menus
        // --------------------------------------------------------

        const menuElements = [
            ...document.querySelectorAll(
                '[role="menu"] *, ' +
                '[role="dialog"] *, ' +
                '[data-radix-menu-content] *, ' +
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
                    '[perplexity-obs] Account detected from menu:',
                    email
                );

                return email;
            }
        }

        console.log(
            '[perplexity-obs] No Perplexity account email found yet.'
        );

        return null;
    };

    // ============================================================
    // TOKEN ESTIMATION
    // ============================================================

    const estimateTokens = (text) => {

        if (!text) {
            return 0;
        }

        /*
         * Rough token estimate.
         *
         * Approximation:
         * ~1 token per 4 characters for typical English text.
         *
         * This is NOT an official tokenizer.
         * It is intended for usage estimation only.
         */

        return Math.ceil(text.length / 4);
    };

    // ============================================================
    // ACCOUNT STATE
    // ============================================================

    let employeeEmail = null;
    let collectorInitialized = false;

    // ============================================================
    // WAIT FOR ACCOUNT
    // ============================================================

    let accountObserver = null;
    let accountDetectionStarted = false;

    const handleDetectedAccount = (detectedEmail) => {

        if (!detectedEmail) {
            return;
        }

        const normalizedEmail =
            detectedEmail.toLowerCase().trim();

        // Already detected
        if (employeeEmail === normalizedEmail) {
            return;
        }

        employeeEmail = normalizedEmail;

        console.log(
            '[perplexity-obs] ================================='
        );

        console.log(
            '[perplexity-obs] REAL PERPLEXITY ACCOUNT DETECTED'
        );

        console.log(
            '[perplexity-obs] Employee:',
            employeeEmail
        );

        console.log(
            '[perplexity-obs] ================================='
        );

        // Stop watching once we know the account
        if (accountObserver) {

            accountObserver.disconnect();

            accountObserver = null;
        }

        initializeCollector();
    };

    const detectAccountImmediately = () => {

        console.log(
            '[perplexity-obs] Checking Perplexity account immediately...'
        );

        const detectedEmail =
            detectPerplexityAccountEmail();

        if (detectedEmail) {

            handleDetectedAccount(
                detectedEmail
            );

            return true;
        }

        return false;
    };

    const waitForPerplexityAccount = () => {

        if (accountDetectionStarted) {
            return;
        }

        accountDetectionStarted = true;

        console.log(
            '[perplexity-obs] Starting immediate account detection...'
        );

        // ========================================================
        // FIRST CHECK — DO NOT WAIT
        // ========================================================

        if (detectAccountImmediately()) {
            return;
        }

        console.log(
            '[perplexity-obs] Account not present yet.'
        );

        console.log(
            '[perplexity-obs] Watching DOM for account information...'
        );

        // ========================================================
        // WATCH DOM
        // ========================================================

        accountObserver =
            new MutationObserver(() => {

                // Don't keep searching after account is found
                if (employeeEmail) {
                    return;
                }

                const detectedEmail =
                    detectPerplexityAccountEmail();

                if (detectedEmail) {

                    handleDetectedAccount(
                        detectedEmail
                    );
                }
            });

        const startObserver = () => {

            if (!document.documentElement) {

                requestAnimationFrame(
                    startObserver
                );

                return;
            }

            accountObserver.observe(
                document.documentElement,
                {
                    childList: true,
                    subtree: true,
                    characterData: true,
                    attributes: true
                }
            );

            // Check once more after observer is attached
            detectAccountImmediately();
        };

        startObserver();
    };

    // ============================================================
    // INITIALIZE COLLECTOR
    // ============================================================

    const initializeCollector = () => {

        if (collectorInitialized) {

            console.warn(
                '[perplexity-obs] Collector already initialized'
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

        let lastKnownPrompt = '';

        let completionTimer = null;

        // Prevent Enter + Send button from firing twice
        let lastInteractionStartedAt = 0;

        console.log(
            '[perplexity-obs] Tracking employee:',
            employeeEmail
        );

        console.log(
            '[perplexity-obs] Session:',
            sessionId
        );

        // ========================================================
        // SEND EVENT
        // ========================================================

        const send = (event) => {

            if (!employeeEmail) {

                console.error(
                    '[perplexity-obs] EVENT BLOCKED: No employee email'
                );

                return;
            }

            const payload = {

                type:
                    'PERPLEXITY_USAGE_EVENT',

                provider:
                    'perplexity',

                product:
                    'perplexity',

                employeeEmail:
                    employeeEmail,

                event: {

                    email:
                        employeeEmail,

                    employeeEmail:
                        employeeEmail,

                    provider:
                        'perplexity',

                    product:
                        'perplexity',

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
                '[perplexity-obs] ==============================='
            );

            console.log(
                '[perplexity-obs] SENDING EVENT'
            );

            console.log(
                '[perplexity-obs] employeeEmail:',
                employeeEmail
            );

            console.log(
                '[perplexity-obs] event_type:',
                event.event_type
            );

            console.log(
                '[perplexity-obs] payload:',
                payload
            );

            console.log(
                '[perplexity-obs] ==============================='
            );

            chrome.runtime.sendMessage(payload)
                .then(response => {

                    console.log(
                        '[perplexity-obs] BACKGROUND RESPONSE:',
                        response
                    );

                    if (!response?.accepted) {

                        console.error(
                            '[perplexity-obs] EVENT REJECTED:',
                            response
                        );

                        return;
                    }

                    console.log(
                        '[perplexity-obs] EVENT ACCEPTED BY SERVICE WORKER'
                    );
                })

                .catch(error => {

                    console.error(
                        '[perplexity-obs] SERVICE WORKER ERROR:',
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

            // Prefer the Perplexity composer
            const composer =
                visible.find(el =>
                    el.tagName === 'TEXTAREA' ||
                    el.getAttribute('contenteditable') === 'true'
                );

            return composer ||
                visible[0] ||
                null;
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

            // Prevent Enter + Send click from creating two events
            if (
                now - lastInteractionStartedAt < 500
            ) {

                console.log(
                    '[perplexity-obs] Duplicate submit ignored'
                );

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

            // Fallback to cached prompt
            if (!prompt) {

                prompt =
                    lastKnownPrompt;
            }

            if (!prompt) {

                console.warn(
                    '[perplexity-obs] Could not capture prompt'
                );

                return;
            }

            console.log(
                '[perplexity-obs] ================================='
            );

            console.log(
                '[perplexity-obs] PROMPT CAPTURED'
            );

            console.log(
                '[perplexity-obs] Prompt:',
                prompt
            );

            console.log(
                '[perplexity-obs] Prompt length:',
                prompt.length
            );

            // ====================================================
            // ESTIMATE PROMPT TOKENS
            // ====================================================

            const promptTokens =
                estimateTokens(prompt);

            console.log(
                '[perplexity-obs] Estimated prompt tokens:',
                promptTokens
            );

            console.log(
                '[perplexity-obs] ================================='
            );

            const signature =
                `${prompt.length}:${prompt}`;

            // Same interaction already active
            if (
                activeInteraction &&
                activeInteraction.signature === signature
            ) {

                console.log(
                    '[perplexity-obs] Duplicate interaction ignored'
                );

                return;
            }

            // Same prompt already completed
            if (
                signature === lastPromptSignature &&
                !activeInteraction
            ) {

                console.log(
                    '[perplexity-obs] Same prompt already processed'
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

                prompt,

                promptLength:
                    prompt.length,

                promptTokens:
                    promptTokens
            };

            send({

                event_type:
                    'interaction_started',

                interaction_id:
                    interactionId,

                prompt_length:
                    prompt.length,

                prompt_tokens:
                    promptTokens,

                metadata: {

                    collector:
                        'dom-v1',

                    prompt_capture:
                        'pre-submit',

                    token_estimation:
                        'characters-divided-by-4'
                }
            });

            // Clear cached prompt
            lastKnownPrompt = '';
        };

        // ========================================================
        // PERPLEXITY RESPONSE
        // ========================================================

        const getPerplexityResponseText = () => {

            // Perplexity does not expose a stable
            // `data-message-author-role`-style attribute like
            // ChatGPT does, so we try several candidate selectors
            // in order of specificity. These may need to be
            // re-verified against the live DOM if Perplexity
            // changes its markup.
            const selectorCandidates = [
                '[data-testid*="answer" i]',
                '[class*="answer" i] .prose',
                '.prose',
                '[class*="markdown" i]'
            ];

            let candidates = [];

            for (const selector of selectorCandidates) {

                candidates = [
                    ...document.querySelectorAll(selector)
                ];

                if (candidates.length) {
                    break;
                }
            }

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
                getPerplexityResponseText();

            const latency =
                Date.now() -
                interaction.startedAt;

            const responseLength =
                response.length;

            // ====================================================
            // ESTIMATE RESPONSE TOKENS
            // ====================================================

            const responseTokens =
                estimateTokens(response);

            // ====================================================
            // ESTIMATE TOTAL TOKENS
            // ====================================================

            const totalTokens =
                interaction.promptTokens +
                responseTokens;

            console.log(
                '[perplexity-obs] COMPLETING INTERACTION'
            );

            console.log(
                '[perplexity-obs] Interaction ID:',
                interaction.interactionId
            );

            console.log(
                '[perplexity-obs] Response length:',
                responseLength
            );

            console.log(
                '[perplexity-obs] Latency:',
                latency
            );

            console.log(
                '[perplexity-obs] Estimated prompt tokens:',
                interaction.promptTokens
            );

            console.log(
                '[perplexity-obs] Estimated response tokens:',
                responseTokens
            );

            console.log(
                '[perplexity-obs] Estimated total tokens:',
                totalTokens
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

                prompt_tokens:
                    interaction.promptTokens,

                response_tokens:
                    responseTokens,

                total_tokens:
                    totalTokens,

                latency_ms:
                    latency,

                metadata: {

                    collector:
                        'dom-v1',

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
                    event.target?.closest?.('button');

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

                // Perplexity's submit control is more often
                // labeled "Submit" or "Ask" rather than "Send".
                const isSend =
                    /send|submit|ask/i.test(combined) &&
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

                        const response =
                            getPerplexityResponseText();

                        // Don't complete until a response exists.
                        if (!response) {
                            return;
                        }

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
                    'dom-v1',

                url_host:
                    location.host
            }
        });

        console.log(
            '[perplexity-obs] ================================='
        );

        console.log(
            '[perplexity-obs] PERPLEXITY OBSERVER READY'
        );

        console.log(
            '[perplexity-obs] Employee:',
            employeeEmail
        );

        console.log(
            '[perplexity-obs] Session:',
            sessionId
        );

        console.log(
            '[perplexity-obs] Token estimation:',
            'ENABLED'
        );

        console.log(
            '[perplexity-obs] ================================='
        );
    };

    // ============================================================
    // START
    // ============================================================

    waitForPerplexityAccount();

})();