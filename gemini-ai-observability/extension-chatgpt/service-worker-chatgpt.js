console.log('[chatgpt-obs] SERVICE WORKER LOADED');

const API_BASE_URL = 'http://localhost:4000';

// ============================================================
// INSTALL / UPDATE
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
    console.log('[chatgpt-obs] Extension installed/updated');
});

// ============================================================
// MESSAGE HANDLER
// ============================================================

chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {

        console.log(
            '[chatgpt-obs] ==============================='
        );

        console.log(
            '[chatgpt-obs] MESSAGE RECEIVED'
        );

        console.log(
            '[chatgpt-obs] Raw message:',
            message
        );

        console.log(
            '[chatgpt-obs] Message type:',
            message?.type
        );

        console.log(
            '[chatgpt-obs] Sender tab:',
            sender?.tab?.id
        );

        console.log(
            '[chatgpt-obs] ==============================='
        );

        // --------------------------------------------------------
        // Validate message
        // --------------------------------------------------------

        if (!message) {
            console.error(
                '[chatgpt-obs] REJECTED: message is undefined'
            );

            sendResponse({
                accepted: false,
                error: 'message_undefined'
            });

            return false;
        }

        if (message.type !== 'CHATGPT_USAGE_EVENT') {
            console.warn(
                '[chatgpt-obs] Ignoring unrelated message:',
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
            '[chatgpt-obs] EVENT OBJECT:',
            event
        );

        if (!event) {
            console.error(
                '[chatgpt-obs] REJECTED: event is missing'
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
            '[chatgpt-obs] RESOLVED EMAIL:',
            email
        );

        if (!email) {
            console.error(
                '[chatgpt-obs] REJECTED: email is missing'
            );

            sendResponse({
                accepted: false,
                error: 'missing_email'
            });

            return false;
        }

        // --------------------------------------------------------
        // HARD-CODE CHATGPT PROVIDER
        // --------------------------------------------------------
        // This extension is ONLY for ChatGPT.
        //
        // Do NOT inherit provider/product from:
        // - Gemini
        // - Google
        // - another extension
        // - window config
        // - backend defaults
        //
        // Always identify this extension as:
        //
        // provider = openai
        // product  = chatgpt
        // --------------------------------------------------------

        const provider = 'openai';
        const product = 'chatgpt';

        console.log(
            '[chatgpt-obs] PROVIDER:',
            provider
        );

        console.log(
            '[chatgpt-obs] PRODUCT:',
            product
        );

        // --------------------------------------------------------
        // Event type
        // --------------------------------------------------------

        const eventType = event.event_type;

        console.log(
            '[chatgpt-obs] EVENT TYPE:',
            eventType
        );

        if (!eventType) {
            console.error(
                '[chatgpt-obs] REJECTED: event_type is missing'
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

        // --------------------------------------------------------
        // Build backend payload
        // --------------------------------------------------------

        const payload = {

            // ====================================================
            // IDENTITY
            // ====================================================

            email: email,

            // IMPORTANT:
            // These MUST be sent to the backend.
            provider: provider,
            product: product,

            department:
                event.department ?? null,

            role:
                event.role ?? null,

            // ====================================================
            // EVENT
            // ====================================================

            event_type:
                eventType,

            session_id:
                event.session_id ?? null,

            interaction_id:
                event.interaction_id ?? null,

            model:
                event.model ?? null,

            occurred_at:
                occurredAt,

            latency_ms:
                event.latency_ms ?? null,

            prompt_length:
                event.prompt_length ?? null,

            response_length:
                event.response_length ?? null,

            // ====================================================
            // METADATA
            // ====================================================

            metadata: {

                ...(event.metadata || {}),

                extension:
                    'chatgpt-observability',

                extension_version:
                    chrome.runtime.getManifest().version,

                source:
                    'chrome-extension',

                provider:
                    provider,

                product:
                    product,

                tab_id:
                    sender?.tab?.id ?? null,

                tab_url:
                    sender?.tab?.url ?? null
            }
        };

        // --------------------------------------------------------
        // Log final payload
        // --------------------------------------------------------

        console.log(
            '[chatgpt-obs] ==============================='
        );

        console.log(
            '[chatgpt-obs] FINAL BACKEND PAYLOAD'
        );

        console.log(
            '[chatgpt-obs] Email:',
            payload.email
        );

        console.log(
            '[chatgpt-obs] Provider:',
            payload.provider
        );

        console.log(
            '[chatgpt-obs] Product:',
            payload.product
        );

        console.log(
            '[chatgpt-obs] Event:',
            payload.event_type
        );

        console.log(
            '[chatgpt-obs] Session:',
            payload.session_id
        );

        console.log(
            '[chatgpt-obs] Interaction:',
            payload.interaction_id
        );

        console.log(
            '[chatgpt-obs] Payload:',
            payload
        );

        console.log(
            '[chatgpt-obs] ==============================='
        );

        // --------------------------------------------------------
        // Send to Node.js backend
        // --------------------------------------------------------

        fetch(
            `${API_BASE_URL}/api/usage/events`,
            {
                method: 'POST',

                headers: {
                    'Content-Type':
                        'application/json'
                },

                body:
                    JSON.stringify(payload)
            }
        )

            .then(async response => {

                console.log(
                    '[chatgpt-obs] BACKEND HTTP STATUS:',
                    response.status
                );

                let data = null;

                const contentType =
                    response.headers.get(
                        'content-type'
                    ) || '';

                if (
                    contentType.includes(
                        'application/json'
                    )
                ) {

                    try {

                        data =
                            await response.json();

                    } catch (error) {

                        console.error(
                            '[chatgpt-obs] JSON PARSE ERROR:',
                            error
                        );
                    }

                } else {

                    try {

                        data =
                            await response.text();

                    } catch {

                        data = null;
                    }
                }

                console.log(
                    '[chatgpt-obs] BACKEND RESPONSE:',
                    data
                );

                // ------------------------------------------------
                // Backend rejected request
                // ------------------------------------------------

                if (!response.ok) {

                    console.error(
                        '[chatgpt-obs] BACKEND REJECTED EVENT'
                    );

                    console.error(
                        '[chatgpt-obs] Status:',
                        response.status
                    );

                    console.error(
                        '[chatgpt-obs] Response:',
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
                    '[chatgpt-obs] ==============================='
                );

                console.log(
                    '[chatgpt-obs] EVENT SUCCESSFULLY SENT'
                );

                console.log(
                    '[chatgpt-obs] Employee:',
                    email
                );

                console.log(
                    '[chatgpt-obs] Provider:',
                    provider
                );

                console.log(
                    '[chatgpt-obs] Product:',
                    product
                );

                console.log(
                    '[chatgpt-obs] Event:',
                    eventType
                );

                console.log(
                    '[chatgpt-obs] Interaction:',
                    event.interaction_id
                );

                console.log(
                    '[chatgpt-obs] ==============================='
                );

                sendResponse({
                    accepted: true,
                    api: data
                });
            })

            .catch(error => {

                console.error(
                    '[chatgpt-obs] BACKEND FETCH ERROR:',
                    error
                );

                sendResponse({
                    accepted: false,
                    error: 'backend_unreachable',
                    message: error.message
                });
            });

        // Keep message channel alive while fetch runs.
        return true;
    }
);