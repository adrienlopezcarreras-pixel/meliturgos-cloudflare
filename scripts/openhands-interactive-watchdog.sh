#!/usr/bin/env bash

PROJECT="$HOME/meliturgos-cloudflare"
ENV_FILE="$HOME/.config/meliturgos/openhands.env"

cd "$PROJECT" || exit 1

while true; do

    # IMPORTANT :
    # relire la configuration à CHAQUE lancement d'OpenHands.
    # Ainsi une modification de modèle est réellement prise en compte.
    unset LLM_MODEL
    unset LLM_MAX_INPUT_TOKENS
    unset LLM_TIMEOUT

    if [ -f "$ENV_FILE" ]; then
        source "$ENV_FILE"
    else
        echo "ERREUR : fichier $ENV_FILE introuvable"
        sleep 60
        continue
    fi

    clear

    echo "============================================================"
    echo " MELITURGOS — OpenHands supervisé"
    echo "============================================================"
    echo
    echo "Modèle : ${LLM_MODEL:-NON CONFIGURE}"
    echo "Contexte : ${LLM_MAX_INPUT_TOKENS:-NON CONFIGURE}"
    echo
    echo "Le watchdog relancera OpenHands après toute fermeture."
    echo "============================================================"
    echo

    openhands --override-with-envs

    CODE=$?

    echo
    echo "OpenHands s'est arrêté — code $CODE"
    echo "Nouvelle configuration relue au prochain lancement."
    echo "Redémarrage automatique dans 30 secondes..."
    echo

    sleep 30
done
