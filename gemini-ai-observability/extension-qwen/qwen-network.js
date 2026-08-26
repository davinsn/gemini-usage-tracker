(function () {
    'use strict';

    if (window.__QWEN_OBS_NETWORK_HOOKED__) {
        console.log('[qwen-obs-network] Already hooked');
        return;
    }

    window.__QWEN_OBS_NETWORK_HOOKED__ = true;

    console.log('[qwen-obs-network] ===============================');
    console.log('[qwen-obs-network] NETWORK HOOK LOADED');
    console.log('[qwen-obs-network] URL:', location.href);
    console.log('[qwen-obs-network] ===============================');

    const originalFetch = window.fetch;

    const sendModelToExtension = (model) => {
        if (!model || typeof model !== 'string') {
            return;
        }

        const cleanModel = model.trim();

        if (!cleanModel) {
            return;
        }

        console.log(
            '[qwen-obs-network] QWEN MODEL DETECTED:',
            cleanModel
        );

        window.postMessage(
            {
                source: 'qwen-observability',
                type: 'QWEN_MODEL_DETECTED',
                model: cleanModel
            },
            '*'
        );
    };

    const extractModelFromBody = (body) => {
        if (!body) {
            return null;
        }

        if (typeof body === 'string') {
            try {
                const data = JSON.parse(body);

                if (
                    data &&
                    typeof data.model === 'string'
                ) {
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

            // ----------------------------------------------------
            // fetch("url", { body: "..." })
            // ----------------------------------------------------

            if (typeof input === 'string') {
                url = input;

                if (
                    init &&
                    typeof init.body === 'string'
                ) {
                    body = init.body;
                }
            }

            // ----------------------------------------------------
            // fetch(new Request(...))
            // ----------------------------------------------------

            else if (
                input &&
                typeof input.url === 'string'
            ) {
                url = input.url;

                if (
                    init &&
                    typeof init.body === 'string'
                ) {
                    body = init.body;
                }
            }

            // ----------------------------------------------------
            // Inspect body
            // ----------------------------------------------------

            const model = extractModelFromBody(body);

            if (model) {
                sendModelToExtension(model);
            }

            // ----------------------------------------------------
            // Debug Qwen requests
            // ----------------------------------------------------

            if (
                url &&
                /qwen|chat|api/i.test(url)
            ) {
                console.log(
                    '[qwen-obs-network] Qwen fetch:',
                    url
                );

                if (body) {
                    console.log(
                        '[qwen-obs-network] Request body:',
                        body
                    );
                }
            }

        } catch (error) {
            console.warn(
                '[qwen-obs-network] FETCH INSPECTION ERROR:',
                error
            );
        }

        // ALWAYS preserve original fetch
        return originalFetch.apply(this, args);
    };

    console.log(
        '[qwen-obs-network] Fetch interception ENABLED'
    );

})();