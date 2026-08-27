console.log('[perplexity-obs] ===============================');
console.log('[perplexity-obs] CONTENT SCRIPT LOADED');
console.log('[perplexity-obs] URL:', location.href);
console.log('[perplexity-obs] ===============================');

// ================================================================
// CAVEAT
// ================================================================
// Perplexity's account/session API shape is less publicly documented
// than ChatGPT's. AUTH_ENDPOINT below is a best guess based on the
// common next-auth convention ("/api/auth/session") that a lot of
// Next.js apps use. Open devtools -> Network on perplexity.ai while
// logged in, reload, and check for a request that returns your email
// as JSON; update AUTH_ENDPOINT and extractEmailFromAuthResponse to
// match whatever you actually see.
// ================================================================

(() => {

    const injectNetworkDetector = () => {
        if (document.documentElement.dataset.perplexityObsNetworkInjected === 'true') {
            return;
        }

        document.documentElement.dataset.perplexityObsNetworkInjected = 'true';

        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('perplexity-network.js');

        script.onload = () => {
            console.log('[perplexity-obs] Perplexity network detector injected');
            script.remove();
        };

        script.onerror = (error) => {
            console.error('[perplexity-obs] Failed to inject network detector:', error);
        };

        (document.head || document.documentElement).appendChild(script);
    };

    injectNetworkDetector();

    console.log('[perplexity-obs] IIFE STARTED');
    console.log('[perplexity-obs] VERSION = API-V3 + TOKEN-ESTIMATION');
    console.log('[perplexity-obs] ACCOUNT DETECTION = auth endpoint (best-effort, verify)');

    const cfg = window.AI_OBS_CONFIG;

    console.log('[perplexity-obs] CONFIG:', cfg);

    if (!cfg?.apiBaseUrl) {
        console.error('[perplexity-obs] STOPPED: apiBaseUrl is missing');
        return;
    }

    const PROVIDER = 'perplexity';
    const PRODUCT = 'perplexity';

    // Best guess - verify in devtools and adjust if it 404s.
    const AUTH_ENDPOINT = '/api/auth/session';

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // ============================================================
    // MODEL DETECTION
    // ============================================================

    let currentModel = 'unknown';

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;

        const data = event.data;
        if (!data) return;

        if (data.source !== 'perplexity-observability' || data.type !== 'MODEL_DETECTED') {
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
        }

        console.log('[perplexity-obs] MODEL AUTO-DETECTED:', currentModel);
    });

    // ============================================================
    // EXTRACT EMAIL
    // ============================================================

    const extractEmailFromAuthResponse = (data) => {
        if (!data || typeof data !== 'object') return null;

        // Try a few common shapes since the real one is unconfirmed.
        const candidate =
            data?.user?.email ??
            data?.email ??
            data?.account?.email ??
            null;

        if (typeof candidate !== 'string') return null;

        const email = candidate.trim().toLowerCase();

        if (!EMAIL_REGEX.test(email)) return null;

        return email;
    };

    // ============================================================
    // FETCH ACCOUNT
    // ============================================================

    const fetchAccount = async () => {
        console.log('[perplexity-obs] STARTING ACCOUNT DETECTION via', AUTH_ENDPOINT);

        try {
            const response = await fetch(AUTH_ENDPOINT, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json' }
            });

            console.log('[perplexity-obs] auth API status:', response.status);

            if (!response.ok) {
                console.error('[perplexity-obs] auth API request failed:', response.status);
                return null;
            }

            const contentType = response.headers.get('content-type') || '';

            if (!contentType.includes('application/json')) {
                console.error('[perplexity-obs] auth API did not return JSON - endpoint is probably wrong for this site, check devtools');
                return null;
            }

            const data = await response.json();

            const email = extractEmailFromAuthResponse(data);

            if (!email) {
                console.error('[perplexity-obs] ACCOUNT NOT DETECTED - response shape did not match expected fields');
                return null;
            }

            console.log('[perplexity-obs] ACCOUNT DETECTED:', email);

            return email;

        } catch (error) {
            console.error('[perplexity-obs] AUTH API ERROR:', error);
            return null;
        }
    };

    // ============================================================
    // ACCOUNT STATE
    // ============================================================

    let employeeEmail = null;
    let collectorInitialized = false;

    const estimateTokens = (text) => {
        if (!text) return 0;
        return Math.ceil(text.length / 4);
    };

    // ============================================================
    // INITIALIZE COLLECTOR
    // ============================================================

    const initializeCollector = () => {
        if (collectorInitialized) {
            console.warn('[perplexity-obs] Collector already initialized');
            return;
        }

        if (!employeeEmail) {
            console.error('[perplexity-obs] Collector cannot start: no employee email');
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

        console.log('[perplexity-obs] INITIALIZING COLLECTOR. Employee:', employeeEmail, 'Session:', sessionId);

        // ========================================================
        // SEND EVENT
        // ========================================================

        const send = (event) => {
            if (!employeeEmail) {
                console.error('[perplexity-obs] EVENT BLOCKED: No employee email');
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

            console.log('[perplexity-obs] SENDING EVENT:', event.event_type);

            chrome.runtime.sendMessage(payload)
                .then(response => {
                    if (!response?.accepted) {
                        console.error('[perplexity-obs] EVENT REJECTED:', response);
                        return;
                    }
                    console.log('[perplexity-obs] EVENT ACCEPTED BY SERVICE WORKER');
                })
                .catch(error => {
                    console.error('[perplexity-obs] SERVICE WORKER ERROR:', error);
                });
        };

        // ========================================================
        // FIND PROMPT INPUT
        // ========================================================
        // Perplexity's search box is generally a textarea/contenteditable
        // near the top or bottom of the page - generic detection.

        const findPromptInput = () => {
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
        // GET RESPONSE
        // ========================================================

        const getResponseText = () => {
            const selectorCandidates = [
                '[class*="answer" i] [class*="prose" i]',
                '[class*="markdown" i]',
                '[class*="prose" i]'
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
                console.log('[perplexity-obs] Duplicate submit ignored');
                return;
            }

            lastInteractionStartedAt = now;

            const input = findPromptInput();
            let prompt = '';

            if (input) prompt = getInputText(input).trim();
            if (!prompt) prompt = lastKnownPrompt;

            if (!prompt) {
                console.warn('[perplexity-obs] Could not capture prompt');
                return;
            }

            previousResponseSnapshot = getResponseText();

            const promptTokens = estimateTokens(prompt);

            const signature = `${prompt.length}:${prompt}`;

            if (activeInteraction && activeInteraction.signature === signature) {
                console.log('[perplexity-obs] Duplicate interaction ignored');
                return;
            }

            if (signature === lastPromptSignature && !activeInteraction) {
                console.log('[perplexity-obs] Same prompt already processed');
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

            if (!response) return;

            if (interaction.previousResponse && response === interaction.previousResponse) {
                return;
            }

            const latency = Date.now() - interaction.startedAt;
            const responseLength = response.length;
            const responseTokens = estimateTokens(response);
            const totalTokens = interaction.promptTokens + responseTokens;

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

            const isSend = /send|submit|search|ask/i.test(combined) && !button.disabled;

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

        send({
            event_type: 'session_started',
            interaction_id: crypto.randomUUID(),
            metadata: {
                collector: 'api-v3',
                url_host: location.host
            }
        });

        console.log('[perplexity-obs] OBSERVER READY. Employee:', employeeEmail, 'Session:', sessionId);
    };

    // ============================================================
    // WAIT FOR ACCOUNT
    // ============================================================

    const waitForAccount = async () => {
        const detectedEmail = await fetchAccount();

        if (!detectedEmail) {
            console.error('[perplexity-obs] LOGIN NOT CONFIRMED - collector will NOT start');
            return;
        }

        employeeEmail = detectedEmail;

        console.log('[perplexity-obs] LOGIN CONFIRMED:', employeeEmail);

        initializeCollector();
    };

    waitForAccount();

})();