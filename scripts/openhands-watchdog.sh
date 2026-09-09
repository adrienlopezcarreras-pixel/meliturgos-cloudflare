#!/usr/bin/env bash

set -u

PROJECT="$HOME/meliturgos-cloudflare"
ENV_FILE="$HOME/.config/meliturgos/openhands.env"
PROMPT="$PROJECT/docs/AUTONOMY-RUN.md"
LOGDIR="$PROJECT/logs/watchdog"

mkdir -p "$LOGDIR"

cd "$PROJECT" || exit 1

source "$ENV_FILE"

echo "=== MELITURGOS WATCHDOG START $(date) ===" \
  >> "$LOGDIR/watchdog.log"

CRASH_COUNT=0

while true; do

    echo "=== OpenHands start $(date) ===" \
      >> "$LOGDIR/watchdog.log"

    START_TIME=$(date +%s)

    openhands \
      --headless \
      --override-with-envs \
      -f "$PROMPT" \
      >> "$LOGDIR/openhands.log" 2>&1

    EXIT_CODE=$?

    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))

    echo "=== OpenHands exit code=$EXIT_CODE duration=${DURATION}s $(date) ===" \
      >> "$LOGDIR/watchdog.log"

    # Si le run a fonctionné longtemps, on remet le compteur de crash à zéro.
    if [ "$DURATION" -gt 300 ]; then
        CRASH_COUNT=0
    else
        CRASH_COUNT=$((CRASH_COUNT + 1))
    fi

    # Évite une boucle infernale modèle/API.
    if [ "$CRASH_COUNT" -ge 5 ]; then
        echo "5 arrêts rapides : pause 15 minutes." \
          >> "$LOGDIR/watchdog.log"
        sleep 900
        CRASH_COUNT=0
    else
        echo "Reprise dans 30 secondes." \
          >> "$LOGDIR/watchdog.log"
        sleep 30
    fi
done
