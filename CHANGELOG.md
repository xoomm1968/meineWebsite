# Changelog — Dev local stubs

## Unreleased — feat/dev-local-stubs
- Add local dev fetch stubs to `HHHoerbuch Prox20 Kkopie.html` to mock backend endpoints for local UI testing.
- Generate short test WAV via OfflineAudioContext for `/api/tts/*` responses so audio player behavior can be validated.
- Add `playwright_console.js` improvements: seeded localStorage, convert trigger, enhanced console logging, screenshots before/after conversion.
- Fix top-level `await` usages and a malformed regex / syntax issue found during testing.

