console.log('[qwen-obs] SERVICE WORKER LOADED');

const API_BASE_URL = 'http://localhost:4000';

// ============================================================
// AUTH STORAGE
// ============================================================
// The backend now requires a JWT bearer token on every
// /api/usage/events request. The token is obtained by logging
// in via /api/auth/login (email + password) from the extension
// popup, then cached here in chrome.storage.local so the
// service worker can attach it to every outgoing event.
// ============================================================

const AUTH_STORAGE_KEY = 'qwen_obs_auth';

async function getStoredAuth() {

    try {

        const result =
            await chrome.storage.local.get(
                [AUTH_STORAGE_KEY]
            );

        return result?.[AUTH_STORAGE_KEY] || null;

    } catch (error) {

        console.error(
            '[qwen-obs] Failed to read stored auth:',
            error
        );

        return null;
    }
}

async function setStoredAuth(auth) {

    try {

        await chrome.storage.local.set({
            [AUTH_STORAGE_KEY]: auth
        });

    } catch (error) {

        console.error(
            '[qwen-obs] Failed to persist auth:',
            error
        );
    }
}

async function clearStoredAuth() {

    try {

        await chrome.storage.local.remove(
            [AUTH_STORAGE_KEY]
        );

    } catch (error) {

        console.error(
            '[qwen-obs] Failed to clear stored auth:',
            error
        );
    }
}

// ============================================================
// LOGIN / LOGOUT (called from the extension popup)
// ============================================================

async function performLogin(email, password) {

    try {

        const response = await fetch(
            `${API_BASE_URL}/api/auth/login`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email,
                    password
                })
            }
        );

        const data = await response.json().catch(
            () => null
        );

        if (!response.ok || !data?.success) {

            console.warn(
                '[qwen-obs] Login failed:',
                data?.error || response.status
            );

            return {
                success: false,
                error:
                    data?.error ||
                    'login_failed'
            };
        }

        await setStoredAuth({
            token: data.token,
            employee: data.employee
        });

        console.log(
            '[qwen-obs] Login succeeded for:',
            data.employee?.email
        );

        return {
            success: true,
            employee: data.employee
        };

    } catch (error) {

        console.error(
            '[qwen-obs] Login request failed:',
            error
        );

        return {
            success: false,
            error: 'network_error'
        };
    }
}

async function performLogout() {

    await clearStoredAuth();

    return { success: true };
}

