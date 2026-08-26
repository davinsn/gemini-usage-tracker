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

        /*
         * Most Qwen requests use JSON:
         *
         * {
         *   "model": "qwen3.7-plus",
         *   "stream": true,
         *   ...
         * }
         */

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
                // Not JSON. Ignore.
            }

            return null;
        }

        /*
         * Handle Request / other body types where possible.
         */
        return null;
    };

    window.fetch = async function (...args) {
        try {
            const input = args[0];
            const init = args[1];

            let url = '';

            if (typeof input === 'string') {
                url = input;
            } else if (
                input &&
                typeof input.url === 'string'
            ) {
                url = input.url;
            }

            /*
             * Try to inspect the request body.
             */
            let body = null;

            if (
                init &&
                typeof init.body === 'string'
            ) {
                body = init.body;
            }

            /*
             * Request objects can also contain a body,
             * but reading them can consume the stream.
             *
             * We intentionally do NOT read Request.body here.
             */

            const model = extractModelFromBody(body);

            if (model) {
                sendModelToExtension(model);
            }

            /*
             * Optional debugging:
             * only log likely Qwen API requests.
             */
            if (
                url &&
                /qwen|chat|api/i.test(url)
            ) {
                console.log(
                    '[qwen-obs-network] Qwen fetch:',
                    url
                );
            }
        } catch (error) {
            console.warn(
                '[qwen-obs-network] FETCH INSPECTION ERROR:',
                error
            );
        }

        /*
         * IMPORTANT:
         * Always call the original fetch.
         *
         * We do not modify the request or response.
         */
        return originalFetch.apply(this, args);
    };

    console.log(
        '[qwen-obs-network] Fetch interception ENABLED'
    );

})();