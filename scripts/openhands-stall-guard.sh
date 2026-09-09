#!/usr/bin/env bash

SESSION="meliturgos"
TARGET="meliturgos:0.0"
PROJECT="$HOME/meliturgos-cloudflare"
LOG="$PROJECT/logs/watchdog/stall-guard.log"

CHECK_INTERVAL=60

# Écran réellement figé
STATIC_BLOCKER_AFTER=600        # 10 min
STATIC_RESTART_AFTER=1200       # 20 min

# Même progression fonctionnelle trop longtemps
LOOP_WARN_AFTER=900            # 30 min
LOOP_RESCUE_AFTER=1500          # 45 min
LOOP_RESTART_AFTER=2400         # 60 min

mkdir -p "$(dirname "$LOG")"
touch "$LOG"

last_activity_hash=""
static_seconds=0

last_progress=""
progress_seconds=0
loop_warn_sent=0
loop_rescue_sent=0

log() {
    echo "$(date -Is) $*" >> "$LOG"
}

get_openhands_pid() {
    pgrep -f '[o]penhands .*--override-with-envs' | head -1
}

is_descendant() {
    local pid="$1"
    local root="$2"
    local parent

    while [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null; do
        [ "$pid" = "$root" ] && return 0

        parent=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
        [ -z "$parent" ] && break

        pid="$parent"
    done

    return 1
}

kill_blocking_children() {
    local root pid age cmd min_age

    root=$(get_openhands_pid)
    [ -z "$root" ] && return

    log "Recherche enfants bloquants de OpenHands PID=$root"

    while read -r pid age cmd; do
        [ -z "$pid" ] && continue

        if ! is_descendant "$pid" "$root"; then
            continue
        fi

        min_age=999999

        case "$cmd" in
            *"wrangler dev"*)            min_age=120 ;;
            *"npm run dev"*)             min_age=120 ;;
            *"vite"*)                    min_age=120 ;;
            *"miniflare"*)               min_age=120 ;;
            *"cloudflared"*)             min_age=120 ;;
            *"python -m http.server"*)   min_age=120 ;;
            *"python3 -m http.server"*)  min_age=120 ;;
            *"tail -f"*)                 min_age=120 ;;
            *"curl "*"localhost"*)       min_age=30 ;;
            *"curl "*"127.0.0.1"*)       min_age=30 ;;
        esac

        if [ "$age" -ge "$min_age" ] 2>/dev/null; then
            log "Arrêt enfant bloquant PID=$pid AGE=${age}s CMD=$cmd"
            kill "$pid" 2>/dev/null || true
        fi

    done < <(ps -eo pid=,etimes=,args=)

    sleep 5
}

send_antiloop_prompt() {
    local level="$1"
    local prompt

    if [ "$level" = "warn" ]; then

        prompt="AUTO-GUARD ANTI-BOUCLE : la progression fonctionnelle n'a pas changé depuis environ 30 minutes. Ne continue pas aveuglément le même diagnostic. Vérifie le résultat produit, limite à 2 nouvelles tentatives maximum, puis checkpoint et DEFERRED/BLOCKED si nécessaire. Priorité BUILD-FIRST : terminer la capacité réelle, test E2E, commit, puis NEXT. Aucun refactor général."

    else

        prompt="AUTO-GUARD ESCALADE : la même étape reste active trop longtemps. Arrête les micro-corrections répétitives. Nettoie tout serveur/test enfant bloqué, checkpoint l'état réel. Si la fonctionnalité n'est pas validable en deux tentatives supplémentaires, marque PARTIAL/BLOCKED avec diagnostic précis et passe immédiatement à la prochaine tâche produit READY. Ne retourne pas sur worker.js legacy pour contourner le problème."

    fi

    tmux set-buffer -b mel-guard "$prompt" 2>/dev/null
    tmux paste-buffer -b mel-guard -t "$TARGET" 2>/dev/null
    tmux send-keys -t "$TARGET" Enter 2>/dev/null

    log "Consigne anti-boucle envoyée niveau=$level"
}

restart_openhands() {
    local pid

    pid=$(get_openhands_pid)

    if [ -n "$pid" ]; then
        log "Redémarrage contrôlé OpenHands PID=$pid"
        kill "$pid" 2>/dev/null || true
    fi

    # interactive-watchdog doit le relancer
    sleep 90
}

