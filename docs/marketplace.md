# Marketplace (Mock) - Konzept & Quickstart

Dieses Dokument beschreibt das lokale Marketplace-Mock (Frontend) und die minimalen APIs/Behaviors, die für einen echten Marktplatz wichtig sind.

Zweck
- Schnelles Prototyping: Users können Voices oder Templates im UI entdecken und lokal importieren.
- Mock erlaubt UX-Tests ohne Backend.

Was wurde implementiert
- `HHHoerbuch Prox20 Kkopie.html` enthält jetzt:
  - Floating-Button `Marketplace` (unten links, neben Realtime-Collab).
  - Modal `#marketplace-modal` mit einer Liste von Beispiel-Items (voices & templates).
  - Import-Button: speichert ein Item in `localStorage` unter dem Key `hhb_marketplace_imports` und versucht, eine Darstellung in `#speakers-container` zu erzeugen (falls vorhanden).
  - Preview-Button: zeigt eine kurze Toast-Vorschau (statisch im Mock).

Sample Data
- Items sind definiert in `SAMPLE_MARKETPLACE` (im HTML):
  - `voice-alloy-pro` (Gratis)
  - `voice-fable-warm` (Paid sample)
  - `template-dark-fantasy` (Gratis Template)
  - `template-novel-structure` (Paid Template)

Local behavior
- Imports werden lokal persistiert. Das erlaubt Tests, Export/Import-Workflows und UX-Iterationen.
- Wenn `#speakers-container` vorhanden ist, wird ein einfacher Card-Node für die importierte Stimme eingefügt und ein "Verwenden"-Button appliziert.

Recommended Next Steps for Production
1. Backend Endpoints
   - GET /marketplace/items -> list marketplace items (paginated)
   - GET /marketplace/items/:id -> item metadata + sample URL
   - POST /marketplace/purchase -> create purchase + license
   - GET /marketplace/download/:id -> secured download URL
2. Auth & Billing
   - Integrate Stripe (or other) for purchases; implement license management.
3. Moderation & Uploads
   - Admin flow for voice/template upload, review, sample generation, and licensing.
4. CDN & Caching
   - Host voice samples & template assets on CDN; cache listings with ETag.
5. Import UX
   - After purchase/import, map the item into the app model (speakers, templates). Provide a clear confirmation dialog and undo.

How to test locally
1. Open `HHHoerbuch Prox20 Kkopie.html` in the browser (Live Server or file:// may suffice for local testing).
2. Click the `Marketplace` button (bottom-left) to open the modal.
3. Click `Import` on any item — the import is saved to localStorage and a card is appended to `#speakers-container` if present.

Notes
- This is intentionally lightweight and safe: no network calls, no external dependencies.
- For a production marketplace, follow the recommended next steps and add server-side authorization and billing.
