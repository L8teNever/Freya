# Freya

Multiplayer-Spieleportal (FastAPI + WebSockets). Gruppen erstellen, Freunde per
Link/QR einladen, gegeneinander spielen oder zuschauen.

## Spiele
Tic-Tac-Toe · Karten ziehen · Stadt Land Fluss · Wortkette · Bombe · Bingo ·
2 Wahrheiten 1 Lüge · Wer bin ich? · Kniffel · Mensch ärgere dich nicht

Außerdem: gruppenweites **Anfechten/Abstimmen** für Fairness, **Schulmodus**
(unterdrückt alle Töne) und Anzeigename in den Einstellungen.

## Lokal starten (Entwicklung)
```bash
pip install -r requirements.txt
uvicorn main:app --reload
# http://localhost:8000
```

## Mit Docker (Image aus GHCR ziehen)
Das Image wird per GitHub Actions gebaut und nach GitHub Container Registry
(GHCR) gepusht. `docker compose` zieht es von dort:

```bash
docker compose up -d        # zieht ghcr.io/l8tenever/freya:latest
```

Anderen Tag verwenden:
```bash
IMAGE=ghcr.io/l8tenever/freya:main docker compose up -d
```

> Ist das Package privat, vorher einloggen:
> `echo $GHCR_TOKEN | docker login ghcr.io -u l8tenever --password-stdin`

## CI/CD
[`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml)
baut bei jedem Push auf `main` (und bei `v*`-Tags) das Docker-Image und pusht es
nach `ghcr.io/<owner>/freya`. Tags: `latest` (main), Branch-Name, `vX.Y.Z`, Commit-SHA.
