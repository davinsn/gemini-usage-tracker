console.log('[gemini-obs] ===============================');
console.log('[gemini-obs] CONTENT SCRIPT LOADED');
console.log('[gemini-obs] URL:', location.href);
console.log('[gemini-obs] ===============================');

// ================================================================
// IMPORTANT CAVEAT
// ================================================================
// Unlike ChatGPT/Qwen, Gemini's web client is a Google internal app
// (WIZ / batchexecute RPC), not a simple REST API with a JSON
// session or model field. There is no stable public endpoint like
// `/api/auth/session` that returns the signed-in email, and request
// bodies aren't plain JSON with a "model" key.
//
// This script therefore detects both the account email and the
// active model from the DOM instead of the network layer. DOM
// structure changes far more often than a REST API, so treat the
// selectors below as a starting point you WILL need to re-check in
// devtools (Elements tab) against the live Gemini UI.
// ================================================================

(() => {

    console.log('[gemini-obs] IIFE STARTED');
    console.log('[gemini-obs] VERSION = API-V3 + TOKEN-ESTIMATION');
    console.log('[gemini-obs] ACCOUNT DETECTION = DOM (best effort)');
    console.log('[gemini-obs] MODEL DETECTION = DOM (best effort)');

    const cfg = window.AI_OBS_CONFIG;

    console.log('[gemini-obs] CONFIG:', cfg);

    if (!cfg?.apiBaseUrl) {
        console.error('[gemini-obs] STOPPED: apiBaseUrl is missing');
        return;
    }

    const PROVIDER = 'google';
    const PRODUCT = 'gemini';

    const EMAIL_REGEX = /[^\s@()<>[\]]+@[^\s@()<>[\]]+\.[^\s@()<>[\]]+/;

    // ============================================================
    // ACCOUNT DETECTION (DOM)
    // ============================================================
    // The Google account switcher button in the top-right usually
    // exposes the signed-in email via aria-label/title, e.g.
    // aria-label="Google Account: Jane Doe (jane@company.com)".
    // Adjust selector if Google changes the account button markup.

    const findAccountEmail = () => {
        const candidates = [
            ...document.querySelectorAll(
                'a[aria-label*="@"], [aria-label*="Account"][aria-label*="@"], img[alt*="@"]'
            )
        ];

        for (const el of candidates) {
            const text =
                el.getAttribute('aria-label') ||
                el.getAttribute('alt') ||
                el.getAttribute('title') ||
                '';

            const match = text.match(EMAIL_REGEX);

            if (match) {
                return match[0].trim().toLowerCase();
            }
        }

        return null;
    };

    // Poll for the account button since it can render asynchronously
    // after the rest of the page.
    const waitForAccountEmail = (maxWaitMs = 8000, intervalMs = 250) => {
        return new Promise((resolve) => {
            const startedAt = Date.now();

            const check = () => {
                const email = findAccountEmail();

                if (email) {
                    resolve(email);
                    return;
                }

                if (Date.now() - startedAt >= maxWaitMs) {
                    resolve(null);
                    return;
                }

                setTimeout(check, intervalMs);
            };

            check();
        });
    };

    // ============================================================
    // MODEL DETECTION (DOM)
    // ============================================================
    // Gemini shows the active model in a selector button near the
    // top of the chat, with text like "2.5 Flash" or "2.5 Pro".
    // We look for that pattern in short button/menu labels.

    const MODEL_TEXT_REGEX = /\b(\d+(?:\.\d+)?\s*(?:Flash|Pro|Ultra|Nano))\b/i;

    const detectModelFromDom = () => {
        const candidates = [
            ...document.querySelectorAll('button, [role="button"], span')
        ];

        for (const el of candidates) {
            const text = (el.innerText || '').trim();

            if (!text || text.length > 40) continue;

            const match = text.match(MODEL_TEXT_REGEX);

            if (match) {
                return `gemini-${match[1].toLowerCase().replace(/\s+/g, '-')}`;
            }
        }

        return null;
    };

    let currentModel = 'unknown';

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
        return Math.ceil(text.length / 4);
    };

    // ============================================================
    // INITIALIZE COLLECTOR
    // ============================================================

    const initializeCollector = () => {
        if (collectorInitialized) {
            console.warn('[gemini-obs] Collector already initialized');
            return;
        }

        if (!employeeEmail) {
            console.error('[gemini-obs] Collector cannot start: no employee email');
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

        console.log('[gemini-obs] =================================');
        console.log('[gemini-obs] INITIALIZING COLLECTOR');
        console.log('[gemini-obs] Employee:', employeeEmail);
        console.log('[gemini-obs] Session:', sessionId);
        console.log('[gemini-obs] =================================');

        // ========================================================
        // SEND EVENT
        // ========================================================

        const send = (event) => {
            if (!employeeEmail) {
                console.error('[gemini-obs] EVENT BLOCKED: No employee email');
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

            console.log('[gemini-obs] SENDING EVENT:', event.event_type);

            chrome.runtime.sendMessage(payload)
                .then(response => {
                    if (!response?.accepted) {
                        console.error('[gemini-obs] EVENT REJECTED:', response);
                        return;
                    }
                    console.log('[gemini-obs] EVENT ACCEPTED BY SERVICE WORKER');
                })
                .catch(error => {
                    console.error('[gemini-obs] SERVICE WORKER ERROR:', error);
                });
        };

        // ========================================================
        // FIND PROMPT INPUT
        // ========================================================
        // Gemini's composer is a rich-text contenteditable div
        // (usually role="textbox"). Generic fallback kept broad.

        const findPromptInput = () => {
            const candidates = [
                ...document.querySelectorAll(
                    'div[contenteditable="true"][role="textbox"], textarea, [contenteditable="true"]'
                )
            ];

            const visible = candidates.filter(el => {
                const rect = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                return (
                    rect.width > 0 &&
                    rect.height > 0 &&
                    style.display !== 'none' &&
                    style.visibility !== 'hidden'
                );
            });

            return visible[0] || null;
        };

        const getInputText = (input) => {
            if (!input) return '';
            return (input.innerText || input.textContent || '');
        };

        // ========================================================
        // GET GEMINI RESPONSE
        // ========================================================
        // Gemini response bubbles typically live in a
        // "model-response" custom element or a message-content div.

        const getResponseText = () => {
            const selectorCandidates = [
                'message-content',
                '[class*="model-response" i]',
                '[class*="response-content" i]',
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
                console.log('[gemini-obs] Duplicate submit ignored');
                return;
            }

            lastInteractionStartedAt = now;

            const input = findPromptInput();
            let prompt = '';

            if (input) prompt = getInputText(input).trim();
            if (!prompt) prompt = lastKnownPrompt;

            if (!prompt) {
                console.warn('[gemini-obs] Could not capture prompt');
                return;
            }

            previousResponseSnapshot = getResponseText();

            const promptTokens = estimateTokens(prompt);

            console.log('[gemini-obs] PROMPT CAPTURED, length:', prompt.length);

            const signature = `${prompt.length}:${prompt}`;

            if (activeInteraction && activeInteraction.signature === signature) {
                console.log('[gemini-obs] Duplicate interaction ignored');
                return;
            }

            if (signature === lastPromptSignature && !activeInteraction) {
                console.log('[gemini-obs] Same prompt already processed');
                return;
            }

            lastPromptSignature = signature;

            const interactionId = crypto.randomUUID();
            const startedAt = Date.now();

            // Re-check the model selector right at submit time, since
            // there's no network event to key off of.
            const detectedModel = detectModelFromDom();
            if (detectedModel) currentModel = detectedModel;

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

            send({
                event_type: 'interaction_started',
                interaction_id: interactionId,
                model: activeInteraction.model,
                prompt_length: prompt.length,
                prompt_tokens: promptTokens,
                metadata: {
                    collector: 'api-v3',
                    prompt_capture: 'pre-submit',
                    model_detection: detectedModel ? 'dom' : 'unavailable',
                    token_estimation: 'characters-divided-by-4'
                }
            });

            lastKnownPrompt = '';
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

            console.log('[gemini-obs] COMPLETING INTERACTION', interaction.interactionId);

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

        send({
            event_type: 'session_started',
            interaction_id: crypto.randomUUID(),
            metadata: {
                collector: 'api-v3',
                url_host: location.host
            }
        });

        console.log('[gemini-obs] OBSERVER READY. Employee:', employeeEmail, 'Session:', sessionId);
    };

    // ============================================================
    // WAIT FOR ACCOUNT
    // ============================================================

    const waitForAccount = async () => {
        console.log('[gemini-obs] Waiting for account email in DOM...');

        const detectedEmail = await waitForAccountEmail();

        if (!detectedEmail) {
            console.error('[gemini-obs] LOGIN NOT CONFIRMED (could not find email in DOM) - collector will NOT start');
            return;
        }

        employeeEmail = detectedEmail;

        console.log('[gemini-obs] LOGIN CONFIRMED:', employeeEmail);

        initializeCollector();
    };

    waitForAccount();

})();