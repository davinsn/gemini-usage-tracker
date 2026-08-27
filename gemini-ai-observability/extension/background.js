console.log('[ai-obs] SERVICE WORKER LOADED');

const API_BASE_URL = 'http://localhost:4000';

// ============================================================
// INSTALL / UPDATE
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
    console.log('[ai-obs] Extension installed/updated');
});

// ============================================================
// MESSAGE HANDLER
// ============================================================

chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {

        console.log('[ai-obs] ===============================');
        console.log('[ai-obs] MESSAGE RECEIVED');
        console.log('[ai-obs] Message type:', message?.type);
        console.log('[ai-obs] Sender tab:', sender?.tab?.id);
        console.log('[ai-obs] ===============================');

        // --------------------------------------------------------
        // Validate message
        // --------------------------------------------------------

        if (!message) {
            console.error('[ai-obs] REJECTED: message is undefined');
            sendResponse({ accepted: false, error: 'message_undefined' });
            return false;
        }

        // ========================================================
        // ONLY ACCEPT USAGE EVENTS
        // ========================================================

        if (message.type !== 'AI_USAGE_EVENT') {
            console.warn('[ai-obs] Ignoring unrelated message:', message.type);
            sendResponse({ accepted: false, ignored: true });
            return false;
        }

        // ========================================================
        // GET EVENT
        // ========================================================

        const event = message.event;

        if (!event) {
            console.error('[ai-obs] REJECTED: event is missing');
            sendResponse({ accepted: false, error: 'event_undefined' });
            return false;
        }

        // ========================================================
        // EMAIL
        // ========================================================

        const detectedEmail =
            event.email ||
            event.employeeEmail ||
            message.employeeEmail ||
            null;

        console.log('[ai-obs] DETECTED EMPLOYEE EMAIL:', detectedEmail);

        if (!detectedEmail || typeof detectedEmail !== 'string') {
            console.error('[ai-obs] REJECTED: no employee email');
            sendResponse({ accepted: false, error: 'employee_email_missing' });
            return false;
        }

        // ========================================================
        // PROVIDER / PRODUCT (now dynamic, not hardcoded)
        // ========================================================

        const provider =
            event.provider ||
            message.provider ||
            'unknown';

        const product =
            event.product ||
            message.product ||
            'unknown';

        // ========================================================
        // EVENT TYPE
        // ========================================================

        const eventType = event.event_type;

        if (!eventType) {
            console.error('[ai-obs] REJECTED: event_type is missing');
            sendResponse({ accepted: false, error: 'missing_event_type' });
            return false;
        }

        // ========================================================
        // TIMESTAMP
        // ========================================================

        const occurredAt =
            event.occurred_at ||
            new Date().toISOString();

        // ========================================================
        // BUILD BACKEND PAYLOAD
        // ========================================================

        const payload = {
            email: detectedEmail,
            provider,
            product,
            event_type: eventType,
            session_id: event.session_id ?? null,
            interaction_id: event.interaction_id ?? null,
            model: event.model ?? null,
            occurred_at: occurredAt,
            latency_ms: event.latency_ms ?? null,
            prompt_length: event.prompt_length ?? null,
            response_length: event.response_length ?? null,
            prompt_tokens: event.prompt_tokens ?? null,
            response_tokens: event.response_tokens ?? null,
            total_tokens: event.total_tokens ?? null,

            metadata: {
                ...(event.metadata || {}),
                extension: 'ai-observability',
                extension_version: chrome.runtime.getManifest().version,
                source: 'chrome-extension',
                provider,
                product,
                detected_browser_email: detectedEmail,
                tab_id: sender?.tab?.id ?? null,
                tab_url: sender?.tab?.url ?? null
            }
        };

        console.log('[ai-obs] ===============================');
        console.log('[ai-obs] FINAL BACKEND PAYLOAD');
        console.log('[ai-obs] Event:', payload.event_type);
        console.log('[ai-obs] Email:', payload.email);
        console.log('[ai-obs] Provider:', payload.provider);
        console.log('[ai-obs] Product:', payload.product);
        console.log('[ai-obs] Session:', payload.session_id);
        console.log('[ai-obs] Interaction:', payload.interaction_id);
        console.log('[ai-obs] Model:', payload.model);
        console.log('[ai-obs] Latency:', payload.latency_ms);
        console.log('[ai-obs] Prompt tokens:', payload.prompt_tokens);
        console.log('[ai-obs] Response tokens:', payload.response_tokens);
        console.log('[ai-obs] Total tokens:', payload.total_tokens);
        console.log('[ai-obs] ===============================');

        // ========================================================
        // SEND TO BACKEND
        // ========================================================

        (async () => {
            try {
                console.log('[ai-obs] POSTING EVENT TO:', `${API_BASE_URL}/api/usage/events`);

                const response = await fetch(`${API_BASE_URL}/api/usage/events`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                console.log('[ai-obs] BACKEND HTTP STATUS:', response.status);

                const contentType = response.headers.get('content-type') || '';
                let data = null;

                if (contentType.includes('application/json')) {
                    try {
                        data = await response.json();
                    } catch (error) {
                        console.error('[ai-obs] JSON PARSE ERROR:', error);
                    }
                } else {
                    try {
                        data = await response.text();
                    } catch {
                        data = null;
                    }
                }

                console.log('[ai-obs] BACKEND RESPONSE:', data);

                if (!response.ok) {
                    console.error('[ai-obs] ❌ BACKEND REJECTED EVENT');
                    console.error('[ai-obs] Event type:', eventType);
                    console.error('[ai-obs] Interaction:', payload.interaction_id);
                    console.error('[ai-obs] HTTP status:', response.status);
                    console.error('[ai-obs] Backend response:', data);

                    sendResponse({
                        accepted: false,
                        error: 'api_error',
                        status: response.status,
                        data
                    });
                    return;
                }

                console.log('[ai-obs] ✅ EVENT SUCCESSFULLY SENT');
                console.log('[ai-obs] Event type:', eventType);
                console.log('[ai-obs] Interaction:', payload.interaction_id);
                console.log('[ai-obs] Backend status:', response.status);
                console.log('[ai-obs] ===============================');

                sendResponse({ accepted: true, api: data });

            } catch (error) {
                console.error('[ai-obs] ❌ BACKEND FETCH ERROR:', error);
                sendResponse({
                    accepted: false,
                    error: 'backend_unreachable',
                    message: error.message
                });
            }
        })();

        // Keep message channel open for async sendResponse
        return true;
    }
);