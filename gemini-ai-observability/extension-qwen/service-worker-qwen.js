console.log('[qwen-obs] SERVICE WORKER LOADED');

const API_BASE_URL = 'http://localhost:4000';

// ============================================================
// INSTALL / UPDATE
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
    console.log(
        '[qwen-obs] Extension installed/updated'
    );
});

// ============================================================
// MESSAGE HANDLER
// ============================================================

chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {

        console.log(
            '[qwen-obs] ==============================='
        );

        console.log(
            '[qwen-obs] MESSAGE RECEIVED'
        );

        console.log(
            '[qwen-obs] Message type:',
            message?.type
        );

        console.log(
            '[qwen-obs] Sender tab:',
            sender?.tab?.id
        );

        console.log(
            '[qwen-obs] ==============================='
        );

        // --------------------------------------------------------
        // Validate message
        // --------------------------------------------------------

        if (!message) {
            console.error(
                '[qwen-obs] REJECTED: message is undefined'
            );

            sendResponse({
                accepted: false,
                error: 'message_undefined'
            });

            return false;
        }

        // ========================================================
        // ONLY ACCEPT QWEN USAGE EVENTS
        // ========================================================

        if (
            message.type !==
            'QWEN_USAGE_EVENT'
        ) {

            console.warn(
                '[qwen-obs] Ignoring unrelated message:',
                message.type
            );

            sendResponse({
                accepted: false,
                ignored: true
            });

            return false;
        }

        // ========================================================
        // GET EVENT
        // ========================================================

        const event = message.event;

        if (!event) {
            console.error(
                '[qwen-obs] REJECTED: event is missing'
            );

            sendResponse({
                accepted: false,
                error: 'event_undefined'
            });

            return false;
        }

        // ========================================================
        // GET QWEN ACCOUNT EMAIL
        // ========================================================

        const detectedEmail =
            event.email ||
            event.employeeEmail ||
            message.employeeEmail ||
            null;

        console.log(
            '[qwen-obs] DETECTED QWEN EMAIL:',
            detectedEmail
        );

        if (
            !detectedEmail ||
            typeof detectedEmail !== 'string'
        ) {

            console.error(
                '[qwen-obs] REJECTED: no employee email'
            );

            sendResponse({
                accepted: false,
                error: 'employee_email_missing'
            });

            return false;
        }

        // ========================================================
        // HARD-CODE QWEN PROVIDER
        // ========================================================

        const provider = 'alibaba';
        const product = 'qwen';

        // ========================================================
        // EVENT TYPE
        // ========================================================

        const eventType =
            event.event_type;

        if (!eventType) {

            console.error(
                '[qwen-obs] REJECTED: event_type is missing'
            );

            sendResponse({
                accepted: false,
                error: 'missing_event_type'
            });

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

            // IMPORTANT:
            // Backend now identifies the employee by email.
            email: detectedEmail,

            provider,
            product,

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
                    'qwen-observability',

                extension_version:
                    chrome.runtime.getManifest().version,

                source:
                    'chrome-extension',

                provider,

                product,

                detected_browser_email:
                    detectedEmail,

                tab_id:
                    sender?.tab?.id ?? null,

                tab_url:
                    sender?.tab?.url ?? null
            }
        };

        // ========================================================
        // LOG FINAL PAYLOAD
        // ========================================================

        console.log(
            '[qwen-obs] ==============================='
        );

        console.log(
            '[qwen-obs] FINAL BACKEND PAYLOAD'
        );

        console.log(
            '[qwen-obs] Employee Email:',
            payload.email
        );

        console.log(
            '[qwen-obs] Provider:',
            payload.provider
        );

        console.log(
            '[qwen-obs] Product:',
            payload.product
        );

        console.log(
            '[qwen-obs] Event:',
            payload.event_type
        );

        console.log(
            '[qwen-obs] Session:',
            payload.session_id
        );

        console.log(
            '[qwen-obs] Interaction:',
            payload.interaction_id
        );

        console.log(
            '[qwen-obs] Model:',
            payload.model
        );

        console.log(
            '[qwen-obs] ==============================='
        );

        // ========================================================
        // SEND TO NODE.JS BACKEND
        // ========================================================

        (async () => {

            try {

                const response =
                    await fetch(
                        `${API_BASE_URL}/api/usage/events`,
                        {
                            method: 'POST',

                            headers: {
                                'Content-Type':
                                    'application/json'
                            },

                            body:
                                JSON.stringify(
                                    payload
                                )
                        }
                    );

                console.log(
                    '[qwen-obs] BACKEND HTTP STATUS:',
                    response.status
                );

                // ------------------------------------------------
                // Parse response
                // ------------------------------------------------

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
                            '[qwen-obs] JSON PARSE ERROR:',
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
                    '[qwen-obs] BACKEND RESPONSE:',
                    data
                );

                // =================================================
                // BACKEND REJECTED REQUEST
                // =================================================

                if (!response.ok) {

                    console.error(
                        '[qwen-obs] BACKEND REJECTED EVENT'
                    );

                    console.error(
                        '[qwen-obs] Status:',
                        response.status
                    );

                    console.error(
                        '[qwen-obs] Response:',
                        data
                    );

                    sendResponse({
                        accepted: false,
                        error: 'api_error',
                        status:
                            response.status,
                        data
                    });

                    return;
                }

                // =================================================
                // SUCCESS
                // =================================================

                console.log(
                    '[qwen-obs] ==============================='
                );

                console.log(
                    '[qwen-obs] EVENT SUCCESSFULLY SENT'
                );

                console.log(
                    '[qwen-obs] Employee Email:',
                    detectedEmail
                );

                console.log(
                    '[qwen-obs] Provider:',
                    provider
                );

                console.log(
                    '[qwen-obs] Product:',
                    product
                );

                console.log(
                    '[qwen-obs] Event:',
                    eventType
                );

                console.log(
                    '[qwen-obs] Model:',
                    event.model
                );

                console.log(
                    '[qwen-obs] Interaction:',
                    event.interaction_id
                );

                console.log(
                    '[qwen-obs] ==============================='
                );

                sendResponse({
                    accepted: true,
                    api: data
                });

            } catch (error) {

                console.error(
                    '[qwen-obs] BACKEND FETCH ERROR:',
                    error
                );

                sendResponse({
                    accepted: false,
                    error: 'backend_unreachable',
                    message:
                        error.message
                });
            }

        })();

        // Keep message channel alive
        // while async work runs.
        return true;
    }
);