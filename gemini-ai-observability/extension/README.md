# Extension

1. Edit `config.js` with the employee's approved company identity.
2. Chrome → Extensions → Developer mode → Load unpacked → select this folder.
3. Open Gemini and test.

The collector intentionally stores metadata only and does not read authentication cookies or save prompt/response content.

Gemini's DOM is not a stable API; treat the selectors/detection heuristics in `content.js` as a prototype that will need testing against the current Gemini UI.