// ============================================================
// INSTALL / UPDATE
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
    console.log('[qwen-obs] Extension installed/updated');
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
            '[qwen-obs] Raw message:',
            message
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

        // ==========================================================
        // AUTH MESSAGES (from popup)
        // ==========================================================

        if (message.type === 'QWEN_OBS_LOGIN') {

            performLogin(
                message.email,
                message.password
            ).then(sendResponse);

            return true;
        }

        if (message.type === 'QWEN_OBS_LOGOUT') {

            performLogout().then(sendResponse);

            return true;
        }

        if (message.type === 'QWEN_OBS_GET_AUTH_STATUS') {

            getStoredAuth().then(auth => {

                sendResponse({
                    authenticated: Boolean(auth?.token),
                    employee: auth?.employee || null
                });
            });

            return true;
        }

        // ==========================================================
        // USAGE EVENTS
        // ==========================================================

        if (message.type !== 'QWEN_USAGE_EVENT') {
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

        // --------------------------------------------------------
        // Get event
        // --------------------------------------------------------

        const event = message.event;

        console.log(
            '[qwen-obs] EVENT OBJECT:',
            event
        );

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

        // --------------------------------------------------------
        // Detected browser email (informational only now)
        // --------------------------------------------------------
        // Identity for the backend now comes from the JWT bearer
        // token, not from this value. We still surface it in
        // metadata for auditing (e.g. flagging mismatches between
        // the Qwen account in the browser and the logged-in
        // extension user), but it is no longer required.
        // --------------------------------------------------------

        const detectedEmail =
            event.email ||
            event.employeeEmail ||
            message.employeeEmail ||
            null;

        console.log(
            '[qwen-obs] DETECTED BROWSER EMAIL (informational):',
            detectedEmail
        );

        // --------------------------------------------------------
        // HARD-CODE QWEN PROVIDER
        // --------------------------------------------------------
        // This extension is ONLY for Qwen.
        //
        // Do NOT inherit provider/product from:
        // - OpenAI / ChatGPT
        // - Gemini
        // - Google
        // - Perplexity
        // - another extension
        // - window config
        // - backend defaults
        //
        // Always identify this extension as:
        //
        // provider = alibaba
        // product  = qwen
        // --------------------------------------------------------

        const provider = 'alibaba';
        const product = 'qwen';

        console.log(
            '[qwen-obs] PROVIDER:',
            provider
        );

        console.log(
            '[qwen-obs] PRODUCT:',
            product
        );

        // --------------------------------------------------------
        // Event type
        // --------------------------------------------------------

        const eventType = event.event_type;

        console.log(
            '[qwen-obs] EVENT TYPE:',
            eventType
        );

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

        // --------------------------------------------------------
        // Timestamp
        // --------------------------------------------------------

        const occurredAt =
            event.occurred_at ||
            new Date().toISOString();

        // --------------------------------------------------------
        // Build backend payload
        // --------------------------------------------------------
        // NOTE: The backend no longer accepts or needs email /
        // department / role in the event payload — the employee
        // is resolved server-side from the bearer token. We keep
        // detectedEmail only inside metadata, purely for auditing.
        // --------------------------------------------------------

        const payload = {

            provider: provider,
            product: product,

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

                provider:
                    provider,

                product:
                    product,

                detected_browser_email:
                    detectedEmail,

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
            '[qwen-obs] ==============================='
        );

        console.log(
            '[qwen-obs] FINAL BACKEND PAYLOAD'
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
            '[qwen-obs] Payload:',
            payload
        );

        console.log(
            '[qwen-obs] ==============================='
        );

        // --------------------------------------------------------
        // Send to Node.js backend (requires Bearer auth)
        // --------------------------------------------------------

        (async () => {

            const auth = await getStoredAuth();

            if (!auth?.token) {

                console.error(
                    '[qwen-obs] REJECTED: not authenticated. ' +
                    'Log in via the extension popup first.'
                );

                sendResponse({
                    accepted: false,
                    error: 'not_authenticated'
                });

                return;
            }

            try {

                const response = await fetch(
                    `${API_BASE_URL}/api/usage/events`,
                    {
                        method: 'POST',

                        headers: {
                            'Content-Type':
                                'application/json',

                            'Authorization':
                                `Bearer ${auth.token}`
                        },

                        body:
                            JSON.stringify(payload)
                    }
                );

                console.log(
                    '[qwen-obs] BACKEND HTTP STATUS:',
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

                // ------------------------------------------------
                // Expired / invalid token
                // ------------------------------------------------

                if (response.status === 401) {

                    console.error(
                        '[qwen-obs] TOKEN REJECTED (401). ' +
                        'Clearing stored auth — user must log ' +
                        'in again via the extension popup.'
                    );

                    await clearStoredAuth();

                    sendResponse({
                        accepted: false,
                        error: 'reauthentication_required',
                        status: response.status,
                        data: data
                    });

                    return;
                }

                // ------------------------------------------------
                // Backend rejected request
                // ------------------------------------------------

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
                        status: response.status,
                        data: data
                    });

                    return;
                }

                // ------------------------------------------------
                // Success
                // ------------------------------------------------

                console.log(
                    '[qwen-obs] ==============================='
                );

                console.log(
                    '[qwen-obs] EVENT SUCCESSFULLY SENT'
                );

                console.log(
                    '[qwen-obs] Employee (token-authenticated):',
                    auth.employee?.email
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
                    message: error.message
                });
            }
        })();

        // Keep message channel alive while the async work runs.
        return true;
    }
);