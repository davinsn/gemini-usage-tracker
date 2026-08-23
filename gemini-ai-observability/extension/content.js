console.log('[gemini-obs] ===============================');
console.log('[gemini-obs] CONTENT SCRIPT LOADED');
console.log('[gemini-obs] URL:', location.href);
console.log('[gemini-obs] ===============================');

(() => {
  console.log('[gemini-obs] IIFE STARTED');

  // ============================================================
  // CONFIG
  // ============================================================

  const cfg = window.GEMINI_OBS_CONFIG;

  console.log('[gemini-obs] CONFIG:', cfg);

  if (!cfg?.employeeEmail) {
    console.error(
      '[gemini-obs] STOPPED: employeeEmail is missing'
    );
    return;
  }

  console.log(
    '[gemini-obs] Tracking employee:',
    cfg.employeeEmail
  );

  // ============================================================
  // SESSION STATE
  // ============================================================

  const sessionId = crypto.randomUUID();

  let activeInteraction = null;
  let lastPromptSignature = null;

  let completionTimer = null;

  console.log(
    '[gemini-obs] Session:',
    sessionId
  );

  // ============================================================
  // SEND EVENT
  // ============================================================

  const send = (event) => {
    const payload = {
      type: 'GEMINI_USAGE_EVENT',

      config: cfg,

      event: {
        email: cfg.employeeEmail,
        department: cfg.department,
        role: cfg.role,

        session_id: sessionId,

        occurred_at:
          new Date().toISOString(),

        ...event
      }
    };

    console.log(
      '[gemini-obs] EVENT →',
      event.event_type,
      payload
    );

    try {
      chrome.runtime.sendMessage(
        payload,
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              '[gemini-obs] SEND ERROR:',
              chrome.runtime.lastError.message
            );

            return;
          }

          console.log(
            '[gemini-obs] BACKGROUND RESPONSE:',
            response
          );
        }
      );
    } catch (error) {
      console.error(
        '[gemini-obs] SEND EXCEPTION:',
        error
      );
    }
  };

  // ============================================================
  // INPUT DETECTION
  // ============================================================

  const findPromptInput = () => {
    const candidates = [
      ...document.querySelectorAll(
        'textarea, [contenteditable="true"], [role="textbox"]'
      )
    ];

    const visible = candidates.filter((el) => {
      const rect =
        el.getBoundingClientRect();

      const style =
        getComputedStyle(el);

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        !el.disabled
      );
    });

    // Prefer textarea
    const textarea =
      visible.find(
        (el) =>
          el.tagName === 'TEXTAREA'
      );

    if (textarea) {
      return textarea;
    }

    // Then contenteditable
    const editable =
      visible.find(
        (el) =>
          el.getAttribute(
            'contenteditable'
          ) === 'true'
      );

    if (editable) {
      return editable;
    }

    return visible[0] || null;
  };

  // ============================================================
  // READ INPUT
  // ============================================================

  const getInputText = (input) => {
    if (!input) {
      return '';
    }

    if (
      input instanceof HTMLTextAreaElement ||
      input instanceof HTMLInputElement
    ) {
      return input.value || '';
    }

    return (
      input.innerText ||
      input.textContent ||
      ''
    );
  };

  // ============================================================
  // START INTERACTION
  // ============================================================

  const startInteraction = () => {
    console.log(
      '[gemini-obs] ================================='
    );

    console.log(
      '[gemini-obs] START INTERACTION'
    );

    const input = findPromptInput();

    if (!input) {
      console.warn(
        '[gemini-obs] No prompt input found'
      );

      return;
    }

    const prompt =
      getInputText(input).trim();

    console.log(
      '[gemini-obs] Prompt:',
      prompt
    );

    if (!prompt) {
      console.warn(
        '[gemini-obs] Empty prompt — ignoring'
      );

      return;
    }

    const signature =
      `${prompt.length}:${prompt}`;

    // Don't create duplicate interaction
    // while the same prompt is being submitted.
    if (
      activeInteraction &&
      activeInteraction.signature === signature
    ) {
      console.log(
        '[gemini-obs] Interaction already active — ignoring duplicate'
      );

      return;
    }

    // Prevent the same prompt from being
    // captured twice by Enter + click.
    if (
      signature === lastPromptSignature &&
      !activeInteraction
    ) {
      console.log(
        '[gemini-obs] Same prompt already processed — ignoring'
      );

      return;
    }

    lastPromptSignature = signature;

    const interactionId =
      crypto.randomUUID();

    const startedAt = Date.now();

    activeInteraction = {
      interactionId,
      startedAt,
      signature,
      promptLength: prompt.length
    };

    console.log(
      '[gemini-obs] NEW INTERACTION:',
      activeInteraction
    );

    // IMPORTANT:
    // Send interaction_started immediately.
    send({
      event_type:
        'interaction_started',

      interaction_id:
        interactionId,

      prompt_length:
        prompt.length,

      metadata: {
        collector: 'dom-v3',
        prompt_capture: 'pre-submit'
      }
    });

    console.log(
      '[gemini-obs] interaction_started SENT:',
      interactionId
    );
  };



  // ============================================================
  // GEMINI RESPONSE TEXT DETECTION
  // ============================================================

  const getGeminiResponseText = () => {
  // Gemini response containers
  const candidates = [
    ...document.querySelectorAll(
      '[data-message-author-role="model"]'
    ),
    ...document.querySelectorAll(
      '[data-message-author-role="assistant"]'
    ),
    ...document.querySelectorAll(
      '.model-response-text'
    )
  ];

  const visible = candidates.filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  if (!visible.length) {
    return '';
  }

  // Get the most recent visible response
  const latest = visible[visible.length - 1];

  return (
    latest.innerText ||
    latest.textContent ||
    ''
  ).trim();
};

  // ============================================================
  // COMPLETE INTERACTION
  // ============================================================

  const completeInteraction = () => {
    if (!activeInteraction) {
      return;
    }

    const interaction =
      activeInteraction;

    const response = getGeminiResponseText();

    console.log(
      '[gemini-obs] Gemini response:',
      response
    );

    console.log(
      '[gemini-obs] Response length:',
      response.length
    );

    const latency =
      Date.now() -
      interaction.startedAt;

      // Find the latest Gemini response
    const responseElements = [
      ...document.querySelectorAll(
        'message-content .markdown.markdown-main-panel.md-content'
      )
    ];

    const responseElement =
      responseElements[responseElements.length - 1];

    const responseText =
      responseElement?.innerText?.trim() || '';

    const responseLength =
      responseText.length;

    console.log(
      '[gemini-obs] Response:',
      responseText
    );

    console.log(
      '[gemini-obs] Response length:',
      responseLength
    );

    console.log(
      '[gemini-obs] ================================='
    );

    console.log(
      '[gemini-obs] COMPLETE INTERACTION'
    );

    console.log(
      '[gemini-obs] Interaction ID:',
      interaction.interactionId
    );

    console.log(
      '[gemini-obs] Latency:',
      latency,
      'ms'
    );

    // Send the completion event.
    send({
      event_type:
        'interaction_completed',

      interaction_id:
        interaction.interactionId,

      prompt_length:
        interaction.promptLength,
      
      response_length: 
        responseLength,

      latency_ms:
        latency,
        

      metadata: {
        collector: 'dom-v3',
        completion_detection:
          'mutation-idle'
      }
    });

    console.log(
      '[gemini-obs] interaction_completed SENT'
    );

    // Clear state.
    activeInteraction = null;

    clearTimeout(completionTimer);
    completionTimer = null;

    console.log(
      '[gemini-obs] Interaction state cleared'
    );
  };

  // ============================================================
  // ENTER DETECTION
  // ============================================================

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Enter') {
        return;
      }

      if (event.shiftKey) {
        return;
      }

      const input =
        findPromptInput();

      const targetIsInput =
        input &&
        (
          event.target === input ||
          input.contains?.(event.target)
        );

      console.log(
        '[gemini-obs] ENTER:',
        {
          target: event.target,
          input,
          targetIsInput
        }
      );

      if (!targetIsInput) {
        return;
      }

      startInteraction();
    },
    true
  );

  // ============================================================
  // SEND BUTTON DETECTION
  // ============================================================

  document.addEventListener(
    'click',
    (event) => {
      const button =
        event.target?.closest?.(
          'button'
        );

      if (!button) {
        return;
      }

      const ariaLabel =
        button.getAttribute(
          'aria-label'
        ) || '';

      const title =
        button.getAttribute(
          'title'
        ) || '';

      const text =
        button.innerText || '';

      const combined =
        `${ariaLabel} ${title} ${text}`;

      const isSend =
        /send/i.test(combined) &&
        !button.disabled;

      if (!isSend) {
        return;
      }

      console.log(
        '[gemini-obs] SEND BUTTON CLICK'
      );

      startInteraction();
    },
    true
  );

  // ============================================================
  // RESPONSE MUTATION DETECTION
  // ============================================================

  const observer =
    new MutationObserver(() => {
      // Nothing to complete if there is
      // no active interaction.
      if (!activeInteraction) {
        return;
      }

      // Gemini is still changing the DOM.
      // Reset the idle timer.
      clearTimeout(completionTimer);

      completionTimer =
        setTimeout(() => {
          completeInteraction();
        }, 2500);
    });

  observer.observe(
    document.documentElement,
    {
      childList: true,
      subtree: true,
      characterData: true
    }
  );

  console.log(
    '[gemini-obs] MutationObserver started'
  );

  // ============================================================
  // SESSION START
  // ============================================================

  send({
    event_type:
      'session_started',

    interaction_id:
      crypto.randomUUID(),

    metadata: {
      collector: 'dom-v3',
      url_host: location.host
    }
  });

  console.log(
    '[gemini-obs] session_started SENT'
  );

  console.log(
    '[gemini-obs] ================================='
  );

  console.log(
    '[gemini-obs] GEMINI OBSERVER READY'
  );

  console.log(
    '[gemini-obs] Employee:',
    cfg.employeeEmail
  );

  console.log(
    '[gemini-obs] Session:',
    sessionId
  );

  console.log(
    '[gemini-obs] ================================='
  );
})();