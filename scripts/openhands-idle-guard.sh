#!/usr/bin/env bash

PROJECT="$HOME/meliturgos-cloudflare"

# On ne tue pas un agent simplement parce qu'il réfléchit quelques minutes.
IDLE_LIMIT=2700       # 45 minutes
CHECK_INTERVAL=60     # vérification chaque minute
LOW_CPU_LIMIT=1.0
LOW_CPU_COUNT_REQUIRED=5

low_cpu_count=0

while true; do

    PID=$(ps -eo pid,args |
        awk '/[o]penhands .*--override-with-envs/ {print $1; exit}')

    if [ -n "$PID" ]; then

        CPU=$(ps -p "$PID" -o %cpu= | tr -d ' ')

        LAST_CHANGE=$(
            find "$PROJECT" \
                -type f \
                ! -path "$PROJECT/.git/*" \
                ! -path "$PROJECT/logs/*" \
                ! -path "$PROJECT/node_modules/*" \
                -printf '%T@\n' 2>/dev/null |
            sort -nr |
            head -1
        )

        NOW=$(date +%s)

        if [ -n "$LAST_CHANGE" ]; then
            LAST_CHANGE_INT=${LAST_CHANGE%.*}
            AGE=$((NOW - LAST_CHANGE_INT))
        else
            AGE=0
        fi

        if awk "BEGIN {exit !($CPU < $LOW_CPU_LIMIT)}"; then
            low_cpu_count=$((low_cpu_count + 1))
        else
            low_cpu_count=0
        fi

        if [ "$AGE" -ge "$IDLE_LIMIT" ] &&
           [ "$low_cpu_count" -ge "$LOW_CPU_COUNT_REQUIRED" ]; then

            echo "$(date) OpenHands semble inactif depuis ${AGE}s. Restart PID=$PID" \
              >> "$PROJECT/logs/watchdog/idle-guard.log"

            kill "$PID"

            # Le watchdog principal le relancera.
            low_cpu_count=0
            sleep 90
        fi

    else
        low_cpu_count=0
    fi

    sleep "$CHECK_INTERVAL"
done

