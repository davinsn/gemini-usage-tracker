(function () {
    'use strict';

    if (window.__CHATGPT_OBS_NETWORK_HOOKED__) {
        console.log('[chatgpt-obs-network] Already hooked');
        return;
    }

    window.__CHATGPT_OBS_NETWORK_HOOKED__ = true;

    console.log('[chatgpt-obs-network] ===============================');
    console.log('[chatgpt-obs-network] NETWORK HOOK LOADED');
    console.log('[chatgpt-obs-network] URL:', location.href);
    console.log('[chatgpt-obs-network] ===============================');

    const originalFetch = window.fetch;

    const sendModelToExtension = (model) => {
        if (!model || typeof model !== 'string') return;

        const cleanModel = model.trim();
        if (!cleanModel) return;

        console.log('[chatgpt-obs-network] MODEL DETECTED:', cleanModel);

        window.postMessage(
            {
                source: 'chatgpt-observability',
                type: 'MODEL_DETECTED',
                model: cleanModel
            },
            '*'
        );
    };

    // ChatGPT's /backend-api/conversation (and /backend-api/f/conversation)
    // request body is JSON with a top-level "model" field, e.g.
    // { "action": "next", "model": "gpt-4o", "messages": [...] }
    const extractModelFromBody = (body) => {
        if (!body) return null;

        if (typeof body === 'string') {
            try {
                const data = JSON.parse(body);

                if (data && typeof data.model === 'string') {
                    return data.model;
                }
            } catch {
                // Not JSON
            }
        }

        return null;
    };

    window.fetch = async function (...args) {
        try {
            const input = args[0];
            const init = args[1];

            let url = '';
            let body = null;

            if (typeof input === 'string') {
                url = input;
                if (init && typeof init.body === 'string') {
                    body = init.body;
                }
            } else if (input && typeof input.url === 'string') {
                url = input.url;
                if (init && typeof init.body === 'string') {
                    body = init.body;
                }
            }

            const model = extractModelFromBody(body);
            if (model) {
                sendModelToExtension(model);
            }

            if (url && /conversation|backend-api/i.test(url)) {
                console.log('[chatgpt-obs-network] ChatGPT fetch:', url);
                if (body) {
                    console.log('[chatgpt-obs-network] Request body:', body);
                }
            }

        } catch (error) {
            console.warn('[chatgpt-obs-network] FETCH INSPECTION ERROR:', error);
        }

        return originalFetch.apply(this, args);
    };

    console.log('[chatgpt-obs-network] Fetch interception ENABLED');

})();