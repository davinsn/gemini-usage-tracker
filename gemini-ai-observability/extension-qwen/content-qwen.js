console.log('[qwen-obs] ===============================');
console.log('[qwen-obs] CONTENT SCRIPT LOADED');
console.log('[qwen-obs] URL:', location.href);
console.log('[qwen-obs] ===============================');

(() => {

    console.log('[qwen-obs] IIFE STARTED');
    console.log('[qwen-obs] VERSION = DOM-V1 + TOKEN-ESTIMATION');

    // ============================================================
    // CONFIG
    // ============================================================

    const cfg = window.QWEN_OBS_CONFIG;

    console.log('[qwen-obs] CONFIG:', cfg);

    if (!cfg?.apiBaseUrl) {
        console.error(
            '[qwen-obs] STOPPED: apiBaseUrl is missing'
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
    // QWEN ACCOUNT DETECTION
    // ============================================================

    const detectQwenAccountEmail = () => {

        console.log(
            '[qwen-obs] Searching for Qwen account...'
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
                        '[qwen-obs] QWEN ACCOUNT DETECTED:',
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
                    '[qwen-obs] Account detected from menu:',
                    email
                );

                return email;
            }
        }

        console.log(
            '[qwen-obs] No Qwen account email found yet.'
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
    // ACCOUNT DETECTION VIA SESSION API (PREFERRED, IF FOUND)
    // ============================================================
    // Unlike ChatGPT (which has a well-documented internal session
    // endpoint at /api/auth/session via next-auth), Qwen Chat's
    // equivalent endpoint has NOT been confirmed here. The
    // candidates below are reasonable guesses based on common SPA
    // session-endpoint naming conventions, tried in order.
    //
    // TO CONFIRM THE REAL ENDPOINT: open chat.qwen.ai while logged
    // in, open DevTools -> Network -> XHR/Fetch, reload, and search
    // response bodies for your own email address. Replace/reorder
    // the candidates below once you find the real one — a single
    // confirmed endpoint is always more reliable than guessing.
    //
    // If none of these candidates work, this silently falls back
    // to DOM scraping, so nothing breaks — it's just less reliable.
    // ============================================================

    const SESSION_API_CANDIDATES = [
        '/api/auth/session',
        '/api/v1/users/me',
        '/api/user',
        '/api/user/profile'
    ];

    const extractEmailFromSessionPayload = (data) => {

        const candidates = [
            data?.user?.email,
            data?.email,
            data?.data?.email,
            data?.data?.user?.email
        ];

        for (const candidate of candidates) {

            if (typeof candidate !== 'string') {
                continue;
            }

            const email = candidate.trim().toLowerCase();

            if (EMAIL_REGEX.test(email)) {
                return email;
            }
        }

        return null;
    };

    const fetchAccountEmailFromSessionApi = async () => {

        for (const endpoint of SESSION_API_CANDIDATES) {

            try {

                const response = await fetch(
                    endpoint,
                    {
                        credentials: 'include',
                        headers: {
                            'Accept': 'application/json'
                        }
                    }
                );

                if (!response.ok) {
                    continue;
                }

                const contentType =
                    response.headers.get('content-type') || '';

                if (!contentType.includes('application/json')) {
                    continue;
                }

                const data = await response.json();

                const email =
                    extractEmailFromSessionPayload(data);

                if (email) {

                    console.log(
                        '[qwen-obs] Account detected via session API:',
                        endpoint,
                        email
                    );

                    return email;
                }

            } catch (error) {

                console.warn(
                    '[qwen-obs] Session API candidate failed:',
                    endpoint,
                    error
                );
            }
        }

        return null;
    };

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
            '[qwen-obs] ================================='
        );

        console.log(
            '[qwen-obs] REAL QWEN ACCOUNT DETECTED'
        );

        console.log(
            '[qwen-obs] Employee:',
            employeeEmail
        );

        console.log(
            '[qwen-obs] ================================='
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
            '[qwen-obs] Checking Qwen account immediately...'
        );

        const detectedEmail =
            detectQwenAccountEmail();

        if (detectedEmail) {

            handleDetectedAccount(
                detectedEmail
            );

            return true;
        }

        return false;
    };

    const startDomAccountDetection = () => {

        console.log(
            '[qwen-obs] Starting DOM-based account detection...'
        );

        // ========================================================
        // FIRST CHECK — DO NOT WAIT
        // ========================================================

        if (detectAccountImmediately()) {
            return;
        }

        console.log(
            '[qwen-obs] Account not present yet.'
        );

        console.log(
            '[qwen-obs] Watching DOM for account information...'
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
                    detectQwenAccountEmail();

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

    const waitForQwenAccount = () => {

        if (accountDetectionStarted) {
            return;
        }

        accountDetectionStarted = true;

        console.log(
            '[qwen-obs] Trying session API first...'
        );

        // ========================================================
        // TRY SESSION API FIRST
        // ========================================================
        // If this succeeds, we skip DOM scraping entirely — no
        // need to wait for menus/tooltips to render.
        // ========================================================

        fetchAccountEmailFromSessionApi()
            .then(apiEmail => {

                if (apiEmail) {

                    handleDetectedAccount(apiEmail);

                    return;
                }

                console.log(
                    '[qwen-obs] Session API did not return an email. ' +
                    'Falling back to DOM detection.'
                );

                startDomAccountDetection();
            })
            .catch(error => {

                console.warn(
                    '[qwen-obs] Session API lookup threw unexpectedly. ' +
                    'Falling back to DOM detection.',
                    error
                );

                startDomAccountDetection();
            });
    };

    // ============================================================
    // INITIALIZE COLLECTOR
    // ============================================================

    const initializeCollector = () => {

        if (collectorInitialized) {

            console.warn(
                '[qwen-obs] Collector already initialized'
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
            '[qwen-obs] Tracking employee:',
            employeeEmail
        );

        console.log(
            '[qwen-obs] Session:',
            sessionId
        );

        // ========================================================
        // SEND EVENT
        // ========================================================

        const send = (event) => {

            if (!employeeEmail) {

                console.error(
                    '[qwen-obs] EVENT BLOCKED: No employee email'
                );

                return;
            }

            const payload = {

                type:
                    'QWEN_USAGE_EVENT',

                provider:
                    'alibaba',

                product:
                    'qwen',

                employeeEmail:
                    employeeEmail,

                event: {

                    email:
                        employeeEmail,

                    employeeEmail:
                        employeeEmail,

                    provider:
                        'alibaba',

                    product:
                        'qwen',

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
                '[qwen-obs] ==============================='
            );

            console.log(
                '[qwen-obs] SENDING EVENT'
            );

            console.log(
                '[qwen-obs] employeeEmail:',
                employeeEmail
            );

            console.log(
                '[qwen-obs] event_type:',
                event.event_type
            );

            console.log(
                '[qwen-obs] payload:',
                payload
            );

            console.log(
                '[qwen-obs] ==============================='
            );

            chrome.runtime.sendMessage(payload)
                .then(response => {

                    console.log(
                        '[qwen-obs] BACKGROUND RESPONSE:',
                        response
                    );

                    if (!response?.accepted) {

                        console.error(
                            '[qwen-obs] EVENT REJECTED:',
                            response
                        );

                        return;
                    }

                    console.log(
                        '[qwen-obs] EVENT ACCEPTED BY SERVICE WORKER'
                    );
                })

                .catch(error => {

                    console.error(
                        '[qwen-obs] SERVICE WORKER ERROR:',
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

            // Prefer the Qwen composer
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
                    '[qwen-obs] Duplicate submit ignored'
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
                    '[qwen-obs] Could not capture prompt'
                );

                return;
            }

            console.log(
                '[qwen-obs] ================================='
            );

            console.log(
                '[qwen-obs] PROMPT CAPTURED'
            );

            console.log(
                '[qwen-obs] Prompt:',
                prompt
            );

            console.log(
                '[qwen-obs] Prompt length:',
                prompt.length
            );

            // ====================================================
            // ESTIMATE PROMPT TOKENS
            // ====================================================

            const promptTokens =
                estimateTokens(prompt);

            console.log(
                '[qwen-obs] Estimated prompt tokens:',
                promptTokens
            );

            console.log(
                '[qwen-obs] ================================='
            );

            const signature =
                `${prompt.length}:${prompt}`;

            // Same interaction already active
            if (
                activeInteraction &&
                activeInteraction.signature === signature
            ) {

                console.log(
                    '[qwen-obs] Duplicate interaction ignored'
                );

                return;
            }

            // Same prompt already completed
            if (
                signature === lastPromptSignature &&
                !activeInteraction
            ) {

                console.log(
                    '[qwen-obs] Same prompt already processed'
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
        // QWEN RESPONSE
        // ========================================================

        const getQwenResponseText = () => {

            // Qwen Chat does not expose a stable
            // `data-message-author-role`-style attribute like
            // ChatGPT does, so we try several candidate selectors
            // in order of specificity. These may need to be
            // re-verified against the live DOM if Qwen changes
            // its markup.
            const selectorCandidates = [
                '[data-message-author-role="assistant"]',
                '[class*="assistant" i] [class*="markdown" i]',
                '[class*="response" i] [class*="markdown" i]',
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
                getQwenResponseText();

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
                '[qwen-obs] COMPLETING INTERACTION'
            );

            console.log(
                '[qwen-obs] Interaction ID:',
                interaction.interactionId
            );

            console.log(
                '[qwen-obs] Response length:',
                responseLength
            );

            console.log(
                '[qwen-obs] Latency:',
                latency
            );

            console.log(
                '[qwen-obs] Estimated prompt tokens:',
                interaction.promptTokens
            );

            console.log(
                '[qwen-obs] Estimated response tokens:',
                responseTokens
            );

            console.log(
                '[qwen-obs] Estimated total tokens:',
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

                // Qwen's submit control label isn't confirmed, so
                // broaden the match beyond just "Send".
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
                            getQwenResponseText();

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
            '[qwen-obs] ================================='
        );

        console.log(
            '[qwen-obs] QWEN OBSERVER READY'
        );

        console.log(
            '[qwen-obs] Employee:',
            employeeEmail
        );

        console.log(
            '[qwen-obs] Session:',
            sessionId
        );

        console.log(
            '[qwen-obs] Token estimation:',
            'ENABLED'
        );

        console.log(
            '[qwen-obs] ================================='
        );
    };

    // ============================================================
    // START
    // ============================================================

    waitForQwenAccount();

})();