# Top‑5 Differenzierer - Feature Briefs

Kurz: fünf priorisierte Produkt-Features, die `Hörbuch Studio Pro` schnell vom Wettbewerb abheben.

1) Realtime-Collab (Co-Editing) — HIGH Impact
- Nutzen: Mehrere Producer/Autoren können simultan am Skript arbeiten, Presence und Live-Vorschau reduzieren Iterationszeit und Missverständnisse.
- Inputs: Text-Editor Events (insert/delete), presence info (username, color), optional cursor positions.
- Outputs: synchronisierte Editor-Ansicht, change history (snapshots), presence UI.
- Fehler-Modi: Netzwerk-Latenz, Konflikte → Lösung: kurzfristig Last-Write-Wins (Prototyp), langfristig OT/CRDT (yjs/Automerge).
- Aufwand: M (Prototyp bereits vorhanden), Vollproduktion H.

2) A/B Audio Testing & Persistente Bewertungen — MEDIUM Impact
- Nutzen: Schnelles qualitativen Feedback zu Stimmen/Prosodie; valide Entscheidungen vor großen Batch-Renderings.
- Inputs: zwei Audio-Dateien/URLs, Metadaten (voice, provider, settings), Nutzer-Bewertungen.
- Outputs: Persistente Ratings, CSV-Export, aggregated stats.
- Fehler-Modi: große Dateien, CORS-URLs, versch. Formate → Lösung: client-side preview + server-side ingestion pipeline.
- Aufwand: M

3) Vollständige SSML-Pipeline & Provider-Mapping — HIGH Impact
- Nutzen: Feinkontrolle über Prosodie, Pausen, Betonung; zentrale Unterscheidung gegenüber einfachen TTS-Frontends.
- Inputs: Script mit SSML (oder SSML-Toolbar im Editor), provider-flag (`ssml:true/false`).
- Outputs: provider-kompatible requests, sanitized SSML, fallback non-SSML rendering.
- Fehler-Modi: Provider-Inkompatibilitäten, unsichere SSML → Lösung: Sanitizer + provider-mapping + tests.
- Aufwand: M→H (Server-Anpassung + Tests)

4) Projekt-Snapshots & Verschlüsselbarer Export/Share — MEDIUM Impact
- Nutzen: sichere Zusammenarbeit, Audit-Trail, ermöglicht Austausch ohne Account (passwortgeschützte Exports).
- Inputs: gesamtes Projekt-JSON, optional Password.
- Outputs: .hhb.json oder .hhb.enc (AES-GCM Wrapper), Snapshot-History im localStorage.
- Fehler-Modi: verlorenes Passwort, Corruption → Lösung: klare UX, Warnungen, checksum.
- Aufwand: L→M

5) Voice Marketplace & Template Store — STRATEGIC/ LONG-TERM
- Nutzen: Monetarisierung, Community-Bindung, schnelle Template-Übernahme für Charaktere & Stile.
- Inputs: voice metadata, sample audio, price/licence, template JSON.
- Outputs: storefront, import-button, license dialog.
- Fehler-Modi: Lizenzkonflikte, Moderation nötig → Lösung: Moderation-Workflow, clear license UI.
- Aufwand: H

---

Edge-Cases & gemeinsame Annahmen:
- Große Projekte: implementiere chunked upload/download und Background Jobs für Batch-TTS.
- Offline-Benutzer: lokale Snapshots und deferred sync.
- Datenschutz: Stimmen/Uploads sensibel — GDPR/Consent-Flow für Voice-Cloning.

Nächste Schritte (konkret/kurz):
- Finalisiere diese Briefs als `docs/feature-briefs.md` (done).
- Entscheide Priorität: Collab Robustheit (OT/CRDT) vs. SSML-Server vs. Marketplace — ich kann nun die Implementierungsschritte für das priorisierte Feature ausarbeiten und einfache Prototyp-Artefakte anlegen.
