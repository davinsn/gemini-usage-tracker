console.log('[qwen-obs] ===============================');
console.log('[qwen-obs] CONTENT SCRIPT LOADED');
console.log('[qwen-obs] URL:', location.href);
console.log('[qwen-obs] ===============================');

(() => {

    // ============================================================
    // INJECT QWEN NETWORK DETECTOR
    // ============================================================

    const injectQwenNetworkDetector = () => {
        if (
            document.documentElement.dataset
                .qwenObsNetworkInjected === 'true'
        ) {
            return;
        }

        document.documentElement.dataset
            .qwenObsNetworkInjected = 'true';

        const script = document.createElement('script');

        script.src = chrome.runtime.getURL(
            'qwen-network.js'
        );

        script.onload = () => {
            console.log(
                '[qwen-obs] Qwen network detector injected'
            );

            script.remove();
        };

        script.onerror = (error) => {
            console.error(
                '[qwen-obs] Failed to inject Qwen network detector:',
                error
            );
        };

        (
            document.head ||
            document.documentElement
        ).appendChild(script);
    };

    injectQwenNetworkDetector();

    console.log('[qwen-obs] IIFE STARTED');
    console.log('[qwen-obs] VERSION = API-V3 + TOKEN-ESTIMATION');
    console.log('[qwen-obs] ACCOUNT DETECTION = QWEN AUTH API ONLY');
    console.log('[qwen-obs] DOM ACCOUNT DETECTION = DISABLED');

    // ============================================================
    // CONFIG
    // ============================================================

  const cfg = window.AI_OBS_CONFIG;

    console.log('[qwen-obs] CONFIG:', cfg);

    if (!cfg?.apiBaseUrl) {
        console.error(
            '[qwen-obs] STOPPED: apiBaseUrl is missing'
        );
        return;
    }

    // ============================================================
    // QWEN ACCOUNT API
    // ============================================================

    const QWEN_AUTH_ENDPOINT = '/api/v1/auths/';

    const EMAIL_REGEX =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // ============================================================
    // MODEL DETECTION
    // ============================================================

    let currentQwenModel = 'unknown';

    console.log(
        '[qwen-obs] Initial model:',
        currentQwenModel
    );

    // ============================================================
    // RECEIVE MODEL FROM QWEN NETWORK DETECTOR
    // ============================================================

    window.addEventListener('message', (event) => {

        if (event.source !== window) {
            return;
        }

        const data = event.data;

        if (!data) {
            return;
        }

        if (
            data.source !== 'qwen-observability' ||
            data.type !== 'QWEN_MODEL_DETECTED'
        ) {
            return;
        }

        if (
            typeof data.model !== 'string' ||
            !data.model.trim()
        ) {
            return;
        }

        const detectedModel = data.model.trim();

        if (
            currentQwenModel === detectedModel
        ) {
            return;
        }

        currentQwenModel = detectedModel;

/*
 * If an interaction is already being tracked,
 * update its model as soon as the network detector
 * discovers it.
 */
if (
    typeof activeInteraction !== 'undefined' &&
    activeInteraction &&
    (
        !activeInteraction.model ||
        activeInteraction.model === 'unknown'
    )
) {
    activeInteraction.model =
        detectedModel;

    console.log(
        '[qwen-obs] Active interaction model updated:',
        detectedModel
    );
}

console.log(
    '[qwen-obs] ================================='
);

        console.log(
            '[qwen-obs] QWEN MODEL AUTO-DETECTED'
        );

        console.log(
            '[qwen-obs] Model:',
            currentQwenModel
        );

        console.log(
            '[qwen-obs] ================================='
        );
    });

    // ============================================================
    // EXTRACT EMAIL
    // ============================================================

    const extractEmailFromAuthResponse = (data) => {

        if (!data || typeof data !== 'object') {
            return null;
        }

        const candidate = data.email;

        if (typeof candidate !== 'string') {
            return null;
        }

        const email = candidate
            .trim()
            .toLowerCase();

        if (!EMAIL_REGEX.test(email)) {
            return null;
        }

        return email;
    };

    // ============================================================
    // FETCH QWEN ACCOUNT
    // ============================================================

    const fetchQwenAccount = async () => {

        console.log(
            '[qwen-obs] ================================='
        );

        console.log(
            '[qwen-obs] STARTING QWEN ACCOUNT DETECTION'
        );

        console.log(
            '[qwen-obs] METHOD: QWEN AUTH API'
        );

        console.log(
            '[qwen-obs] ENDPOINT:',
            QWEN_AUTH_ENDPOINT
        );

        console.log(
            '[qwen-obs] DOM ACCOUNT DETECTION: DISABLED'
        );

        console.log(
            '[qwen-obs] ================================='
        );

        try {

            const response = await fetch(
                QWEN_AUTH_ENDPOINT,
                {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json'
                    }
                }
            );

            console.log(
                '[qwen-obs] Qwen auth API status:',
                response.status
            );

            if (!response.ok) {

                console.error(
                    '[qwen-obs] Qwen auth API request failed:',
                    response.status,
                    response.statusText
                );

                return null;
            }

            const contentType =
                response.headers.get('content-type') || '';

            console.log(
                '[qwen-obs] Content-Type:',
                contentType
            );

            if (!contentType.includes('application/json')) {

                console.error(
                    '[qwen-obs] Qwen auth API did not return JSON'
                );

                return null;
            }

            /*
             * IMPORTANT:
             *
             * Do NOT console.log(data).
             *
             * The response may contain a JWT token.
             */

            const data = await response.json();

            console.log(
                '[qwen-obs] Qwen auth response received'
            );

            const email =
                extractEmailFromAuthResponse(data);

            if (!email) {

                console.error(
                    '[qwen-obs] QWEN ACCOUNT NOT DETECTED'
                );

                console.error(
                    '[qwen-obs] Auth API response did not contain a valid email'
                );

                return null;
            }

            console.log(
                '[qwen-obs] ================================='
            );

            console.log(
                '[qwen-obs] QWEN ACCOUNT DETECTED'
            );

            console.log(
                '[qwen-obs] Employee:',
                email
            );

            console.log(
                '[qwen-obs] ================================='
            );

            return email;

        } catch (error) {

            console.error(
                '[qwen-obs] QWEN AUTH API ERROR:',
                error
            );

            return null;
        }
    };

    // ============================================================
    // ACCOUNT STATE
    // ============================================================

    let employeeEmail = null;

    let collectorInitialized = false;

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
         * ~1 token per 4 characters.
         *
         * This is NOT the official Qwen tokenizer.
         * It is intended for usage estimation only.
         */

        return Math.ceil(text.length / 4);
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

        if (!employeeEmail) {

            console.error(
                '[qwen-obs] Collector cannot start: no employee email'
            );

            return;
        }

        collectorInitialized = true;

        // ========================================================
        // SESSION
        // ========================================================

        const sessionId = crypto.randomUUID();

        let activeInteraction = null;

        let lastPromptSignature = null;

        let lastKnownPrompt = '';

        let completionTimer = null;

        let lastInteractionStartedAt = 0;

        /*
         * Track the response that existed before the interaction.
         * This prevents an old response from being counted.
         */
        let previousResponseSnapshot = '';

        console.log(
            '[qwen-obs] ================================='
        );

        console.log(
            '[qwen-obs] INITIALIZING QWEN COLLECTOR'
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
            '[qwen-obs] Model:',
            currentQwenModel
        );

        console.log(
            '[qwen-obs] ================================='
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

                type: 'QWEN_USAGE_EVENT',

                provider: 'alibaba',

                product: 'qwen',

                employeeEmail: employeeEmail,

                event: {

                    email: employeeEmail,

                    provider: 'alibaba',

                    product: 'qwen',

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

            /*
             * Do NOT log the complete payload.
             *
             * It may contain prompt/response information.
             */

            chrome.runtime
                .sendMessage(payload)
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
        // GET QWEN RESPONSE
        // ========================================================

        const getQwenResponseText = () => {

            const selectorCandidates = [

                '[data-message-author-role="assistant"]',

                '[class*="assistant" i] [class*="markdown" i]',

                '[class*="response" i] [class*="markdown" i]',

                '[class*="markdown" i]'
            ];

            let candidates = [];

            for (
                const selector
                of selectorCandidates
            ) {

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
        // START INTERACTION
        // ========================================================

const startInteraction = () => {
    const now = Date.now();

    /*
     * Prevent Enter + Send button
     * from creating two interactions.
     */
    if (
        now -
        lastInteractionStartedAt <
        500
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

    if (input) {
        prompt =
            getInputText(input).trim();
    }

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

    /*
     * Capture whatever response existed before
     * this interaction.
     */
    previousResponseSnapshot =
        getQwenResponseText();

    console.log(
        '[qwen-obs] ================================='
    );

    console.log(
        '[qwen-obs] PROMPT CAPTURED'
    );

    console.log(
        '[qwen-obs] Prompt length:',
        prompt.length
    );

    const promptTokens =
        estimateTokens(prompt);

    console.log(
        '[qwen-obs] Estimated prompt tokens:',
        promptTokens
    );

    console.log(
        '[qwen-obs] Current model before network detection:',
        currentQwenModel
    );

    console.log(
        '[qwen-obs] ================================='
    );

    const signature =
        `${prompt.length}:${prompt}`;

    if (
        activeInteraction &&
        activeInteraction.signature === signature
    ) {
        console.log(
            '[qwen-obs] Duplicate interaction ignored'
        );
        return;
    }

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

    /*
     * Store the interaction immediately.
     *
     * The model may still be unknown at this point.
     * We will wait for the Qwen network detector
     * before sending interaction_started.
     */
    activeInteraction = {
        interactionId,
        startedAt,
        signature,
        prompt,
        model: currentQwenModel || 'unknown',
        promptLength:
            prompt.length,
        promptTokens:
            promptTokens,
        previousResponse:
            previousResponseSnapshot
    };

    /*
     * Wait for the network detector to identify
     * the actual Qwen model.
     */
    const waitForModelAndSend = () => {

        const maxWait = 1500;
        const checkInterval = 50;

        const waitStartedAt =
            Date.now();

        const checkModel = () => {

            /*
             * If the network detector has already
             * identified the model, use it.
             */
            if (
                currentQwenModel &&
                currentQwenModel !== 'unknown'
            ) {

                activeInteraction.model =
                    currentQwenModel;

                console.log(
                    '[qwen-obs] Model available before event:',
                    currentQwenModel
                );

                send({
                    event_type:
                        'interaction_started',

                    interaction_id:
                        interactionId,

                    model:
                        currentQwenModel,

                    prompt_length:
                        prompt.length,

                    prompt_tokens:
                        promptTokens,

                    metadata: {
                        collector:
                            'api-v3',

                        prompt_capture:
                            'pre-submit',

                        model_detection:
                            'qwen-network',

                        token_estimation:
                            'characters-divided-by-4'
                    }
                });

                lastKnownPrompt = '';

                return;
            }

            /*
             * Wait until the timeout.
             */
            if (
                Date.now() -
                waitStartedAt <
                maxWait
            ) {

                setTimeout(
                    checkModel,
                    checkInterval
                );

                return;
            }

            /*
             * Network detector did not provide
             * a model in time.
             */
            const fallbackModel =
                currentQwenModel || 'unknown';

            activeInteraction.model =
                fallbackModel;

            console.warn(
                '[qwen-obs] Model detection timeout'
            );

            console.warn(
                '[qwen-obs] Using model:',
                fallbackModel
            );

            send({
                event_type:
                    'interaction_started',

                interaction_id:
                    interactionId,

                model:
                    fallbackModel,

                prompt_length:
                    prompt.length,

                prompt_tokens:
                    promptTokens,

                metadata: {
                    collector:
                        'api-v3',

                    prompt_capture:
                        'pre-submit',

                    model_detection:
                        fallbackModel === 'unknown'
                            ? 'timeout'
                            : 'qwen-network',

                    token_estimation:
                        'characters-divided-by-4'
                }
            });

            lastKnownPrompt = '';
        };

        checkModel();
    };

    waitForModelAndSend();
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

            /*
             * Don't complete if Qwen has not produced
             * a response yet.
             */

            if (!response) {

                console.log(
                    '[qwen-obs] Waiting for Qwen response...'
                );

                return;
            }

            /*
             * If the response is exactly the same as the
             * response that existed before submission,
             * it is probably the old response.
             */

            if (
                interaction.previousResponse &&
                response === interaction.previousResponse
            ) {

                console.log(
                    '[qwen-obs] Response unchanged; waiting...'
                );

                return;
            }

            const latency =
                Date.now() -
                interaction.startedAt;

            const responseLength =
                response.length;

            const responseTokens =
                estimateTokens(response);

            const totalTokens =
                interaction.promptTokens +
                responseTokens;

            console.log(
                '[qwen-obs] ================================='
            );

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

            console.log(
                '[qwen-obs] ================================='
            );

            send({

                event_type:
                    'interaction_completed',

                interaction_id:
                    interaction.interactionId,

                model:
                    interaction.model,

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
                        'api-v3',

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

                        if (!response) {
                            return;
                        }

                        /*
                         * Make sure response actually changed
                         * from what existed before submission.
                         */

                        if (
                            activeInteraction.previousResponse &&
                            response ===
                            activeInteraction.previousResponse
                        ) {
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
                    'api-v3',

                url_host:
                    location.host
            }
        });

        // ========================================================
        // READY
        // ========================================================

        console.log(
            '[qwen-obs] ================================='
        );

        console.log(
            '[qwen-obs] QWEN OBSERVER READY'
        );

        console.log(
            '[qwen-obs] LOGIN CONFIRMED'
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
            '[qwen-obs] Model:',
            currentQwenModel
        );

        console.log(
            '[qwen-obs] Account detection:',
            'QWEN AUTH API'
        );

        console.log(
            '[qwen-obs] DOM account detection:',
            'DISABLED'
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
    // WAIT FOR QWEN ACCOUNT
    // ============================================================

    const waitForQwenAccount = async () => {

        console.log(
            '[qwen-obs] ================================='
        );

        console.log(
            '[qwen-obs] STARTING QWEN ACCOUNT DETECTION'
        );

        console.log(
            '[qwen-obs] METHOD: QWEN AUTH API ONLY'
        );

        console.log(
            '[qwen-obs] ENDPOINT:',
            QWEN_AUTH_ENDPOINT
        );

        console.log(
            '[qwen-obs] DOM ACCOUNT DETECTION: DISABLED'
        );

        console.log(
            '[qwen-obs] ================================='
        );

        const detectedEmail =
            await fetchQwenAccount();

        if (!detectedEmail) {

            console.error(
                '[qwen-obs] ================================='
            );

            console.error(
                '[qwen-obs] LOGIN NOT CONFIRMED'
            );

            console.error(
                '[qwen-obs] Collector will NOT start'
            );

            console.error(
                '[qwen-obs] ================================='
            );

            return;
        }

        employeeEmail =
            detectedEmail;

        console.log(
            '[qwen-obs] ================================='
        );

        console.log(
            '[qwen-obs] LOGIN CONFIRMED'
        );

        console.log(
            '[qwen-obs] Employee:',
            employeeEmail
        );

        console.log(
            '[qwen-obs] Starting collector...'
        );

        console.log(
            '[qwen-obs] ================================='
        );

        initializeCollector();
    };

    // ============================================================
    // START
    // ============================================================

    waitForQwenAccount();

})();