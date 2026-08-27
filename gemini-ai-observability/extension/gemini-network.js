(function () {
    'use strict';

    // NOTE: This file is NOT currently loaded by gemini-content.js.
    // Gemini's web client talks to Google's internal batchexecute RPC
    // format, not plain REST/JSON, so there's no reliable "model"
    // field to lift out of a request body the way there is for
    // Qwen/ChatGPT. Model detection for Gemini is done via the DOM
    // instead (see detectModelFromDom() in gemini-content.js).
    //
    // This file is included as a starting point in case you find a
    // reliable network signal later (e.g. a distinct endpoint path
    // per model, or a header) - wire it up the same way the other
    // *-network.js files are injected, and re-enable the injection
    // call in gemini-content.js.

    if (window.__GEMINI_OBS_NETWORK_HOOKED__) {
        console.log('[gemini-obs-network] Already hooked');
        return;
    }

    window.__GEMINI_OBS_NETWORK_HOOKED__ = true;

    console.log('[gemini-obs-network] ===============================');
    console.log('[gemini-obs-network] NETWORK HOOK LOADED (debug only)');
    console.log('[gemini-obs-network] URL:', location.href);
    console.log('[gemini-obs-network] ===============================');

    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
        try {
            const input = args[0];
            const url = typeof input === 'string' ? input : input?.url || '';

            if (url && /generativelanguage|assistant|BardChat|StreamGenerate/i.test(url)) {
                console.log('[gemini-obs-network] Gemini-related fetch:', url);
            }
        } catch (error) {
            console.warn('[gemini-obs-network] FETCH INSPECTION ERROR:', error);
        }

        return originalFetch.apply(this, args);
    };

    console.log('[gemini-obs-network] Fetch interception ENABLED (debug logging only)');

})();