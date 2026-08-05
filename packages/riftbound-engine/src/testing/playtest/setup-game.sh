#!/bin/bash
# Boilerplate: reset browser, login, start goldfish, get past mulligan.
# Usage: ./setup-game.sh <sock-id> [deck-index]
# Prints the gameId on success.
set -e
S="$1"; DECK="${2:-1}"
pw() { bun /tmp/pwtest/pw-repl.ts --sock "$S" "$@" 2>/dev/null; }
pw reset >/dev/null
pw goto http://localhost:3000/login >/dev/null
pw fill '#loginUser dev@riftbound.local' >/dev/null
pw fill '#loginPass dev' >/dev/null
pw click '#loginBtn' >/dev/null
pw wait 500 >/dev/null
pw goto "http://localhost:3000/play?cb=$RANDOM" >/dev/null
pw eval 'localStorage.clear(); sessionStorage.clear()' >/dev/null
pw goto "http://localhost:3000/play?cb=$RANDOM" >/dev/null
pw click '.mode-card:has-text("Goldfish")' >/dev/null
pw wait 400 >/dev/null
pw eval "(()=>{const s=document.querySelector('#soloDeckSelect');if(s&&s.options[$DECK]){s.selectedIndex=$DECK;s.dispatchEvent(new Event('change'))}})()" >/dev/null
pw click '#soloDeckPicker button.start-btn' >/dev/null
pw wait 1200 >/dev/null
for i in $(seq 1 12); do
  vis=$(pw eval '!!document.querySelector("#pregameOverlay.visible, #coinOverlay.visible")')
  [ "$vis" = "false" ] && break
  pw eval '(()=>{const b=document.querySelector(".mulligan-btn-keep, #pregameOverlay button:not([disabled])");b&&b.click()})()' >/dev/null
  pw wait 800 >/dev/null
done
pw wait 500 >/dev/null
pw eval 'window.__rbGameId' | tr -d '"'
