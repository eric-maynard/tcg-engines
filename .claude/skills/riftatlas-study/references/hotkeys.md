# Rift Atlas Hotkey Reference

Captured from the in-game help modal (click the `i` icon in the sidebar). Current as of 2026-04-11.

## Press (tap once)

| Key | Action |
|---|---|
| Backspace / R | Rewind the last action |
| Space | Pass the turn (end turn) |
| D | Draw a card from the main deck |
| Shift + C | Duplicate a visible card |
| A | Approve the top effect on the chain |
| S | Resolve the top effect on the chain |
| Right Click | Reveal top main-deck cards / move card to trash / recycle a rune |
| Q | End showdown or conquer the battlefield |
| W | Pass focus in the current showdown |

## Hold (press and hold while performing a click or hover)

| Key | Action |
|---|---|
| Shift | Put a hovered card on top of your deck |
| C | Add counters on board cards |
| B | Buff units on board |
| T | Target from the top chain effect |
| L | Open the label wheel |
| E | Open the emote wheel |
| P | Ping your own cards for the opponent |

## Design pattern notes

### Hold-to-arm modal actions
Holding C/B/T/L/E/P puts the UI into a temporary mode. Clicks during that mode apply the action. Releasing the key exits the mode. This is a Figma/Photoshop-style modifier pattern — dramatically faster than a toolbar click + target click + confirm loop.

### Space = end whole turn
Space in Rift Atlas is NOT "pass priority" — it's "end my whole turn." If you have nothing more to do, Space is the single-key path to the next turn. For granular priority passing, use W (pass focus in showdown) and A/S for chain.

### Right-click = context menu
Right-click is overloaded depending on context:
- On main deck → peek top cards dialog
- On a card → move to trash
- On a rune → recycle that rune
This makes right-click a "do the obvious thing for this element" shortcut.
