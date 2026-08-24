console.log('[chatgpt-obs] ===============================');
console.log('[chatgpt-obs] CONTENT SCRIPT LOADED');
console.log('[chatgpt-obs] URL:', location.href);
console.log('[chatgpt-obs] ===============================');

(() => {

    console.log('[chatgpt-obs] IIFE STARTED');
    console.log('[chatgpt-obs] VERSION = DOM-V1');

    // ============================================================
    // CONFIG
    // ============================================================

    const cfg = window.CHATGPT_OBS_CONFIG;

    console.log('[chatgpt-obs] CONFIG:', cfg);

    if (!cfg?.apiBaseUrl) {
        console.error(
            '[chatgpt-obs] STOPPED: apiBaseUrl is missing'
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
    // CHATGPT ACCOUNT DETECTION
    // ============================================================

    const detectChatGPTAccountEmail = () => {

        console.log(
            '[chatgpt-obs] Searching for ChatGPT account...'
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
                        '[chatgpt-obs] CHATGPT ACCOUNT DETECTED:',
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
                    '[chatgpt-obs] Account detected from menu:',
                    email
                );

                return email;
            }
        }

        console.log(
            '[chatgpt-obs] No ChatGPT account email found yet.'
        );

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
        '[chatgpt-obs] ================================='
    );

    console.log(
        '[chatgpt-obs] REAL CHATGPT ACCOUNT DETECTED'
    );

    console.log(
        '[chatgpt-obs] Employee:',
        employeeEmail
    );

    console.log(
        '[chatgpt-obs] ================================='
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
        '[chatgpt-obs] Checking ChatGPT account immediately...'
    );

    const detectedEmail =
        detectChatGPTAccountEmail();

    if (detectedEmail) {
        handleDetectedAccount(detectedEmail);
        return true;
    }

    return false;
};

const waitForChatGPTAccount = () => {

    if (accountDetectionStarted) {
        return;
    }

    accountDetectionStarted = true;

    console.log(
        '[chatgpt-obs] Starting immediate account detection...'
    );

    // ========================================================
    // FIRST CHECK — DO NOT WAIT
    // ========================================================

    if (detectAccountImmediately()) {
        return;
    }

    console.log(
        '[chatgpt-obs] Account not present yet.'
    );

    console.log(
        '[chatgpt-obs] Watching DOM for account information...'
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
                detectChatGPTAccountEmail();

            if (detectedEmail) {
                handleDetectedAccount(detectedEmail);
            }
        });

    const startObserver = () => {

        if (!document.documentElement) {
            requestAnimationFrame(startObserver);
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
                '[chatgpt-obs] Collector already initialized'
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
            '[chatgpt-obs] Tracking employee:',
            employeeEmail
        );

        console.log(
            '[chatgpt-obs] Session:',
            sessionId
        );

        // ========================================================
        // SEND EVENT
        // ========================================================

        const send = (event) => {

            if (!employeeEmail) {

                console.error(
                    '[chatgpt-obs] EVENT BLOCKED: No employee email'
                );

                return;
            }

            const payload = {
                type: 'CHATGPT_USAGE_EVENT',

                provider: 'openai',
                product: 'chatgpt',

                employeeEmail: employeeEmail,

                event: {
                    email: employeeEmail,
                    employeeEmail: employeeEmail,

                    provider: 'openai',
                    product: 'chatgpt',

                    department: cfg.department ?? null,
                    role: cfg.role ?? null,

                    session_id: sessionId,

                    occurred_at: new Date().toISOString(),

                    ...event
                }
            };

            console.log(
                '[chatgpt-obs] ==============================='
            );

            console.log(
                '[chatgpt-obs] SENDING EVENT'
            );

            console.log(
                '[chatgpt-obs] employeeEmail:',
                employeeEmail
            );

            console.log(
                '[chatgpt-obs] event_type:',
                event.event_type
            );

            console.log(
                '[chatgpt-obs] payload:',
                payload
            );

            console.log(
                '[chatgpt-obs] ==============================='
            );

            chrome.runtime.sendMessage(payload)

                .then(response => {

                    console.log(
                        '[chatgpt-obs] BACKGROUND RESPONSE:',
                        response
                    );

                    if (!response?.accepted) {

                        console.error(
                            '[chatgpt-obs] EVENT REJECTED:',
                            response
                        );

                        return;
                    }

                    console.log(
                        '[chatgpt-obs] EVENT ACCEPTED BY SERVICE WORKER'
                    );
                })

                .catch(error => {

                    console.error(
                        '[chatgpt-obs] SERVICE WORKER ERROR:',
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

            // Prefer the ChatGPT composer
            const composer =
                visible.find(el =>
                    el.tagName === 'TEXTAREA' ||
                    el.getAttribute('contenteditable') === 'true'
                );

            return composer || visible[0] || null;
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
        // CACHE PROMPT WHILE USER TYPES
        // ========================================================

        // document.addEventListener(
        //     'input',
        //     event => {

        //         const input =
        //             findPromptInput();

        //         if (!input) {
        //             return;
        //         }

        //         if (
        //             event.target === input ||
        //             input.contains?.(event.target)
        //         ) {

        //             const text =
        //                 getInputText(input).trim();

        //             if (text) {

        //                 lastKnownPrompt = text;

        //                 console.log(
        //                     '[chatgpt-obs] Cached prompt:',
        //                     lastKnownPrompt
        //                 );
        //             }
        //         }
        //     },
        //     true
        // );

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
                    '[chatgpt-obs] Duplicate submit ignored'
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
                    '[chatgpt-obs] Could not capture prompt'
                );

                return;
            }

            console.log(
                '[chatgpt-obs] ================================='
            );

            console.log(
                '[chatgpt-obs] PROMPT CAPTURED'
            );

            console.log(
                '[chatgpt-obs] Prompt:',
                prompt
            );

            console.log(
                '[chatgpt-obs] Prompt length:',
                prompt.length
            );

            console.log(
                '[chatgpt-obs] ================================='
            );

            const signature =
                `${prompt.length}:${prompt}`;

            // Same interaction already active
            if (
                activeInteraction &&
                activeInteraction.signature === signature
            ) {

                console.log(
                    '[chatgpt-obs] Duplicate interaction ignored'
                );

                return;
            }

            // Same prompt already completed
            if (
                signature === lastPromptSignature &&
                !activeInteraction
            ) {

                console.log(
                    '[chatgpt-obs] Same prompt already processed'
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
                        'dom-v1',

                    prompt_capture:
                        'pre-submit'
                }
            });

            // Clear cached prompt
            lastKnownPrompt = '';
        };

        // ========================================================
        // CHATGPT RESPONSE
        // ========================================================

        const getChatGPTResponseText = () => {

            const candidates = [
                ...document.querySelectorAll(
                    '[data-message-author-role="assistant"]'
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
                getChatGPTResponseText();

            const latency =
                Date.now() -
                interaction.startedAt;

            const responseLength =
                response.length;

            console.log(
                '[chatgpt-obs] COMPLETING INTERACTION'
            );

            console.log(
                '[chatgpt-obs] Interaction ID:',
                interaction.interactionId
            );

            console.log(
                '[chatgpt-obs] Response length:',
                responseLength
            );

            console.log(
                '[chatgpt-obs] Latency:',
                latency
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
                        'dom-v1',

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

                        const response =
                            getChatGPTResponseText();

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
            '[chatgpt-obs] ================================='
        );

        console.log(
            '[chatgpt-obs] CHATGPT OBSERVER READY'
        );

        console.log(
            '[chatgpt-obs] Employee:',
            employeeEmail
        );

        console.log(
            '[chatgpt-obs] Session:',
            sessionId
        );

        console.log(
            '[chatgpt-obs] ================================='
        );
    };

    // ============================================================
    // START
    // ============================================================

    waitForChatGPTAccount();

})();