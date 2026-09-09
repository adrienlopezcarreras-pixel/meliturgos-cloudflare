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

PROMPT_NORMAL="Reprends depuis l'état réel du dépôt et des checkpoints.

Lis docs/AUTONOMY-RUN.md, docs/MELITURGOS-MASTER-CHECKLIST.md,
docs/gen2-progress.md et docs/gen2-resume.md.

RÈGLE IMPORTANTE :
ne reprends PAS aveuglément le même blocage.

Si le lot actuel est réellement progressable :
continue-le.

Si le même problème a déjà subi plusieurs tentatives sans progrès,
ou si un refactor non essentiel bloque le produit :
1. checkpoint ;
2. documente le problème ;
3. marque la tâche DEFERRED, BLOCKED ou LOW_PRIORITY ;
4. restaure uniquement le petit changement fautif si nécessaire ;
5. passe immédiatement à la prochaine tâche PRODUIT READY.

Priorité stricte :
P0 interface fonctionnelle
P1 modules exécutables
P2 Internet réel
P3 connecteurs
P4 autonomie
P5 Module Lab
P6 médias
P7 Professeur / Work

Ne t'arrête pas en fin de lot.
CONTINUE tant qu'une tâche réalisable existe."

PROMPT_ESCALATION="ANTI-BOUCLE MELITURGOS.

Tu as déjà été relancé plusieurs fois.

NE PAS continuer indéfiniment le même problème.

Inspecte immédiatement :
- git status
- dernier checkpoint
- tâche courante
- erreurs répétées
- temps déjà consacré

Si le même blocage/refactor persiste :
CHECKPOINT
→ DEFERRED/BLOCKED
→ restaurer seulement le changement local fautif si nécessaire
→ tests critiques
→ prochaine tâche PRODUIT READY.

Ne consacre plus de temps à :
- refactor cosmétique
- nettoyage non bloquant
- test runner perfection
- architecture idéale

tant que P0-P7 ne sont pas livrés.

Priorité immédiate :
P0 interface principale réelle,
puis modules, Internet, connecteurs, autonomie, médias, Professeur/Work.

CONTINUE."

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
