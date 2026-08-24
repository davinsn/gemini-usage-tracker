console.log('[gemini-obs] SERVICE WORKER LOADED');

const API_BASE_URL = 'http://localhost:4000';

// ============================================================
// INSTALL / UPDATE
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
    console.log('[gemini-obs] Extension installed/updated');
});

// ============================================================
// MESSAGE HANDLER
// ============================================================

chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {

        console.log('[gemini-obs] ===============================');
        console.log('[gemini-obs] MESSAGE RECEIVED');
        console.log('[gemini-obs] Raw message:', message);
        console.log('[gemini-obs] Message type:', message?.type);
        console.log('[gemini-obs] Sender tab:', sender?.tab?.id);
        console.log('[gemini-obs] ===============================');

        // --------------------------------------------------------
        // Validate message
        // --------------------------------------------------------

        if (!message) {
            console.error(
                '[gemini-obs] REJECTED: message is undefined'
            );

            sendResponse({
                accepted: false,
                error: 'message_undefined'
            });

            return false;
        }

        if (message.type !== 'GEMINI_USAGE_EVENT') {
            console.warn(
                '[gemini-obs] Ignoring unrelated message:',
                message.type
            );

            sendResponse({
                accepted: false,
                ignored: true
            });

            return false;
        }

        // --------------------------------------------------------
        // Get event
        // --------------------------------------------------------

        const event = message.event;

        console.log(
            '[gemini-obs] EVENT OBJECT:',
            event
        );

        if (!event) {
            console.error(
                '[gemini-obs] REJECTED: event is missing'
            );

            sendResponse({
                accepted: false,
                error: 'event_undefined'
            });

            return false;
        }

        // --------------------------------------------------------
        // Resolve employee email
        // --------------------------------------------------------

        const email =
            event.email ||
            event.employeeEmail ||
            message.employeeEmail ||
            null;

        console.log(
            '[gemini-obs] RESOLVED EMAIL:',
            email
        );

        if (!email) {
            console.error(
                '[gemini-obs] REJECTED: email is missing'
            );

            sendResponse({
                accepted: false,
                error: 'missing_email'
            });

            return false;
        }

        // --------------------------------------------------------
        // Event type
        // --------------------------------------------------------

        const eventType = event.event_type;

        console.log(
            '[gemini-obs] EVENT TYPE:',
            eventType
        );

        if (!eventType) {
            console.error(
                '[gemini-obs] REJECTED: event_type is missing'
            );

            sendResponse({
                accepted: false,
                error: 'missing_event_type'
            });

            return false;
        }

        // --------------------------------------------------------
        // Timestamp
        // --------------------------------------------------------

        const occurredAt =
            event.occurred_at ||
            new Date().toISOString();


        const provider = 'google';
        const product = 'gemini';

        console.log('[gemini-obs] PROVIDER:', provider);
        console.log('[gemini-obs] PRODUCT:', product);

        // --------------------------------------------------------
        // Build backend payload
        // --------------------------------------------------------

        const payload = {
            email: email,

            provider: provider,
            product: product,

            department: event.department ?? null,
            role: event.role ?? null,

            event_type: eventType,
            session_id: event.session_id ?? null,
            interaction_id: event.interaction_id ?? null,
            model: event.model ?? null,
            occurred_at: occurredAt,
            latency_ms: event.latency_ms ?? null,
            prompt_length: event.prompt_length ?? null,
            response_length: event.response_length ?? null,

            metadata: {
                ...(event.metadata || {}),
                extension: 'gemini-observability',
                extension_version:
                    chrome.runtime.getManifest().version,
                source: 'chrome-extension',

                provider: provider,
                product: product,

                tab_id: sender?.tab?.id ?? null,
                tab_url: sender?.tab?.url ?? null
            }
        };

        console.log('[gemini-obs] ===============================');
        console.log('[gemini-obs] SENDING TO BACKEND');
        console.log(
            '[gemini-obs] URL:',
            `${API_BASE_URL}/api/usage/events`
        );
        console.log('[gemini-obs] Payload:', payload);
        console.log('[gemini-obs] ===============================');

        // --------------------------------------------------------
        // Send to Node.js
        // --------------------------------------------------------

        fetch(
            `${API_BASE_URL}/api/usage/events`,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify(payload)
            }
        )
            .then(async response => {

                console.log(
                    '[gemini-obs] BACKEND HTTP STATUS:',
                    response.status
                );

                let data = null;

                const contentType =
                    response.headers.get('content-type') || '';

                if (
                    contentType.includes(
                        'application/json'
                    )
                ) {
                    try {
                        data = await response.json();
                    } catch (error) {
                        console.error(
                            '[gemini-obs] JSON PARSE ERROR:',
                            error
                        );
                    }
                } else {
                    try {
                        data = await response.text();
                    } catch {
                        data = null;
                    }
                }

                console.log(
                    '[gemini-obs] BACKEND RESPONSE:',
                    data
                );

                // ------------------------------------------------
                // Backend rejected request
                // ------------------------------------------------

                if (!response.ok) {

                    console.error(
                        '[gemini-obs] BACKEND REJECTED EVENT'
                    );

                    console.error(
                        '[gemini-obs] Status:',
                        response.status
                    );

                    console.error(
                        '[gemini-obs] Response:',
                        data
                    );

                    sendResponse({
                        accepted: false,
                        error: 'api_error',
                        status: response.status,
                        data: data
                    });

                    return;
                }

                // ------------------------------------------------
                // Success
                // ------------------------------------------------

                console.log(
                    '[gemini-obs] ==============================='
                );

                console.log(
                    '[gemini-obs] EVENT SUCCESSFULLY SENT'
                );

                console.log(
                    '[gemini-obs] Employee:',
                    email
                );

                console.log(
                    '[gemini-obs] Event:',
                    eventType
                );

                console.log(
                    '[gemini-obs] Interaction:',
                    event.interaction_id
                );

                console.log(
                    '[gemini-obs] ==============================='
                );

                sendResponse({
                    accepted: true,
                    api: data
                });
            })

            .catch(error => {

                console.error(
                    '[gemini-obs] BACKEND FETCH ERROR:',
                    error
                );

                sendResponse({
                    accepted: false,
                    error: 'backend_unreachable',
                    message: error.message
                });
            });

        // Keep the message channel alive while fetch runs.
        return true;
    }
);