#!/usr/bin/env bash

SESSION="meliturgos"
TARGET="meliturgos:0.0"

PROJECT="$HOME/meliturgos-cloudflare"
LOG="$PROJECT/logs/watchdog/auto-nudge.log"

CHECK_INTERVAL=30
IDLE_CHECKS_REQUIRED=2
COOLDOWN=180

idle_checks=0
last_nudge=0
nudge_count=0

PROMPT_NORMAL="Reprends depuis l'état réel du dépôt et du runtime MEL.

Lis docs/AUTONOMY-RUN.md, docs/CURRENT-PRIORITY.md et src/roadmap/master-roadmap.js.

RÈGLE CANONIQUE :
- une seule branche active : candidate/mel-clean-autonomy ;
- une seule roadmap : src/roadmap/master-roadmap.js ;
- un seul sélecteur : AutonomySupervisor ;
- n'exécute jamais l'ancienne file M001-M014 comme plan parallèle ;
- si un job supervisé existe, reprends exactement ce job ;
- si un travail est bloqué, consigne la cause et laisse le scheduler canonique choisir le suivant ;
- ne crée aucune branche candidate ou architecture parallèle.

Avant toute écriture, vérifie que le HEAD candidate n'a pas changé.
Après le plus petit diff sûr : tests, checkpoint, preuve exacte, puis laisse la boucle canonique continuer."

PROMPT_ESCALATION="ANTI-BOUCLE MELITURGOS.

Relis docs/AUTONOMY-RUN.md et l'état réel du job supervisé.
N'invente aucune nouvelle file, branche, roadmap ou tâche M00x.
Si deux tentatives identiques n'ont pas progressé : consigne l'échec, marque le travail bloqué/failed avec diagnostic précis, puis rends la main au scheduler canonique.
Aucun reset global, aucune production, aucun contournement d'une approbation Teacher périmée.
CONTINUE uniquement via la roadmap canonique."

mkdir -p "$(dirname "$LOG")"

while true; do

    if ! tmux has-session -t "$SESSION" 2>/dev/null; then
        idle_checks=0
        sleep "$CHECK_INTERVAL"
        continue
    fi

    SCREEN=$(tmux capture-pane -p -t "$TARGET" -S -25 2>/dev/null | tail -25)

    # L'agent travaille réellement.
    if echo "$SCREEN" | grep -q "Working ("; then
        idle_checks=0
        sleep "$CHECK_INTERVAL"
        continue
    fi

    # L'agent est revenu au champ de saisie.
    if echo "$SCREEN" | grep -q "Type your message"; then
        idle_checks=$((idle_checks + 1))
    else
        idle_checks=0
    fi

    NOW=$(date +%s)

    if [ "$idle_checks" -ge "$IDLE_CHECKS_REQUIRED" ] &&
       [ $((NOW - last_nudge)) -ge "$COOLDOWN" ]; then

        nudge_count=$((nudge_count + 1))

        # Tous les 3 nudges : consigne anti-boucle renforcée.
        if [ $((nudge_count % 3)) -eq 0 ]; then
            PROMPT="$PROMPT_ESCALATION"
            MODE="ESCALATION"
        else
            PROMPT="$PROMPT_NORMAL"
            MODE="NORMAL"
        fi

        echo "$(date -Is) idle -> nudge $nudge_count mode=$MODE" >> "$LOG"

        tmux set-buffer -b mel-nudge "$PROMPT"
        tmux paste-buffer -b mel-nudge -t "$TARGET"
        tmux send-keys -t "$TARGET" Enter

        last_nudge=$NOW
        idle_checks=0

        sleep 90
    fi

    sleep "$CHECK_INTERVAL"
done
