(function () {
    'use strict';

    if (window.__PERPLEXITY_OBS_NETWORK_HOOKED__) {
        console.log('[perplexity-obs-network] Already hooked');
        return;
    }

    window.__PERPLEXITY_OBS_NETWORK_HOOKED__ = true;

    console.log('[perplexity-obs-network] ===============================');
    console.log('[perplexity-obs-network] NETWORK HOOK LOADED');
    console.log('[perplexity-obs-network] URL:', location.href);
    console.log('[perplexity-obs-network] ===============================');

    const originalFetch = window.fetch;

    const sendModelToExtension = (model) => {
        if (!model || typeof model !== 'string') return;

        const cleanModel = model.trim();
        if (!cleanModel) return;

        console.log('[perplexity-obs-network] MODEL DETECTED:', cleanModel);

        window.postMessage(
            {
                source: 'perplexity-observability',
                type: 'MODEL_DETECTED',
                model: cleanModel
            },
            '*'
        );
    };

    // NOTE: the exact field name Perplexity uses for the selected
    // model in its request payloads isn't publicly documented the
    // way ChatGPT's is. This checks a handful of plausible keys -
    // inspect a real /rest/... or /api/... request body in devtools
    // and add/adjust keys here if none of these match.
    const CANDIDATE_MODEL_KEYS = [
        'model',
        'model_preference',
        'model_name',
        'search_focus_model'
    ];

    const extractModelFromBody = (body) => {
        if (!body) return null;

        if (typeof body === 'string') {
            try {
                const data = JSON.parse(body);

                if (data && typeof data === 'object') {
                    for (const key of CANDIDATE_MODEL_KEYS) {
                        if (typeof data[key] === 'string') {
                            return data[key];
                        }
                    }
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

            if (url && /perplexity|rest|api/i.test(url)) {
                console.log('[perplexity-obs-network] Perplexity fetch:', url);
                if (body) {
                    console.log('[perplexity-obs-network] Request body:', body);
                }
            }

        } catch (error) {
            console.warn('[perplexity-obs-network] FETCH INSPECTION ERROR:', error);
        }

        return originalFetch.apply(this, args);
    };

    console.log('[perplexity-obs-network] Fetch interception ENABLED');

})();