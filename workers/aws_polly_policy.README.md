Kurz: Minimal-Policy, die einem IAM-User oder Role die Nutzung von Amazon Polly zum SynthesizeSpeech erlaubt.

Datei: `workers/aws_polly_policy.json`

Anleitung
1) Öffne die AWS Console → IAM → Users oder Roles.
2) Wähle den User/Role aus, dem/der du Zugriff geben willst.
3) Klicke auf "Add inline policy" oder "Attach policies" und wähle "JSON".
4) Füge den Inhalt aus `workers/aws_polly_policy.json` ein und speichere.

Test (lokal):
- Exportiere die Credentials (oder setze sie in deiner Umgebung):

```bash
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
# Nur falls temporär: export AWS_SESSION_TOKEN=...
```

- Teste mit der AWS CLI (Region ggf. anpassen):

```bash
aws polly synthesize-speech --region eu-central-1 --output-format mp3 --voice-id Vicki --text "Hallo Welt" out.mp3
```

Wichtige Hinweise
- Diese Policy benutzt `Resource: "*"`. Polly unterstützt keine feingranulare Ressourcenbeschränkung für `SynthesizeSpeech` in vielen Fällen; falls möglich, ersetze `*` durch engere Einschränkungen.
- Wenn du temporäre STS-Credentials verwendest, stelle sicher, dass `AWS_SESSION_TOKEN` gesetzt ist.
- Prüfe Organizations / SCPs und IAM Conditions (z. B. `aws:SourceIp`, `aws:RequestedRegion`) falls du weiterhin `AccessDenied` siehst.
- Für Produktion: verwende eine Role (nicht langfristige Access Keys), aktiviere Rotation und möglichst enge Policies.
- Nutze CloudTrail, um abgewiesene Requests zu untersuchen (zeigt genaue Deny-Gründe).

Sicherheit
- Lege Keys niemals in Quellcode. Verwende AWS Secrets Manager oder Umgebungs- / Secret-Bindings (z. B. Cloudflare Worker secrets).
- Erstelle bei Bedarf ein spezielles, dediziertes Polly-Service-User mit minimalen Rechten.

Wenn du willst, schreibe ich dir auch ein Terraform/IaC-Snippet, das die Policy und einen User/Role erzeugt.