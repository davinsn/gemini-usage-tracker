console.log('[perplexity-obs] SERVICE WORKER LOADED');

const API_BASE_URL = 'http://localhost:4000';

// ============================================================
// INSTALL / UPDATE
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
    console.log('[perplexity-obs] Extension installed/updated');
});

// ============================================================
// MESSAGE HANDLER
// ============================================================

chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {

        console.log(
            '[perplexity-obs] ==============================='
        );

        console.log(
            '[perplexity-obs] MESSAGE RECEIVED'
        );

        console.log(
            '[perplexity-obs] Raw message:',
            message
        );

        console.log(
            '[perplexity-obs] Message type:',
            message?.type
        );

        console.log(
            '[perplexity-obs] Sender tab:',
            sender?.tab?.id
        );

        console.log(
            '[perplexity-obs] ==============================='
        );

        // --------------------------------------------------------
        // Validate message
        // --------------------------------------------------------

        if (!message) {
            console.error(
                '[perplexity-obs] REJECTED: message is undefined'
            );

            sendResponse({
                accepted: false,
                error: 'message_undefined'
            });

            return false;
        }

        if (message.type !== 'PERPLEXITY_USAGE_EVENT') {
            console.warn(
                '[perplexity-obs] Ignoring unrelated message:',
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
            '[perplexity-obs] EVENT OBJECT:',
            event
        );

        if (!event) {
            console.error(
                '[perplexity-obs] REJECTED: event is missing'
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
            '[perplexity-obs] RESOLVED EMAIL:',
            email
        );

        if (!email) {
            console.error(
                '[perplexity-obs] REJECTED: email is missing'
            );

            sendResponse({
                accepted: false,
                error: 'missing_email'
            });

            return false;
        }

        // --------------------------------------------------------
        // HARD-CODE PERPLEXITY PROVIDER
        // --------------------------------------------------------
        // This extension is ONLY for Perplexity.
        //
        // Do NOT inherit provider/product from:
        // - ChatGPT
        // - Gemini
        // - another extension
        // - window config
        // - backend defaults
        //
        // Always identify this extension as:
        //
        // provider = perplexity
        // product  = perplexity
        // --------------------------------------------------------

        const provider = 'perplexity';
        const product = 'perplexity';

        console.log(
            '[perplexity-obs] PROVIDER:',
            provider
        );

        console.log(
            '[perplexity-obs] PRODUCT:',
            product
        );

        // --------------------------------------------------------
        // Event type
        // --------------------------------------------------------

        const eventType = event.event_type;

        console.log(
            '[perplexity-obs] EVENT TYPE:',
            eventType
        );

        if (!eventType) {
            console.error(
                '[perplexity-obs] REJECTED: event_type is missing'
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
        // TOKEN ESTIMATES
        // ====================================================

        prompt_tokens:
            event.prompt_tokens ?? null,

        response_tokens:
            event.response_tokens ?? null,

        total_tokens:
            event.total_tokens ?? null,

        // ====================================================
        // METADATA
        // ====================================================

        metadata: {
            ...(event.metadata || {}),

            extension:
                'perplexity-observability',

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
            '[perplexity-obs] ==============================='
        );

        console.log(
            '[perplexity-obs] FINAL BACKEND PAYLOAD'
        );

        console.log(
            '[perplexity-obs] Email:',
            payload.email
        );

        console.log(
            '[perplexity-obs] Provider:',
            payload.provider
        );

        console.log(
            '[perplexity-obs] Product:',
            payload.product
        );

        console.log(
            '[perplexity-obs] Event:',
            payload.event_type
        );

        console.log(
            '[perplexity-obs] Session:',
            payload.session_id
        );

        console.log(
            '[perplexity-obs] Interaction:',
            payload.interaction_id
        );

        console.log(
            '[perplexity-obs] Payload:',
            payload
        );

        console.log(
            '[perplexity-obs] ==============================='
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
                    '[perplexity-obs] BACKEND HTTP STATUS:',
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
                            '[perplexity-obs] JSON PARSE ERROR:',
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
                    '[perplexity-obs] BACKEND RESPONSE:',
                    data
                );

                // ------------------------------------------------
                // Backend rejected request
                // ------------------------------------------------

                if (!response.ok) {

                    console.error(
                        '[perplexity-obs] BACKEND REJECTED EVENT'
                    );

                    console.error(
                        '[perplexity-obs] Status:',
                        response.status
                    );

                    console.error(
                        '[perplexity-obs] Response:',
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
                    '[perplexity-obs] ==============================='
                );

                console.log(
                    '[perplexity-obs] EVENT SUCCESSFULLY SENT'
                );

                console.log(
                    '[perplexity-obs] Employee:',
                    email
                );

                console.log(
                    '[perplexity-obs] Provider:',
                    provider
                );

                console.log(
                    '[perplexity-obs] Product:',
                    product
                );

                console.log(
                    '[perplexity-obs] Event:',
                    eventType
                );

                console.log(
                    '[perplexity-obs] Interaction:',
                    event.interaction_id
                );

                console.log(
                    '[perplexity-obs] ==============================='
                );

                sendResponse({
                    accepted: true,
                    api: data
                });
            })

            .catch(error => {

                console.error(
                    '[perplexity-obs] BACKEND FETCH ERROR:',
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