while true; do

    if ! tmux has-session -t "$SESSION" 2>/dev/null; then
        sleep "$CHECK_INTERVAL"
        continue
    fi

    SCREEN=$(tmux capture-pane -p -t "$TARGET" -S -100 2>/dev/null | tail -100)

    # OpenHands n'est pas en Working :
    # le nudge prend le relais.
    if ! echo "$SCREEN" | grep -q "Working ("; then
        last_activity_hash=""
        static_seconds=0
        last_progress=""
        progress_seconds=0
        loop_warn_sent=0
        loop_rescue_sent=0

        sleep "$CHECK_INTERVAL"
        continue
    fi

    # ------------------------------------------------------------
    # 1. DÉTECTION HARD STALL
    # ------------------------------------------------------------

    # On ne garde que les dernières actions significatives.
    ACTIVITY=$(
        echo "$SCREEN" |
        grep -E 'terminal:|file_editor:|task_tracker:|USER_CONTEXT:|Thinking:|Editing |Reading |Writing |\$ ' |
        tail -12 |
        sed -E 's/Working \([0-9]+s/Working (Xs/g'
    )

    ACTIVITY_HASH=$(printf '%s' "$ACTIVITY" | sha256sum | awk '{print $1}')

    if [ "$ACTIVITY_HASH" = "$last_activity_hash" ]; then
        static_seconds=$((static_seconds + CHECK_INTERVAL))
    else
        last_activity_hash="$ACTIVITY_HASH"
        static_seconds=0
    fi

    if [ "$static_seconds" -eq "$STATIC_BLOCKER_AFTER" ]; then
        log "HARD STALL ${static_seconds}s : tentative nettoyage enfants"
        kill_blocking_children
    fi

    if [ "$static_seconds" -ge "$STATIC_RESTART_AFTER" ]; then
        log "HARD STALL persistant ${static_seconds}s : redémarrage OpenHands"
        restart_openhands

        last_activity_hash=""
        static_seconds=0
        last_progress=""
        progress_seconds=0
        loop_warn_sent=0
        loop_rescue_sent=0

        sleep "$CHECK_INTERVAL"
        continue
    fi

    # ------------------------------------------------------------
    # 2. DÉTECTION BOUCLE LOGIQUE
    # ------------------------------------------------------------

    PROGRESS=$(
        echo "$SCREEN" |
        grep -oE 'Progress: [0-9]+/[0-9]+' |
        tail -1
    )

    # Pas de compteur de plan = ne pas appliquer la logique agressive.
    if [ -z "$PROGRESS" ]; then
        progress_seconds=0
        last_progress=""
        loop_warn_sent=0
        loop_rescue_sent=0

        sleep "$CHECK_INTERVAL"
        continue
    fi

    if [ "$PROGRESS" = "$last_progress" ]; then
        progress_seconds=$((progress_seconds + CHECK_INTERVAL))
    else
        log "Progression détectée : ${last_progress:-NONE} -> $PROGRESS"

        last_progress="$PROGRESS"
        progress_seconds=0
        loop_warn_sent=0
        loop_rescue_sent=0
    fi

    # 30 min même progression : recadrage uniquement.
    if [ "$progress_seconds" -ge "$LOOP_WARN_AFTER" ] &&
       [ "$loop_warn_sent" -eq 0 ]; then

        log "LOOP WARNING : $PROGRESS inchangé depuis ${progress_seconds}s"
        send_antiloop_prompt "warn"
        loop_warn_sent=1
    fi

    # 45 min : nettoyer les sous-processus + consigne renforcée.
    if [ "$progress_seconds" -ge "$LOOP_RESCUE_AFTER" ] &&
       [ "$loop_rescue_sent" -eq 0 ]; then

        log "LOOP RESCUE : $PROGRESS inchangé depuis ${progress_seconds}s"

        kill_blocking_children
        send_antiloop_prompt "rescue"

        loop_rescue_sent=1
    fi

    # 60 min au même compteur malgré les deux interventions :
    # restart contrôlé.
    if [ "$progress_seconds" -ge "$LOOP_RESTART_AFTER" ]; then

        log "LOOP RESTART : $PROGRESS inchangé depuis ${progress_seconds}s"

        restart_openhands

        last_activity_hash=""
        static_seconds=0
        last_progress=""
        progress_seconds=0
        loop_warn_sent=0
        loop_rescue_sent=0

        sleep "$CHECK_INTERVAL"
        continue
    fi

    sleep "$CHECK_INTERVAL"
done
