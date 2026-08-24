console.log('[gemini-obs] SERVICE WORKER LOADED');

// ============================================================
// CONFIG
// ============================================================

const API_BASE_URL = 'http://localhost:4000';


// ============================================================
// INSTALL / STARTUP
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
    console.log('[gemini-obs] Extension installed/updated');
});


// ============================================================
// MESSAGE HANDLER
// ============================================================

chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {

        console.log(
            '[gemini-obs] MESSAGE RECEIVED:',
            message
        );


        // --------------------------------------------------------
        // Ignore unrelated messages
        // --------------------------------------------------------

        if (
            !message ||
            message.type !== 'GEMINI_USAGE_EVENT'
        ) {

            sendResponse({
                accepted: false,
                ignored: true
            });

            return false;
        }


        // --------------------------------------------------------
        // Validate event
        // --------------------------------------------------------

        const event =
            message.event || {};


        if (!event.email) {

            console.error(
                '[gemini-obs] EVENT REJECTED: No email'
            );

            sendResponse({
                accepted: false,
                error: 'missing_email'
            });

            return false;
        }


        if (!event.event_type) {

            console.error(
                '[gemini-obs] EVENT REJECTED: No event_type'
            );

            sendResponse({
                accepted: false,
                error: 'missing_event_type'
            });

            return false;
        }


        if (!event.occurred_at) {

            console.error(
                '[gemini-obs] EVENT REJECTED: No occurred_at'
            );

            sendResponse({
                accepted: false,
                error: 'missing_occurred_at'
            });

            return false;
        }


        // --------------------------------------------------------
        // Add extension information
        // --------------------------------------------------------

        const payload = {

            email:
                event.email,

            department:
                event.department ?? null,

            role:
                event.role ?? null,

            event_type:
                event.event_type,

            session_id:
                event.session_id ?? null,

            interaction_id:
                event.interaction_id ?? null,

            model:
                event.model ?? null,

            occurred_at:
                event.occurred_at,

            latency_ms:
                event.latency_ms ?? null,

            prompt_length:
                event.prompt_length ?? null,

            response_length:
                event.response_length ?? null,

            metadata: {

                ...(event.metadata || {}),

                extension: 'gemini-observability',

                extension_version:
                    chrome.runtime.getManifest().version,

                source:
                    'chrome-extension',

                tab_id:
                    sender.tab?.id ?? null,

                tab_url:
                    sender.tab?.url ?? null
            }
        };


        console.log(
            '[gemini-obs] SENDING TO API:',
            payload
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

                let data = null;

                try {
                    data =
                        await response.json();
                } catch {
                    data = null;
                }


                if (!response.ok) {

                    console.error(
                        '[gemini-obs] API ERROR:',
                        response.status,
                        data
                    );

                    sendResponse({
                        accepted: false,

                        error:
                            'api_error',

                        status:
                            response.status,

                        data
                    });

                    return;
                }


                console.log(
                    '[gemini-obs] API SUCCESS:',
                    data
                );


                sendResponse({
                    accepted: true,
                    api: data
                });
            })
            .catch(error => {

                console.error(
                    '[gemini-obs] FETCH ERROR:',
                    error
                );


                sendResponse({
                    accepted: false,

                    error:
                        'backend_unreachable',

                    message:
                        error.message
                });
            });


        // IMPORTANT:
        // Keeps sendResponse alive while fetch() runs.
        return true;
    }
);