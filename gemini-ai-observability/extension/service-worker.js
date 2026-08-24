chrome.runtime.onMessage.addListener(
    (message, _sender, sendResponse) => {

        if (message?.type !== 'AI_USAGE_EVENT') {
            return;
        }

        const cfg = message.config;

        fetch(
            `${cfg.apiBaseUrl}/api/usage/events`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(message.event)
            }
        )
            .then(async r => ({
                ok: r.ok,
                body: await r.json().catch(() => ({}))
            }))
            .then(sendResponse)
            .catch(error =>
                sendResponse({
                    ok: false,
                    error: String(error)
                })
            );

        return true;
    }
);