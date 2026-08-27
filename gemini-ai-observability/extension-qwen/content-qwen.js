// ============================================================
// QWEN AI USAGE COLLECTOR
// OPENROUTER VERSION
// ============================================================

(() => {

    'use strict';

    console.log('[qwen-obs] =================================');
    console.log('[qwen-obs] QWEN OPENROUTER COLLECTOR LOADED');
    console.log('[qwen-obs] =================================');

    // ========================================================
    // CONFIGURATION
    // ========================================================

    const API_BASE =
        'http://localhost:4000';

    const CHAT_ENDPOINT =
        `${API_BASE}/api/openrouter/chat`;

    // Change this to whichever Qwen model you want.
    const QWEN_MODEL =
        'qwen/qwen3-30b-a3b';

    const SESSION_STORAGE_KEY =
        'qwen_obs_session_id';

    const EMAIL_STORAGE_KEY =
        'qwen_obs_email';

    // ========================================================
    // SESSION
    // ========================================================

    function getSessionId() {

        let sessionId =
            sessionStorage.getItem(
                SESSION_STORAGE_KEY
            );

        if (!sessionId) {

            sessionId =
                crypto.randomUUID();

            sessionStorage.setItem(
                SESSION_STORAGE_KEY,
                sessionId
            );
        }

        return sessionId;
    }

    const sessionId =
        getSessionId();

    // ========================================================
    // EMAIL DETECTION
    // ========================================================

    function isValidEmail(value) {

        return (
            typeof value === 'string' &&
            /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
        );
    }

    function findEmailInText(text) {

        if (
            typeof text !== 'string'
        ) {
            return null;
        }

        const match =
            text.match(
                /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
            );

        return match
            ? match[0]
            : null;
    }

    function detectEmail() {

        // ----------------------------------------------------
        // Previously detected email
        // ----------------------------------------------------

        const storedEmail =
            localStorage.getItem(
                EMAIL_STORAGE_KEY
            );

        if (
            isValidEmail(storedEmail)
        ) {
            return storedEmail;
        }

        // ----------------------------------------------------
        // DOM text
        // ----------------------------------------------------

        const bodyText =
            document.body?.innerText || '';

        const bodyEmail =
            findEmailInText(bodyText);

        if (bodyEmail) {

            localStorage.setItem(
                EMAIL_STORAGE_KEY,
                bodyEmail
            );

            console.log(
                '[qwen-obs] Employee detected:',
                bodyEmail
            );

            return bodyEmail;
        }

        // ----------------------------------------------------
        // Attributes
        // ----------------------------------------------------

        const elements =
            document.querySelectorAll(
                '[data-email], [data-user-email], [aria-label], [title]'
            );

        for (
            const element of elements
        ) {

            const candidates = [
                element.getAttribute('data-email'),
                element.getAttribute('data-user-email'),
                element.getAttribute('aria-label'),
                element.getAttribute('title')
            ];

            for (
                const candidate of candidates
            ) {

                const email =
                    findEmailInText(
                        candidate || ''
                    );

                if (email) {

                    localStorage.setItem(
                        EMAIL_STORAGE_KEY,
                        email
                    );

                    console.log(
                        '[qwen-obs] Employee detected:',
                        email
                    );

                    return email;
                }
            }
        }

        return null;
    }

    // ========================================================
    // FIND COMPOSER
    // ========================================================

    function findComposer() {

        const selectors = [

            // Common textarea
            'textarea',

            // Content editable
            '[contenteditable="true"]',

            // Qwen-style editor candidates
            'div[role="textbox"]',

            // Inputs
            'textarea[placeholder]',
            '[contenteditable="true"][data-placeholder]'
        ];

        for (
            const selector of selectors
        ) {

            const elements =
                document.querySelectorAll(
                    selector
                );

            for (
                const element of elements
            ) {

                if (
                    !element.offsetParent
                ) {
                    continue;
                }

                return element;
            }
        }

        return null;
    }

    // ========================================================
    // GET COMPOSER TEXT
    // ========================================================

    function getComposerText(composer) {

        if (!composer) {
            return '';
        }

        if (
            composer.tagName ===
            'TEXTAREA'
        ) {
            return composer.value.trim();
        }

        return (
            composer.innerText ||
            composer.textContent ||
            ''
        ).trim();
    }

    // ========================================================
    // CLEAR COMPOSER
    // ========================================================

    function clearComposer(composer) {

        if (!composer) {
            return;
        }

        if (
            composer.tagName ===
            'TEXTAREA'
        ) {

            composer.value = '';

            composer.dispatchEvent(
                new Event(
                    'input',
                    {
                        bubbles: true
                    }
                )
            );

            return;
        }

        composer.innerHTML = '';

        composer.dispatchEvent(
            new InputEvent(
                'input',
                {
                    bubbles: true,
                    inputType:
                        'deleteContentBackward'
                }
            )
        );
    }

    // ========================================================
    // FIND SEND BUTTON
    // ========================================================

    function findSendButton() {

        const selectors = [

            'button[type="submit"]',

            'button[aria-label*="Send" i]',

            'button[title*="Send" i]',

            'button[data-testid*="send" i]',

            '[role="button"][aria-label*="Send" i]',

            '[role="button"][title*="Send" i]'
        ];

        for (
            const selector of selectors
        ) {

            const elements =
                document.querySelectorAll(
                    selector
                );

            for (
                const element of elements
            ) {

                if (
                    !element.offsetParent
                ) {
                    continue;
                }

                return element;
            }
        }

        return null;
    }

    // ========================================================
    // FIND CONVERSATION CONTAINER
    // ========================================================

    function findConversationContainer() {

        const selectors = [

            'main',

            '[role="main"]',

            '[class*="conversation" i]',

            '[class*="chat" i]',

            '[class*="message" i]'
        ];

        for (
            const selector of selectors
        ) {

            const element =
                document.querySelector(
                    selector
                );

            if (
                element &&
                element.offsetParent
            ) {
                return element;
            }
        }

        return document.body;
    }

    // ========================================================
    // ADD ASSISTANT MESSAGE
    // ========================================================

    function addAssistantMessage(
        text
    ) {

        const container =
            findConversationContainer();

        const wrapper =
            document.createElement(
                'div'
            );

        wrapper.className =
            'qwen-obs-assistant-message';

        wrapper.style.padding =
            '12px 16px';

        wrapper.style.margin =
            '12px 0';

        wrapper.style.borderRadius =
            '12px';

        wrapper.style.background =
            'rgba(0,0,0,0.04)';

        const label =
            document.createElement(
                'div'
            );

        label.textContent =
            'Qwen';

        label.style.fontWeight =
            '600';

        label.style.marginBottom =
            '6px';

        const content =
            document.createElement(
                'div'
            );

        content.textContent =
            text;

        content.style.whiteSpace =
            'pre-wrap';

        wrapper.appendChild(
            label
        );

        wrapper.appendChild(
            content
        );

        container.appendChild(
            wrapper
        );

        wrapper.scrollIntoView({
            behavior: 'smooth',
            block: 'end'
        });
    }

    // ========================================================
    // ADD USER MESSAGE
    // ========================================================

    function addUserMessage(
        text
    ) {

        const container =
            findConversationContainer();

        const wrapper =
            document.createElement(
                'div'
            );

        wrapper.className =
            'qwen-obs-user-message';

        wrapper.style.padding =
            '12px 16px';

        wrapper.style.margin =
            '12px 0';

        wrapper.style.whiteSpace =
            'pre-wrap';

        wrapper.textContent =
            text;

        container.appendChild(
            wrapper
        );
    }

    // ========================================================
    // SHOW LOADING
    // ========================================================

    function showLoading() {

        const container =
            findConversationContainer();

        const loading =
            document.createElement(
                'div'
            );

        loading.id =
            'qwen-obs-loading';

        loading.textContent =
            'Qwen is thinking...';

        loading.style.padding =
            '12px 16px';

        loading.style.opacity =
            '0.6';

        container.appendChild(
            loading
        );

        loading.scrollIntoView({
            behavior: 'smooth',
            block: 'end'
        });
    }

    // ========================================================
    // REMOVE LOADING
    // ========================================================

    function removeLoading() {

        const loading =
            document.getElementById(
                'qwen-obs-loading'
            );

        if (loading) {
            loading.remove();
        }
    }

    // ========================================================
    // SEND TO OPENROUTER
    // ========================================================

    async function sendToOpenRouter(
        prompt
    ) {

        const email =
            detectEmail();

        if (!email) {

            throw new Error(
                'Unable to determine Qwen employee email'
            );
        }

        console.log(
            '[qwen-obs] Sending interaction to OpenRouter'
        );

        const response =
            await fetch(
                CHAT_ENDPOINT,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body:
                        JSON.stringify({

                            email,

                            model:
                                QWEN_MODEL,

                            session_id:
                                sessionId,

                            messages: [
                                {
                                    role:
                                        'user',

                                    content:
                                        prompt
                                }
                            ]
                        })
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            throw new Error(
                data?.details?.error?.message ||
                data?.error ||
                'OpenRouter request failed'
            );
        }

        return data;
    }

    // ========================================================
    // HANDLE SUBMISSION
    // ========================================================

    let processing =
        false;

    async function handleSubmit(
        composer
    ) {

        if (processing) {
            return;
        }

        const prompt =
            getComposerText(
                composer
            );

        if (!prompt) {
            return;
        }

        processing = true;

        try {

            console.log(
                '[qwen-obs] User submitted prompt'
            );

            // Prevent Qwen's own request
            clearComposer(
                composer
            );

            addUserMessage(
                prompt
            );

            showLoading();

            const data =
                await sendToOpenRouter(
                    prompt
                );

            removeLoading();

            addAssistantMessage(
                data.response ||
                ''
            );

            console.log(
                '[qwen-obs] Interaction completed:',
                {
                    model:
                        data.model,

                    prompt_tokens:
                        data.usage?.prompt_tokens,

                    response_tokens:
                        data.usage?.response_tokens,

                    total_tokens:
                        data.usage?.total_tokens,

                    latency_ms:
                        data.latency_ms
                }
            );

        } catch (error) {

            removeLoading();

            console.error(
                '[qwen-obs] ERROR:',
                error
            );

            addAssistantMessage(
                `Unable to contact OpenRouter.\n\n${error.message}`
            );

        } finally {

            processing = false;
        }
    }

    // ========================================================
    // KEYBOARD HANDLER
    // ========================================================

    document.addEventListener(
        'keydown',
        event => {

            const composer =
                event.target?.closest?.(
                    'textarea, [contenteditable="true"], [role="textbox"]'
                );

            if (!composer) {
                return;
            }

            // Enter = submit
            // Shift + Enter = newline

            if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.isComposing
            ) {

                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                handleSubmit(
                    composer
                );
            }
        },
        true
    );

    // ========================================================
    // SEND BUTTON HANDLER
    // ========================================================

    document.addEventListener(
        'click',
        event => {

            const button =
                event.target?.closest?.(
                    'button, [role="button"]'
                );

            if (!button) {
                return;
            }

            const text =
                (
                    button.getAttribute(
                        'aria-label'
                    ) ||
                    button.getAttribute(
                        'title'
                    ) ||
                    button.textContent ||
                    ''
                ).toLowerCase();

            if (
                !text.includes('send')
            ) {
                return;
            }

            const composer =
                findComposer();

            if (!composer) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            handleSubmit(
                composer
            );
        },
        true
    );

    // ========================================================
    // INITIALISE
    // ========================================================

    setTimeout(
        () => {

            detectEmail();

            const composer =
                findComposer();

            console.log(
                '[qwen-obs] Composer:',
                composer
                    ? 'FOUND'
                    : 'NOT FOUND'
            );

            console.log(
                '[qwen-obs] Session:',
                sessionId
            );

        },
        1500
    );

})();