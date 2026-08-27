console.log('[chatgpt-obs] ===============================');
console.log('[chatgpt-obs] CONTENT SCRIPT LOADED');
console.log('[chatgpt-obs] URL:', location.href);
console.log('[chatgpt-obs] ===============================');

(() => {

    // ============================================================
    // INJECT CHATGPT NETWORK DETECTOR
    // ============================================================

    const injectNetworkDetector = () => {
        if (document.documentElement.dataset.chatgptObsNetworkInjected === 'true') {
            return;
        }

        document.documentElement.dataset.chatgptObsNetworkInjected = 'true';

        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('chatgpt-network.js');

        script.onload = () => {
            console.log('[chatgpt-obs] ChatGPT network detector injected');
            script.remove();
        };

        script.onerror = (error) => {
            console.error('[chatgpt-obs] Failed to inject network detector:', error);
        };

        (document.head || document.documentElement).appendChild(script);
    };

    injectNetworkDetector();

    console.log('[chatgpt-obs] IIFE STARTED');
    console.log('[chatgpt-obs] VERSION = API-V3 + TOKEN-ESTIMATION');
    console.log('[chatgpt-obs] ACCOUNT DETECTION = /api/auth/session');

    // ============================================================
    // CONFIG
    // ============================================================

    const cfg = window.AI_OBS_CONFIG;

    console.log('[chatgpt-obs] CONFIG:', cfg);

    if (!cfg?.apiBaseUrl) {
        console.error('[chatgpt-obs] STOPPED: apiBaseUrl is missing');
        return;
    }

    const PROVIDER = 'openai';
    const PRODUCT = 'chatgpt';

    // ============================================================
    // ACCOUNT API
    // ============================================================

    // NOTE: chatgpt.com and chat.openai.com both serve a NextAuth-style
    // session endpoint at /api/auth/session which returns
    // { user: { name, email, image }, expires, ... } when logged in.
    // This has been stable for a long time but OpenAI can change it
    // without notice - verify in devtools if this stops working.
    const AUTH_ENDPOINT = '/api/auth/session';

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // ============================================================
    // MODEL DETECTION
    // ============================================================

    let currentModel = 'unknown';

    console.log('[chatgpt-obs] Initial model:', currentModel);

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;

        const data = event.data;
        if (!data) return;

        if (data.source !== 'chatgpt-observability' || data.type !== 'MODEL_DETECTED') {
            return;
        }

        if (typeof data.model !== 'string' || !data.model.trim()) return;

        const detectedModel = data.model.trim();
        if (currentModel === detectedModel) return;

        currentModel = detectedModel;

        if (
            typeof activeInteraction !== 'undefined' &&
            activeInteraction &&
            (!activeInteraction.model || activeInteraction.model === 'unknown')
        ) {
            activeInteraction.model = detectedModel;
            console.log('[chatgpt-obs] Active interaction model updated:', detectedModel);
        }

        console.log('[chatgpt-obs] =================================');
        console.log('[chatgpt-obs] MODEL AUTO-DETECTED');
        console.log('[chatgpt-obs] Model:', currentModel);
        console.log('[chatgpt-obs] =================================');
    });

    // ============================================================
    // EXTRACT EMAIL
    // ============================================================

    const extractEmailFromAuthResponse = (data) => {
        if (!data || typeof data !== 'object') return null;

        // /api/auth/session shape: { user: { email, name, image }, ... }
        const candidate = data?.user?.email ?? data?.email;

        if (typeof candidate !== 'string') return null;

        const email = candidate.trim().toLowerCase();

        if (!EMAIL_REGEX.test(email)) return null;

        return email;
    };

    // ============================================================
    // FETCH ACCOUNT
    // ============================================================

    const fetchAccount = async () => {
        console.log('[chatgpt-obs] =================================');
        console.log('[chatgpt-obs] STARTING ACCOUNT DETECTION');
        console.log('[chatgpt-obs] METHOD: /api/auth/session');
        console.log('[chatgpt-obs] =================================');

        try {
            const response = await fetch(AUTH_ENDPOINT, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json' }
            });

            console.log('[chatgpt-obs] auth API status:', response.status);

            if (!response.ok) {
                console.error('[chatgpt-obs] auth API request failed:', response.status, response.statusText);
                return null;
            }

            const contentType = response.headers.get('content-type') || '';

            if (!contentType.includes('application/json')) {
                console.error('[chatgpt-obs] auth API did not return JSON');
                return null;
            }

            // Do NOT console.log(data) - may contain session/access tokens.
            const data = await response.json();

            console.log('[chatgpt-obs] auth response received');

            const email = extractEmailFromAuthResponse(data);

            if (!email) {
                console.error('[chatgpt-obs] ACCOUNT NOT DETECTED (not logged in, or shape changed)');
                return null;
            }

            console.log('[chatgpt-obs] =================================');
            console.log('[chatgpt-obs] ACCOUNT DETECTED');
            console.log('[chatgpt-obs] Employee:', email);
            console.log('[chatgpt-obs] =================================');

            return email;

        } catch (error) {
            console.error('[chatgpt-obs] AUTH API ERROR:', error);
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
        if (!text) return 0;
        // ~1 token per 4 characters. Not the real tokenizer - estimate only.
        return Math.ceil(text.length / 4);
    };

    // ============================================================
    // INITIALIZE COLLECTOR
    // ============================================================

    const initializeCollector = () => {
        if (collectorInitialized) {
            console.warn('[chatgpt-obs] Collector already initialized');
            return;
        }

        if (!employeeEmail) {
            console.error('[chatgpt-obs] Collector cannot start: no employee email');
            return;
        }

        collectorInitialized = true;

        const sessionId = crypto.randomUUID();

        let activeInteraction = null;
        let lastPromptSignature = null;
        let lastKnownPrompt = '';
        let completionTimer = null;
        let lastInteractionStartedAt = 0;
        let previousResponseSnapshot = '';

        console.log('[chatgpt-obs] =================================');
        console.log('[chatgpt-obs] INITIALIZING COLLECTOR');
        console.log('[chatgpt-obs] Employee:', employeeEmail);
        console.log('[chatgpt-obs] Session:', sessionId);
        console.log('[chatgpt-obs] Model:', currentModel);
        console.log('[chatgpt-obs] =================================');

        // ========================================================
        // SEND EVENT
        // ========================================================

        const send = (event) => {
            if (!employeeEmail) {
                console.error('[chatgpt-obs] EVENT BLOCKED: No employee email');
                return;
            }

            const payload = {
                type: 'AI_USAGE_EVENT',
                provider: PROVIDER,
                product: PRODUCT,
                employeeEmail: employeeEmail,
                event: {
                    email: employeeEmail,
                    provider: PROVIDER,
                    product: PRODUCT,
                    department: cfg.department ?? null,
                    role: cfg.role ?? null,
                    session_id: sessionId,
                    occurred_at: new Date().toISOString(),
                    ...event
                }
            };

            console.log('[chatgpt-obs] ===============================');
            console.log('[chatgpt-obs] SENDING EVENT');
            console.log('[chatgpt-obs] employeeEmail:', employeeEmail);
            console.log('[chatgpt-obs] event_type:', event.event_type);

            // Do NOT log the complete payload - may contain prompt/response text.

            chrome.runtime.sendMessage(payload)
                .then(response => {
                    console.log('[chatgpt-obs] BACKGROUND RESPONSE:', response);

                    if (!response?.accepted) {
                        console.error('[chatgpt-obs] EVENT REJECTED:', response);
                        return;
                    }

                    console.log('[chatgpt-obs] EVENT ACCEPTED BY SERVICE WORKER');
                })
                .catch(error => {
                    console.error('[chatgpt-obs] SERVICE WORKER ERROR:', error);
                });
        };

        // ========================================================
        // FIND PROMPT INPUT
        // ========================================================
        // ChatGPT's composer is a contenteditable div, id="prompt-textarea".
        // Fall back to the generic search used for other assistants in
        // case the DOM changes.

        const findPromptInput = () => {
            const preferred = document.querySelector('#prompt-textarea');

            if (preferred) {
                const rect = preferred.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    return preferred;
                }
            }

            const candidates = [
                ...document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')
            ];

            const visible = candidates.filter(el => {
                const rect = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                return (
                    rect.width > 0 &&
                    rect.height > 0 &&
                    style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    !el.disabled
                );
            });

            const composer = visible.find(el =>
                el.tagName === 'TEXTAREA' ||
                el.getAttribute('contenteditable') === 'true'
            );

            return composer || visible[0] || null;
        };

        const getInputText = (input) => {
            if (!input) return '';

            if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
                return input.value || '';
            }

            return (input.innerText || input.textContent || '');
        };

        // ========================================================
        // GET CHATGPT RESPONSE
        // ========================================================
        // ChatGPT tags assistant turns with data-message-author-role="assistant".

        const getResponseText = () => {
            const selectorCandidates = [
                '[data-message-author-role="assistant"]',
                '[class*="markdown" i]'
            ];

            let candidates = [];

            for (const selector of selectorCandidates) {
                candidates = [...document.querySelectorAll(selector)];
                if (candidates.length) break;
            }

            const visible = candidates.filter(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            });

            if (!visible.length) return '';

            const latest = visible[visible.length - 1];

            return (latest.innerText || latest.textContent || '').trim();
        };

        // ========================================================
        // START INTERACTION
        // ========================================================

        const startInteraction = () => {
            const now = Date.now();

            if (now - lastInteractionStartedAt < 500) {
                console.log('[chatgpt-obs] Duplicate submit ignored');
                return;
            }

            lastInteractionStartedAt = now;

            const input = findPromptInput();
            let prompt = '';

            if (input) {
                prompt = getInputText(input).trim();
            }

            if (!prompt) prompt = lastKnownPrompt;

            if (!prompt) {
                console.warn('[chatgpt-obs] Could not capture prompt');
                return;
            }

            previousResponseSnapshot = getResponseText();

            console.log('[chatgpt-obs] =================================');
            console.log('[chatgpt-obs] PROMPT CAPTURED');
            console.log('[chatgpt-obs] Prompt length:', prompt.length);

            const promptTokens = estimateTokens(prompt);

            console.log('[chatgpt-obs] Estimated prompt tokens:', promptTokens);
            console.log('[chatgpt-obs] Current model before network detection:', currentModel);
            console.log('[chatgpt-obs] =================================');

            const signature = `${prompt.length}:${prompt}`;

            if (activeInteraction && activeInteraction.signature === signature) {
                console.log('[chatgpt-obs] Duplicate interaction ignored');
                return;
            }

            if (signature === lastPromptSignature && !activeInteraction) {
                console.log('[chatgpt-obs] Same prompt already processed');
                return;
            }

            lastPromptSignature = signature;

            const interactionId = crypto.randomUUID();
            const startedAt = Date.now();

            activeInteraction = {
                interactionId,
                startedAt,
                signature,
                prompt,
                model: currentModel || 'unknown',
                promptLength: prompt.length,
                promptTokens: promptTokens,
                previousResponse: previousResponseSnapshot
            };

            const waitForModelAndSend = () => {
                const maxWait = 1500;
                const checkInterval = 50;
                const waitStartedAt = Date.now();

                const checkModel = () => {
                    if (currentModel && currentModel !== 'unknown') {
                        activeInteraction.model = currentModel;

                        console.log('[chatgpt-obs] Model available before event:', currentModel);

                        send({
                            event_type: 'interaction_started',
                            interaction_id: interactionId,
                            model: currentModel,
                            prompt_length: prompt.length,
                            prompt_tokens: promptTokens,
                            metadata: {
                                collector: 'api-v3',
                                prompt_capture: 'pre-submit',
                                model_detection: 'network-hook',
                                token_estimation: 'characters-divided-by-4'
                            }
                        });

                        lastKnownPrompt = '';
                        return;
                    }

                    if (Date.now() - waitStartedAt < maxWait) {
                        setTimeout(checkModel, checkInterval);
                        return;
                    }

                    const fallbackModel = currentModel || 'unknown';
                    activeInteraction.model = fallbackModel;

                    console.warn('[chatgpt-obs] Model detection timeout');
                    console.warn('[chatgpt-obs] Using model:', fallbackModel);

                    send({
                        event_type: 'interaction_started',
                        interaction_id: interactionId,
                        model: fallbackModel,
                        prompt_length: prompt.length,
                        prompt_tokens: promptTokens,
                        metadata: {
                            collector: 'api-v3',
                            prompt_capture: 'pre-submit',
                            model_detection: fallbackModel === 'unknown' ? 'timeout' : 'network-hook',
                            token_estimation: 'characters-divided-by-4'
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
            if (!activeInteraction) return;

            const interaction = activeInteraction;
            const response = getResponseText();

            if (!response) {
                console.log('[chatgpt-obs] Waiting for response...');
                return;
            }

            if (interaction.previousResponse && response === interaction.previousResponse) {
                console.log('[chatgpt-obs] Response unchanged; waiting...');
                return;
            }

            const latency = Date.now() - interaction.startedAt;
            const responseLength = response.length;
            const responseTokens = estimateTokens(response);
            const totalTokens = interaction.promptTokens + responseTokens;

            console.log('[chatgpt-obs] =================================');
            console.log('[chatgpt-obs] COMPLETING INTERACTION');
            console.log('[chatgpt-obs] Interaction ID:', interaction.interactionId);
            console.log('[chatgpt-obs] Response length:', responseLength);
            console.log('[chatgpt-obs] Latency:', latency);
            console.log('[chatgpt-obs] Estimated prompt tokens:', interaction.promptTokens);
            console.log('[chatgpt-obs] Estimated response tokens:', responseTokens);
            console.log('[chatgpt-obs] Estimated total tokens:', totalTokens);
            console.log('[chatgpt-obs] =================================');

            send({
                event_type: 'interaction_completed',
                interaction_id: interaction.interactionId,
                model: interaction.model,
                prompt_length: interaction.promptLength,
                response_length: responseLength,
                prompt_tokens: interaction.promptTokens,
                response_tokens: responseTokens,
                total_tokens: totalTokens,
                latency_ms: latency,
                metadata: {
                    collector: 'api-v3',
                    completion_detection: 'mutation-idle',
                    token_estimation: 'characters-divided-by-4'
                }
            });

            activeInteraction = null;
            clearTimeout(completionTimer);
            completionTimer = null;
        };

        // ========================================================
        // ENTER KEY
        // ========================================================

        document.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            if (event.shiftKey) return;

            const input = findPromptInput();
            const targetIsInput = input && (event.target === input || input.contains?.(event.target));

            if (!targetIsInput) return;

            startInteraction();
        }, true);

        // ========================================================
        // SEND BUTTON
        // ========================================================

        document.addEventListener('click', event => {
            const button = event.target?.closest?.('button');
            if (!button) return;

            const combined = [
                button.getAttribute('aria-label'),
                button.getAttribute('title'),
                button.innerText
            ].filter(Boolean).join(' ');

            const isSend = /send|submit/i.test(combined) && !button.disabled;

            if (!isSend) return;

            startInteraction();
        }, true);

        // ========================================================
        // MUTATION OBSERVER
        // ========================================================

        const observer = new MutationObserver(() => {
            if (!activeInteraction) return;

            clearTimeout(completionTimer);

            completionTimer = setTimeout(() => {
                const response = getResponseText();
                if (!response) return;

                if (activeInteraction.previousResponse && response === activeInteraction.previousResponse) {
                    return;
                }

                completeInteraction();
            }, 2500);
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true
        });

        // ========================================================
        // SESSION START
        // ========================================================

        send({
            event_type: 'session_started',
            interaction_id: crypto.randomUUID(),
            metadata: {
                collector: 'api-v3',
                url_host: location.host
            }
        });

        console.log('[chatgpt-obs] =================================');
        console.log('[chatgpt-obs] OBSERVER READY');
        console.log('[chatgpt-obs] LOGIN CONFIRMED');
        console.log('[chatgpt-obs] Employee:', employeeEmail);
        console.log('[chatgpt-obs] Session:', sessionId);
        console.log('[chatgpt-obs] Model:', currentModel);
        console.log('[chatgpt-obs] =================================');
    };

    // ============================================================
    // WAIT FOR ACCOUNT
    // ============================================================

    const waitForAccount = async () => {
        const detectedEmail = await fetchAccount();

        if (!detectedEmail) {
            console.error('[chatgpt-obs] =================================');
            console.error('[chatgpt-obs] LOGIN NOT CONFIRMED');
            console.error('[chatgpt-obs] Collector will NOT start');
            console.error('[chatgpt-obs] =================================');
            return;
        }

        employeeEmail = detectedEmail;

        console.log('[chatgpt-obs] LOGIN CONFIRMED:', employeeEmail);

        initializeCollector();
    };

    waitForAccount();

})();