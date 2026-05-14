import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ActionsLegal,
  type BattlefieldUnit,
  type GameView,
  type HandCard,
  type MoveResponse,
  type PingPayload,
  type StateResponse,
  type TrailStep,
  type UndoState,
  fetchState,
  postMove,
  postPing,
  postStep,
  postUndo,
} from "./lib/api";
import { PlayerPanel } from "./components/PlayerPanel";
import { BattlefieldList } from "./components/BattlefieldList";
import { BattlefieldPicker } from "./components/BattlefieldPicker";
import { TargetPicker } from "./components/TargetPicker";
import { BaseZone } from "./components/BaseZone";
import { CombatPanel } from "./components/CombatPanel";
import { ChainPanel } from "./components/ChainPanel";
import { MoveLog, buildCardNameMap } from "./components/MoveLog";
import { TurnBanner } from "./components/TurnBanner";
import { ShowdownBreadcrumb } from "./components/ShowdownBreadcrumb";

interface PlayPageProps {
  readonly sessionId: string;
  /**
   * Local seat id for this browser. Drives which player renders at the
   * Bottom ("you") vs. top ("opponent"), which hand is face-up, and which
   * Inputs are enabled. Defaults to `"player-1"` so legacy callers /
   * Single-player tests keep working unchanged.
   */
  readonly localPlayerId?: string;
}

/**
 * Riftbound play page. Phase B batch 23 XX re-skin toward RiftAtlas:
 *
 *   ┌────────────────────────────────────────────────┬──────────┐
 *   │  Opponent panel (stats + hand backs)            │          │
 *   │  Opponent base zone                             │          │
 *   ├────────────────────────────────────────────────┤  Move    │
 *   │  Battlefield row (centered, wide)               │  log     │
 *   ├────────────────────────────────────────────────┤  +       │
 *   │  Player base zone                               │  phase   │
 *   │  Player panel (stats + hand, fanned at bottom)  │          │
 *   └────────────────────────────────────────────────┴──────────┘
 *
 * Data flow: hydrates from `/api/v2/state/:sessionId` on mount, re-fetches
 * after every move/step. Optimistic UI is a later pass; for the scaffold
 * we trust the server's response shape.
 */
/**
 * Default actionsLegal when the server response omits the field (legacy mock
 * responses in unit tests). End Turn is treated as legal so existing tests
 * that don't pre-populate `actionsLegal` keep working; Step Bot defaults to
 * legal for the same reason.
 */
const DEFAULT_ACTIONS_LEGAL: ActionsLegal = {
  assignAttacker: false,
  assignDefender: false,
  contestBattlefield: false,
  endTurn: true,
  passChainPriority: false,
  passShowdownFocus: false,
  resolveCombat: false,
  startShowdown: false,
  stepBot: true,
};

const TOAST_MS = 3000;

/**
 * Slice 5 (UX affordances): ping pulse duration (ms). Should match the
 * `rb-ping-pulse` keyframe in styles.css (1.2s). The class is removed after
 * Each pulse so re-pinging the same element re-triggers the animation
 * Cleanly (browsers don't restart a CSS animation when the class stays on).
 */
const PING_PULSE_MS = 1200;

/**
 * Slice 5 (UX affordances): apply a brief CSS pulse to the DOM element
 * Matching the ping target. Cards carry `data-card-id="..."`; zones (e.g.
 * Deck/trash piles, base, BF tiles) carry `data-zone-id="..."`. If no
 * Matching element exists in this client's DOM (e.g. opponent pinged a
 * Card that's in their hand, not visible to us), the ping is a no-op.
 */
function applyPingPulse(ping: PingPayload): void {
  if (typeof document === "undefined") {return;}
  const attr = ping.targetType === "card" ? "data-card-id" : "data-zone-id";
  // CSS.escape isn't available in jsdom; do manual quoting via attribute selector.
  const sel = `[${attr}="${ping.targetId.replaceAll("\\", String.raw`\\`).replaceAll("\"", String.raw`\"`)}"]`;
  let nodes: NodeListOf<Element>;
  try {
    nodes = document.querySelectorAll(sel);
  } catch {
    return;
  }
  for (const el of nodes) {
    el.classList.remove("ping-pulse");
    // Force reflow so the class re-application re-runs the keyframe.
    void (el as HTMLElement).offsetWidth;
    el.classList.add("ping-pulse");
    setTimeout(() => {
      el.classList.remove("ping-pulse");
    }, PING_PULSE_MS);
  }
}

/**
 * Iter-8 stretch (phase strip Path B): data-driven phase-id → icon map.
 * Riftbound's seven canonical phases get a glyph each; anything else falls
 * back to no icon (the strip still shows the number + label). Keeping this
 * a tiny lookup table (not per-phase ifs) means the engine can add new
 * phases without code changes here — they just won't get an icon yet.
 */
const PHASE_ICON: Readonly<Record<string, string>> = {
  awaken: "\u{1F305}", // Sunrise
  beginning: "\u{1F504}", // Refresh / start
  channel: "⚡", // Bolt
  draw: "\u{1F0CF}", // Playing card back
  main: "⚔", // Crossed swords
  ending: "\u{1F307}", // Sunset
  cleanup: "\u{1F9F9}", // Broom
};

/**
 * Iter-12 Goal 4: richer hover tooltip per canonical phase. The strip
 * collapses to icon-only at `< 1100px`, so a tooltip with a 1-sentence
 * description helps the player learn the flow without expanding the
 * sidebar. Unknown phase ids fall through to `phase.label` via the
 * existing `title` attribute.
 */
const PHASE_TOOLTIP: Readonly<Record<string, string>> = {
  awaken: "Awaken: ready your exhausted units and gain a power.",
  beginning: "Beginning: start-of-turn triggers and upkeep.",
  channel: "Channel: spend energy to channel a rune from your rune deck.",
  cleanup: "Cleanup: discard down to hand size, ready for next turn.",
  draw: "Draw: draw a card from your deck.",
  ending: "Ending: end-of-turn triggers fire.",
  main: "Main: play units, spells, gear, and initiate showdowns.",
};

export function PlayPage({ sessionId, localPlayerId = "player-1" }: PlayPageProps) {
  const [view, setView] = useState<GameView | null>(null);
  const [trail, setTrail] = useState<readonly TrailStep[]>([]);
  const [hand, setHand] = useState<Record<string, readonly HandCard[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionsLegal, setActionsLegal] = useState<ActionsLegal>(
    DEFAULT_ACTIONS_LEGAL,
  );
  /**
   * Slice 4 (undo/rewind): per-session undo affordance state. Sourced
   * from the SPA state envelope so the button enables/disables in
   * Lockstep with the engine's `canUndo` gates. `undefined` on legacy
   * Mocked responses (most unit tests).
   */
  const [undoState, setUndoState] = useState<UndoState | undefined>(undefined);
  /**
   * Slice 4: rewind animation flag. Set true briefly after a successful
   * Undo so a CSS class pulses the board. Cleared after the animation
   * Window so re-triggering the same undo path works cleanly.
   */
  const [rewindPulse, setRewindPulse] = useState(false);
  const [picker, setPicker] = useState<{
    playerId: string;
    cardId: string;
    cardLabel: string;
    legalLocations: readonly string[];
  } | null>(null);
  // Phase B batch 24 BBB: when the player clicks a spell hand-chip, we pop a
  // TargetPicker so they can pick the spell's target unit(s) BEFORE the move
  // Is POSTed. See `TargetPicker.tsx` for the engine-gap caveat (legal moves
  // Don't enumerate target tuples yet — picker just lists every battlefield
  // Unit and trusts engine validation at apply time).
  const [targetPicker, setTargetPicker] = useState<{
    playerId: string;
    cardId: string;
    cardLabel: string;
    hint?: string;
    // Phase B batch 25 DDD: engine-validated legal target ids (flattened
    // Union of `HandCard.legalTargets` tuples). When set, TargetPicker
    // Restricts its options to these ids only.
    legalTargetIds?: readonly string[];
    // Phase B batch 26 HHH: full tuple list so TargetPicker can switch to a
    // Multi-pick UI for spells whose legal subsets contain >1 target.
    legalTargets?: readonly (ReadonlyArray<string>)[];
    // Iter-N: player-target spell variant config. Set for spells like
    // Sabotage whose `targetDescriptor.type === "player"`; TargetPicker
    // Renders You/Opponent buttons instead of unit options.
    playerTarget?: {
      which: "self" | "opponent" | "any";
      localPlayerId: string;
      opponentPlayerId: string;
    };
    // Iter-N+1: gear-target variant for spells whose `targetDescriptor.type
    // === "gear"` (e.g. unl-070-219 Turn to Dust — "Give a gear [Temporary]").
    // When set, TargetPicker renders a list of gears currently in play.
    gearTarget?: {
      gears: readonly {
        id: string;
        name?: string;
        controller: string;
        location: string;
      }[];
    };
    // Iter-P: permanent-target variant for cards whose
    // `targetDescriptor.type === "permanent"` (e.g. ogn-181-298 Pack of
    // Wonders — "[Exhaust]: Return target permanent..."). TargetPicker
    // Renders units + gears in play as a combined list.
    permanentTarget?: {
      permanents: readonly {
        id: string;
        name?: string;
        controller: string;
        kind: "unit" | "gear";
        location: string;
      }[];
    };
    // Iter-P: spell-target variant for cards whose
    // `targetDescriptor.type === "spell"` (e.g. ogn-032-298 Ravenborn Tome —
    // "[Exhaust]: Target spell deals 1 bonus damage when it resolves.").
    // TargetPicker renders spells currently on the chain.
    spellTarget?: {
      spells: readonly {
        id: string;
        name?: string;
        controller: string;
      }[];
    };
    // Iter-Q: card-in-trash variant. Triggered by spells whose
    // `targetDescriptor.location === "trash"` (e.g. ogn-264-298 Guerilla
    // Warfare — "Return up to two cards with [Hidden] from your trash to
    // Your hand."). TargetPicker renders cards currently in trash with
    // Owner-aware friendly/enemy labelling.
    cardInTrashTarget?: {
      cards: readonly {
        id: string;
        name?: string;
        owner: string;
        cardType?: string;
      }[];
      casterId: string;
      controllerFilter?: "friendly" | "enemy" | "any";
    };
    // Iter-Q: card-in-hand variant. Used for spells whose
    // `targetDescriptor.location === "hand"`. Today no playable card pool
    // Exercises this from cast-from-hand, but the picker variant is
    // Scaffolded so future hand-pick effects (or activated abilities on
    // Gears that target a card in hand) plumb through cleanly.
    cardInHandTarget?: {
      cards: readonly {
        id: string;
        name?: string;
        owner: string;
        cardType?: string;
      }[];
      casterId: string;
    };
    // Iter-Q: card-in-deck (tutor / search) variant. Triggered when the
    // Spell's `targetDescriptor.location === "deck"`. Deck contents are a
    // `secret` zone (engine zone-configs.ts) so the picker renders an
    // Empty-state with a Skip button — the engine resolves the search
    // Itself when the SPA dispatches with `targets: []`.
    cardInDeckTarget?: {
      cards: readonly {
        id: string;
        name?: string;
        cardType?: string;
      }[];
      casterId: string;
      filterHint?: string;
    };
    // Iter-Q: rune-target variant. Triggered when
    // `targetDescriptor.type === "rune"`. Renders runePool entries.
    runeTarget?: {
      runes: readonly {
        id: string;
        name?: string;
        owner: string;
      }[];
      casterId: string;
      controllerFilter?: "friendly" | "enemy" | "any";
    };
  } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, TOAST_MS);
  }, []);

  useEffect(() => () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    }, []);

  const applyState = useCallback(
    (s: StateResponse | MoveResponse) => {
      setView(s.view);
      setTrail(s.trail);
      setHand(s.hand);
      setActionsLegal(s.actionsLegal ?? DEFAULT_ACTIONS_LEGAL);
      setUndoState(s.undo);
    },
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const state = await fetchState(sessionId);
      applyState(state);
      setError(null);
    } catch (error) {
      setError((error as Error).message);
    }
  }, [sessionId, applyState]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 2p live-sync: subscribe to /api/v2/stream/<sessionId> over SSE so we
  // Receive `state` events whenever the OTHER browser applies a move. The
  // EventSource lifecycle is bound to sessionId; we close on unmount /
  // SessionId change.
  //
  // Test harness: vitest uses jsdom which doesn't ship `EventSource`. We
  // Feature-check before constructing one — if absent, just skip the
  // Subscription. The PlayPage still works (fetch-based refresh on each
  // Move) and existing fetch-stub-based tests stay green.
  useEffect(() => {
    if (typeof window === "undefined") {return;}
    const ES = (window as unknown as { EventSource?: typeof EventSource })
      .EventSource;
    if (typeof ES !== "function") {return;}
    let cancelled = false;
    const es = new ES(`/api/v2/stream/${encodeURIComponent(sessionId)}`);
    es.addEventListener("state", (ev: MessageEvent) => {
      if (cancelled) {return;}
      try {
        const next = JSON.parse(ev.data) as StateResponse;
        applyState(next);
      } catch {
        // Bad payload — ignore. Next move will refresh state.
      }
    });
    // Slice 5 (UX affordances): ephemeral ping channel. The server fans
    // Pings out as a named `ping` event distinct from `state`. We find the
    // Matching DOM element (data-card-id or data-zone-id) and add a
    // `.ping-pulse` class for the keyframe duration, then strip it.
    es.addEventListener("ping", (ev: MessageEvent) => {
      if (cancelled) {return;}
      try {
        const ping = JSON.parse(ev.data) as PingPayload;
        applyPingPulse(ping);
      } catch {
        // Bad payload — ignore.
      }
    });
    es.onerror = () => {
      // Connection drop is non-fatal; the browser will auto-reconnect.
    };
    return () => {
      cancelled = true;
      try {es.close();} catch { /* Already closed */ }
    };
  }, [sessionId, applyState]);

  // Preload card images on mount to avoid first-hover network hit.
  useEffect(() => {
    if (!view && Object.keys(hand).length === 0) {return;}
    const urls = new Set<string>();
    // Hand cards
    for (const cards of Object.values(hand)) {
      for (const c of cards) {if (c.imageUrl) {urls.add(c.imageUrl);}}
    }
    // Battlefield units and BF tile art
    for (const bf of view?.battlefields ?? []) {
      if (bf.imageUrl) {urls.add(bf.imageUrl);}
      for (const u of bf.units ?? []) {if (u.imageUrl) {urls.add(u.imageUrl);}}
    }
    for (const url of urls) {
      const img = new Image();
      img.src = url;
    }
  }, [view, hand]);

  const runMove = useCallback(
    async (moveId: string, params: Record<string, unknown>, playerId?: string) => {
      setBusy(true);
      try {
        const r = await postMove(sessionId, { moveId, params, playerId });
        applyState(r);
        if (!r.ok && r.error) {
          setError(r.error);
          showToast(`Move failed: ${r.error}`);
        } else {
          setError(null);
        }
      } catch (error) {
        setError((error as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [sessionId, applyState, showToast],
  );

  /**
   * Click handler for a hand chip. Inspects the card's legal-locations:
   *  - 0 legal locations → still try the play (could be a spell/gear that
   *    doesn't enumerate via playUnit). Server will reject if illegal.
   *  - 1 legal location, just "base" → play directly (no modal noise).
   *  - 2+, or any non-base option → open the picker so the player chooses.
   */
  const handlePlayCard = useCallback(
    (playerId: string, card: HandCard) => {
      const locs = card.legalLocations ?? [];
      // Use card.name when available so the picker title reads as a card
      // Name, not an instance UUID (WW#5).
      const label = card.name ?? card.definitionId;
      // Phase B batch 24 BBB / batch 25 DDD: spell cards that need an
      // Explicit target open a TargetPicker so the human can choose target
      // Unit(s) before the move POSTs. We rely on the server-reported
      // `requiresTarget` flag (derived from the spell's first effect target
      // Descriptor) and the engine-validated `legalTargets` tuples so the
      // Picker only shows legal targets. For self-target / no-target spells
      // (`requiresTarget` false or absent) we fall through to the direct
      // Play path — the engine resolves the target implicitly.
      //
      // Iter-N+1: the gate was previously `isSpell && requiresTarget`. That
      // Skipped gears whose activated abilities target a non-self game
      // Object (e.g. The Syren — `[1], [Exhaust]: Move a friendly unit ...`)
      // Because they aren't spells. Broadened to: open a picker whenever
      // The hand chip carries `requiresTarget` — regardless of cardType.
      // The `targetDescriptor` (when present) selects the picker variant
      // (unit / player / gear); when absent we still fall through to the
      // Legacy unit picker (preserves existing batch-24 tests).
      const needsPicker = card.requiresTarget === true;
      if (needsPicker) {
        // Iter-N: player-target spells (e.g. Sabotage) get the player-pick
        // Variant. We branch on `targetDescriptor.type === "player"` BEFORE
        // Looking at `legalTargets` (which the engine doesn't enumerate for
        // Player-target spells today). The picker submits the chosen
        // Player id via the existing `params.targets` plumbing.
        const td = card.targetDescriptor;
        if (td?.type === "player") {
          const whichRaw = td.which ?? "opponent";
          const which: "self" | "opponent" | "any" =
            whichRaw === "self" || whichRaw === "opponent" || whichRaw === "any"
              ? whichRaw
              : "opponent";
          // LocalPlayerId === the caster; opponent is the other seat. We
          // Derive opponent from view.players so this generalises to any
          // Future 1v1 seat naming.
          const allPlayerIds = (view?.players ?? []).map((p) => p.id);
          const opponentPlayerId =
            allPlayerIds.find((id) => id !== playerId) ?? "player-2";
          const hint =
            card.abilities && card.abilities.length > 0
              ? card.abilities.join(" · ")
              : card.rulesText;
          setTargetPicker({
            cardId: card.id,
            cardLabel: label,
            hint,
            playerId,
            playerTarget: {
              localPlayerId: playerId,
              opponentPlayerId,
              which,
            },
          });
          return;
        }
        // Iter-N+1: gear-target picker. Triggered by spells whose first
        // Effect targets a gear (e.g. Turn to Dust). The engine's
        // `legalMoves` enumerator doesn't yet produce target tuples for
        // Gear-target spells, so we enumerate from `view.gearsInPlay`
        // Directly. Empty list → render an empty-state picker so the human
        // Sees "no gears to target" instead of the chip silently no-op'ing.
        if (td?.type === "gear") {
          const hint =
            card.abilities && card.abilities.length > 0
              ? card.abilities.join(" · ")
              : card.rulesText;
          const gears = (view?.gearsInPlay ?? []).map((g) => ({
            controller: g.controller,
            id: g.id,
            location: g.location,
            name: g.name,
          }));
          setTargetPicker({
            cardId: card.id,
            cardLabel: label,
            gearTarget: { gears },
            hint,
            playerId,
          });
          return;
        }
        // Iter-P: permanent-target picker. "Permanent" = units + gears in
        // Play. Used by gear cards like Pack of Wonders ("Return target
        // Permanent you control to its owner's hand."). We flatten the
        // Battlefield-unit list and `view.gearsInPlay` into a single
        // Permanents list so the human picks from one combined menu.
        if (td?.type === "permanent") {
          const hint =
            card.abilities && card.abilities.length > 0
              ? card.abilities.join(" · ")
              : card.rulesText;
          const perms: {
            id: string;
            name?: string;
            controller: string;
            kind: "unit" | "gear";
            location: string;
          }[] = [];
          for (const bf of view?.battlefields ?? []) {
            for (const u of bf.units) {
              perms.push({
                controller: u.controller,
                id: u.id,
                kind: "unit",
                location: bf.id,
                name: u.name,
              });
            }
          }
          for (const g of view?.gearsInPlay ?? []) {
            perms.push({
              controller: g.controller,
              id: g.id,
              kind: "gear",
              location: g.location,
              name: g.name,
            });
          }
          setTargetPicker({
            cardId: card.id,
            cardLabel: label,
            hint,
            permanentTarget: { permanents: perms },
            playerId,
          });
          return;
        }
        // Iter-Q: card-in-trash picker. Triggered when the spell's
        // `targetDescriptor.location === "trash"` regardless of `type`
        // (`card` / `unit` / `gear` / `spell` / `legend` / `permanent`).
        // Examples: Guerilla Warfare (`card@trash`), Cemetery Attendant
        // (`unit@trash` — but that's a triggered ability), Annie Stubborn
        // (`spell@trash`). The picker filters trash entries by both the
        // Controller axis (friendly/enemy/any) and the card-type axis when
        // The descriptor narrows beyond `"card"`.
        if (td?.location === "trash") {
          const hint =
            card.abilities && card.abilities.length > 0
              ? card.abilities.join(" · ")
              : card.rulesText;
          const subType = td.type;
          const controllerFilter: "friendly" | "enemy" | "any" =
            td.controller === "friendly" || td.controller === "enemy"
              ? td.controller
              : "any";
          const all = view?.cardsInTrash ?? [];
          // If the descriptor narrows to a specific cardType (e.g. "unit"),
          // Filter the trash entries to that cardType. Generic `"card"`
          // And `"permanent"` keep the full list (engine validates).
          const typeFiltered = all.filter((c) => {
            if (!subType || subType === "card" || subType === "permanent")
              {return true;}
            return c.cardType === subType;
          });
          setTargetPicker({
            cardId: card.id,
            cardInTrashTarget: {
              cards: typeFiltered.map((c) => ({
                cardType: c.cardType,
                id: c.id,
                name: c.name,
                owner: c.owner,
              })),
              casterId: playerId,
              controllerFilter,
            },
            cardLabel: label,
            hint,
            playerId,
          });
          return;
        }
        // Iter-Q: card-in-hand picker. Triggered when
        // `targetDescriptor.location === "hand"`. Caster's hand only — the
        // Opponent's hand is private (see Sabotage's reveal-and-pick flow
        // For the cross-hand pattern). Sources candidates from the
        // `hand[playerId]` list the PlayPage already has.
        if (td?.location === "hand") {
          const hint =
            card.abilities && card.abilities.length > 0
              ? card.abilities.join(" · ")
              : card.rulesText;
          const myHand = hand[playerId] ?? [];
          const cards = myHand
            // Don't allow targeting the spell that's currently being cast.
            .filter((h) => h.id !== card.id)
            .map((h) => ({
              cardType: h.cardType,
              id: h.id,
              name: h.name,
              owner: playerId,
            }));
          setTargetPicker({
            cardId: card.id,
            cardInHandTarget: { cards, casterId: playerId },
            cardLabel: label,
            hint,
            playerId,
          });
          return;
        }
        // Iter-Q: card-in-deck (tutor / search) picker. Deck zone is
        // `secret` so the SPA doesn't have the deck list — the picker
        // Renders an empty-state + Skip button. Clicking Skip dispatches
        // With `targets: []` and the engine's spell reducer searches its
        // Own deck copy and applies the effect.
        if (td?.location === "deck") {
          const hint =
            card.abilities && card.abilities.length > 0
              ? card.abilities.join(" · ")
              : card.rulesText;
          // FilterHint = the spell's rulesText one-liner, shown to the
          // Player so they know what the engine will search for.
          const filterHint = card.rulesText?.split("\n")[0];
          setTargetPicker({
            cardId: card.id,
            cardInDeckTarget: {
              cards: [],
              casterId: playerId,
              filterHint,
            },
            cardLabel: label,
            hint,
            playerId,
          });
          return;
        }
        // Iter-Q: rune-target picker. Triggered when
        // `targetDescriptor.type === "rune"`. Today the card pool has no
        // Playable-from-hand cards with this descriptor (all rune-target
        // Abilities are triggered), but the variant is scaffolded so any
        // Future spell whose first effect targets a rune renders correctly.
        if (td?.type === "rune") {
          const hint =
            card.abilities && card.abilities.length > 0
              ? card.abilities.join(" · ")
              : card.rulesText;
          const controllerFilter: "friendly" | "enemy" | "any" =
            td.controller === "friendly" || td.controller === "enemy"
              ? td.controller
              : "any";
          const runes = (view?.runesInPool ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            owner: r.owner,
          }));
          setTargetPicker({
            cardId: card.id,
            cardLabel: label,
            hint,
            playerId,
            runeTarget: {
              casterId: playerId,
              controllerFilter,
              runes,
            },
          });
          return;
        }
        // Iter-P: spell-target picker. Used by cards whose effect targets a
        // Spell on the chain (e.g. Ravenborn Tome — "Target spell deals 1
        // Bonus damage..."). Source the candidates from `view.chain.items`
        // Filtered to `type === "spell"`. Empty list renders an empty-state
        // Picker so the player knows why the click didn't auto-resolve.
        if (td?.type === "spell") {
          const hint =
            card.abilities && card.abilities.length > 0
              ? card.abilities.join(" · ")
              : card.rulesText;
          const chainItems = view?.chain?.items ?? [];
          const spells = chainItems
            .filter((it) => it.type === "spell")
            .map((it) => ({
              controller: it.source.playerId,
              id: it.id,
              name: it.source.cardName,
            }));
          setTargetPicker({
            cardId: card.id,
            cardLabel: label,
            hint,
            playerId,
            spellTarget: { spells },
          });
          return;
        }
        // Flatten the engine's legal target tuples to a deduped id set.
        const tuples = card.legalTargets ?? [];
        const legalTargetIds = [...new Set(tuples.flatMap((tup) => tup ?? []))];
        // If the engine gave us zero legal targets but the card declares a
        // Unit-target descriptor, we still want the picker to open so the
        // Human gets visible feedback. This handles two cases the legacy
        // Gate dropped silently:
        //   - gears with activated unit-targeting abilities (engine doesn't
        //     Enumerate target tuples for activated abilities yet)
        //   - spells whose target tuples haven't been wired through legalMoves
        // We open the picker with NO `legalTargetIds` so it falls back to
        // Listing every battlefield unit (legacy batch-24 behaviour).
        const hint =
          card.abilities && card.abilities.length > 0
            ? card.abilities.join(" · ")
            : card.rulesText;
        if (legalTargetIds.length > 0) {
          setTargetPicker({
            cardId: card.id,
            cardLabel: label,
            hint,
            legalTargetIds,
            legalTargets: tuples,
            playerId,
          });
          return;
        }
        if (td?.type === "unit") {
          setTargetPicker({
            cardId: card.id,
            cardLabel: label,
            hint,
            playerId,
          });
          return;
        }
      }
      if (locs.length === 0) {
        void runMove(
          "playFromHand",
          { cardId: card.id, playerId },
          playerId,
        );
        return;
      }
      if (locs.length === 1 && locs[0] === "base") {
        void runMove(
          "playFromHand",
          { cardId: card.id, location: "base", playerId },
          playerId,
        );
        return;
      }
      setPicker({
        cardId: card.id,
        cardLabel: label,
        legalLocations: locs,
        playerId,
      });
    },
    [
      runMove,
      view?.battlefields,
      view?.gearsInPlay,
      view?.chain,
      view?.cardsInTrash,
      view?.runesInPool,
      view?.players,
      hand,
    ],
  );

  /**
   * Phase B batch 24 BBB: confirm spell targets and POST playFromHand with
   * `params.targets`. The server forwards `targets` through to the engine's
   * `playSpell` reducer (see `tryPlayFromHand` in lib/server-helpers.ts and
   * `playSpell.reducer` in packages/riftbound-engine cards.ts). Empty array
   * means "skip — let the engine auto-resolve".
   */
  const pickTargets = useCallback(
    (targetIds: readonly string[]) => {
      if (!targetPicker) {return;}
      const { playerId, cardId } = targetPicker;
      setTargetPicker(null);
      void runMove(
        "playFromHand",
        { cardId, playerId, targets: [...targetIds] },
        playerId,
      );
    },
    [targetPicker, runMove],
  );

  /**
   * Iter-N: resolve a pendingChoice by submitting the engine's
   * `resolvePendingChoice` move with the picked card id. Uses the regular
   * `/api/v2/move` route — unknown move ids fall through to
   * `session.applyMove` (see server.ts), so no new endpoint is needed.
   * The prompter (active player) is the only one who may resolve; we read
   * it off `view.pendingChoice.prompter` rather than guessing.
   */
  const resolvePendingChoice = useCallback(
    (pickedCardId: string) => {
      const pc = view?.pendingChoice;
      if (!pc) {return;}
      void runMove(
        "resolvePendingChoice",
        { pickedCardId, playerId: pc.prompter },
        pc.prompter,
      );
    },
    [view?.pendingChoice, runMove],
  );

  const pickLocation = useCallback(
    (location: string) => {
      if (!picker) {return;}
      const { playerId, cardId } = picker;
      setPicker(null);
      void runMove(
        "playFromHand",
        { cardId, location, playerId },
        playerId,
      );
    },
    [picker, runMove],
  );

  const stepBot = useCallback(async () => {
    setBusy(true);
    try {
      const r = await postStep(sessionId);
      applyState(r);
      if (r.skipped) {
        showToast(`Step Bot skipped: ${r.reason ?? "not the bot's turn"}`);
      } else if (!r.ok && r.error) {
        showToast(`Step Bot failed: ${r.error}`);
      }
      setError(null);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [sessionId, applyState, showToast]);

  /**
   * Slice 5 (UX affordances): ping a card or zone. Posts to /api/v2/ping;
   * The server broadcasts a `ping` SSE event to every subscriber (including
   * Us, so both browsers animate the same pulse). Failures are silent —
   * Pings are an ephemeral UX affordance, not a critical move.
   */
  const triggerPing = useCallback(
    (
      targetType: "card" | "zone",
      targetId: string,
      coords?: { x: number; y: number },
    ) => {
      if (!targetId) {return;}
      void postPing(sessionId, {
        playerId: localPlayerId,
        targetId,
        targetType,
        ...coords,
      }).catch(() => {
        // Silent — ping is best-effort.
      });
    },
    [sessionId, localPlayerId],
  );

  /**
   * Slice 5 (UX affordances): delegated right-click + shift-click handler
   * For the play board. Walks up from the target looking for the nearest
   * Element carrying `data-card-id` or `data-zone-id` and pings it.
   * Right-click suppresses the native context menu so it doesn't fight
   * The animation. Shift-click is the keyboard-friendly alternative for
   * Trackpad users (Mac context-menu gesture varies).
   */
  const handleBoardPing = useCallback(
    (ev: React.MouseEvent<HTMLDivElement>) => {
      let el: HTMLElement | null = ev.target as HTMLElement | null;
      let targetType: "card" | "zone" | null = null;
      let targetId: string | null = null;
      while (el && el !== ev.currentTarget) {
        const cardId = el.getAttribute("data-card-id");
        if (cardId) {
          targetType = "card";
          targetId = cardId;
          break;
        }
        const zoneId = el.getAttribute("data-zone-id");
        if (zoneId) {
          targetType = "zone";
          targetId = zoneId;
          break;
        }
        el = el.parentElement;
      }
      if (!targetType || !targetId) {return;}
      ev.preventDefault();
      triggerPing(targetType, targetId, { x: ev.clientX, y: ev.clientY });
    },
    [triggerPing],
  );

  /**
   * Slice 4 (undo/rewind): rewind the local player's last move. Server
   * Enforces the same gates `undoState.canUndoBy[localPlayerId]`
   * Reflects, so this is best-effort — we still surface a toast on
   * Failure (e.g. opponent moved in the window between SSE event and
   * Click) so the human knows why nothing happened.
   *
   * On success: flash a brief board pulse + "Move undone" toast. The
   * SSE broadcast (from the server) takes care of updating the opponent
   * Browser, so we don't need to fan out anything client-side.
   */
  const undoLastMove = useCallback(async () => {
    setBusy(true);
    try {
      const r = await postUndo(sessionId, localPlayerId);
      applyState(r);
      if (r.ok) {
        const undoneLabel = r.undone?.label ?? "last move";
        showToast(`Move undone (${undoneLabel})`);
        setRewindPulse(true);
        setTimeout(() => setRewindPulse(false), 600);
        setError(null);
      } else if (r.error) {
        showToast(`Undo failed: ${r.error}`);
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [sessionId, localPlayerId, applyState, showToast]);

  /**
   * Build a cardId → display-name lookup that the MoveLog uses to translate
   * raw `params.cardId` into a human-readable card name. The map covers
   * every card we currently have a name for: every player's hand + every
   * battlefield unit. Cards that have already moved out of these zones
   * (e.g. to a trash pile not yet exposed by the API) fall through to the
   * raw id — which is the same behaviour as before, just with the common
   * case fixed.
   */
  const cardNames = useMemo(
    () => buildCardNameMap(hand, view?.battlefields ?? []),
    [hand, view?.battlefields],
  );

  if (!view) {
    return (
      <div className="loading" data-testid="loading">
        {error ? `Error: ${error}` : "Loading…"}
      </div>
    );
  }

  const active = view.turn.activePlayer;
  const isGameOver = Boolean(view.winner);
  // Iter-11 gap 3: the hand chip that opened a picker stays highlighted
  // (gold border, lifted) until the picker closes. Pure derived state — no
  // Extra selection bookkeeping. Either picker can be active, never both.
  const selectedHandCardId = picker?.cardId ?? targetPicker?.cardId ?? null;

  // Sort players so the opponent renders on TOP and "us" (the local seat
  // From `?as=` / props) renders at the bottom. This mirrors the RiftAtlas
  // Table-top orientation. The local seat is data-driven via the
  // `localPlayerId` prop so a second browser with `?as=player-2` sees
  // Player-2 at the bottom and player-1 at the top.
  const players = [...view.players];
  const localId = localPlayerId;
  const us = players.find((p) => p.id === localId) ?? players[0]!;
  const opponent = players.find((p) => p.id !== us.id);
  // 2p input gating: when the active player is NOT the local seat, the
  // Board renders read-only. We still let SSE updates flow in; we just
  // Disable mutation controls and skip opening pickers. Combat focus owner
  // Overrides the active-player check (see CombatPanel which already gates
  // On `localPlayerId` for assignAttacker / assignDefender).
  const isOurTurn = us.id === active;

  // Phase B batch 24 AAA: read base-zone units directly off the per-player
  // GameViewPlayer field threaded through the v2 API. Falls back to `[]` if
  // The field is missing (legacy mocked responses in unit tests).
  const baseUnitsFor = (playerId: string): readonly BattlefieldUnit[] => {
    const p = players.find((pp) => pp.id === playerId);
    return p?.baseUnits ?? [];
  };

  // Slice 4: derive Undo-button state. We only show the button when there's
  // Actually a move in history (avoids a permanently-disabled button on a
  // Fresh page). `canUndo` from the server is the source of truth for
  // Enabled/disabled — but we additionally gate on "is it our turn or were
  // We the last mover" so a non-active local seat can still undo their own
  // Last move on the previous turn (the server already enforces this; this
  // Is just a UI defensive default for legacy mocked responses).
  const canUndo = Boolean(undoState?.canUndoBy?.[localPlayerId]);
  const undoVisible = (undoState?.undoCount ?? 0) > 0;
  const undoLabel = undoState?.lastMove?.label
    ? `Undo (${undoState.lastMove.label})`
    : "Undo";

  return (
    <div
      className={`play-page ${rewindPulse ? "rewind-pulse" : ""}`}
      data-testid="play-page"
      data-rewinding={rewindPulse ? "true" : "false"}
    >
      <header className="turn-header">
        <div className="phase-strip" data-testid="phase-strip">
          {view.phaseStrip.map((p, idx) => {
            const isActive = p.id === view.turn.phase;
            // Iter-8 stretch (Path B): each phase carries a small icon glyph
            // Looked up from a tiny data-driven map. Falls back to the phase
            // Number for unknown ids (defensive — keeps unit-test phaseStrips
            // With synthetic ids like "main" working without a phase icon).
            const icon = PHASE_ICON[p.id.toLowerCase()] ?? null;
            const tip = PHASE_TOOLTIP[p.id.toLowerCase()] ?? p.label;
            return (
              <span
                key={p.id}
                className={`phase ${isActive ? "phase-active" : ""}`}
                data-testid={`phase-${p.id}`}
                data-active={isActive ? "true" : "false"}
                data-phase-tip={tip}
                title={tip}
                aria-label={p.label}
                tabIndex={0}
              >
                <span className="phase-num">{idx + 1}</span>
                {icon ? (
                  <span
                    className="phase-icon"
                    aria-hidden="true"
                    data-testid={`phase-icon-${p.id}`}
                  >
                    {icon}
                  </span>
                ) : null}
                <span className="phase-label">{p.label}</span>
                {idx < view.phaseStrip.length - 1 ? (
                  <span
                    className="phase-arrow"
                    aria-hidden="true"
                    data-testid={`phase-arrow-${p.id}`}
                  >
                    ›
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      </header>

      <section className="controls">
        <button
          type="button"
          data-testid="end-turn"
          disabled={busy || isGameOver || !actionsLegal.endTurn || !isOurTurn}
          title={
            !isOurTurn
              ? "Waiting for opponent…"
              : (!actionsLegal.endTurn
                ? "endTurn not legal right now"
                : undefined)
          }
          onClick={() => void runMove("endTurn", {}, active)}
        >
          End Turn
        </button>
        {undoVisible && (
          <button
            type="button"
            data-testid="undo"
            className="undo-btn"
            disabled={busy || isGameOver || !canUndo}
            title={
              canUndo
                ? `Rewind your last move${
                    undoState?.lastMove?.label
                      ? ` (${undoState.lastMove.label})`
                      : ""
                  }`
                : "Undo unavailable — opponent moved or chain resolved"
            }
            onClick={() => void undoLastMove()}
          >
            {undoLabel}
          </button>
        )}
        <button
          type="button"
          data-testid="step-bot"
          disabled={busy || isGameOver || !actionsLegal.stepBot || !isOurTurn}
          title={
            !isOurTurn
              ? "Waiting for opponent…"
              : (!actionsLegal.stepBot
                ? "It's your turn — make a move"
                : undefined)
          }
          onClick={() => void stepBot()}
        >
          Step Bot
        </button>
        <button
          type="button"
          data-testid="refresh"
          className="refresh-icon-btn"
          disabled={busy}
          onClick={() => void refresh()}
          title="Refresh state"
          aria-label="Refresh state"
        >
          <span aria-hidden="true">↻</span>
        </button>
        {error ? (
          <span className="error" data-testid="error">
            {error}
          </span>
        ) : null}
      </section>

      {toast ? (
        <div
          className="toast"
          data-testid="toast"
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      ) : null}

      {!isOurTurn && !isGameOver ? (
        <div
          className="waiting-banner"
          data-testid="waiting-banner"
          role="status"
          aria-live="polite"
        >
          Waiting for opponent…
        </div>
      ) : null}

      <div
        className="board"
        data-testid="board"
        onContextMenu={handleBoardPing}
        onAuxClick={(ev) => {
          // Some browsers/devices route middle/right-clicks via auxclick too;
          // Reuse the same delegated handler so the affordance is symmetric.
          if (ev.button === 2) {handleBoardPing(ev);}
        }}
        onClick={(ev) => {
          // Shift-click alt-ping for trackpad / no-right-click devices.
          if (ev.shiftKey) {handleBoardPing(ev);}
        }}
      >
        <div className="board-main">
          {/* OPPONENT (top) */}
          {opponent ? (
            <section
              className={`seat seat-opponent${opponent.id === active ? " seat-active" : ""}`}
              data-testid="seat-opponent"
              data-player-id={opponent.id}
              data-active={opponent.id === active ? "true" : "false"}
            >
              <PlayerPanel
                key={opponent.id}
                player={opponent}
                isActive={opponent.id === active}
                victoryScore={view.victoryScore}
                hand={hand[opponent.id] ?? []}
                // 2p: the opponent seat is never playable from this browser
                // (we only ever mutate the local player's hand). `canPlay`
                // Stays false; the face-down hand chips are already disabled
                // Visually by the `revealHand=false` path.
                canPlay={false}
                onPlayCard={(card) => handlePlayCard(opponent.id, card)}
                revealHand={
                  view.pendingChoice?.revealer === opponent.id
                }
                selectedCardId={selectedHandCardId}
                isLocalPlayer={false}
                pendingChoice={view.pendingChoice}
                onPickRevealedCard={resolvePendingChoice}
              />
              <BaseZone
                playerId={opponent.id}
                units={baseUnitsFor(opponent.id)}
                label="Opponent base"
              />
            </section>
          ) : null}

          {/* BATTLEFIELDS (middle) */}
          <section className="battlefield-band" data-testid="battlefield-band">
            <BattlefieldList
              battlefields={view.battlefields}
              activeBattlefieldId={view.combat?.battlefieldId ?? null}
              localPlayerId={us.id}
              combatPhase={view.combat?.phase ?? null}
              attackerIds={view.combat?.attackers.map((u) => u.id) ?? []}
              defenderIds={view.combat?.defenders.map((u) => u.id) ?? []}
              pairs={view.combat?.pairs}
              combatAttackers={view.combat?.attackers}
              combatDefenders={view.combat?.defenders}
              actionableRolePhase={
                view.combat
                  ? actionsLegal.assignAttacker
                    ? "attacker"
                    : actionsLegal.assignDefender
                      ? "defender"
                      : null
                  : null
              }
            />
          </section>

          {/* US (bottom) */}
          <section
            className={`seat seat-self${us.id === active ? " seat-active" : ""}`}
            data-testid="seat-self"
            data-player-id={us.id}
            data-active={us.id === active ? "true" : "false"}
          >
            <BaseZone
              playerId={us.id}
              units={baseUnitsFor(us.id)}
              label="Your base"
            />
            <PlayerPanel
              key={us.id}
              player={us}
              isActive={us.id === active}
              victoryScore={view.victoryScore}
              hand={hand[us.id] ?? []}
              canPlay={!busy && !isGameOver && us.id === active}
              onPlayCard={(card) => handlePlayCard(us.id, card)}
              revealHand
              selectedCardId={selectedHandCardId}
              isLocalPlayer
              pendingChoice={view.pendingChoice}
              onPickRevealedCard={resolvePendingChoice}
            />
          </section>
        </div>

        <aside className="board-side" data-testid="board-side">
          <TurnBanner
            turnNumber={view.turn.number}
            phaseLabel={view.turn.phaseLabel}
            activePlayerId={active}
            status={view.status}
            winner={view.winner}
            localPlayerId={us.id}
          />
          {/* Iter-12 Goal 1: showdown timeline breadcrumb. Renders just
              below the TurnBanner when a combat is active, so the player
              can see which step of declare-attackers → defenders → strikes
              → resolution they're on. Pure render — driven by combat.phase. */}
          {view.combat ? (
            <ShowdownBreadcrumb
              currentPhase={view.combat.phase}
              attackerCount={view.combat.attackers.length}
              defenderCount={view.combat.defenders.length}
            />
          ) : null}
          {/* Iter-9 gap 1: Combat & Chain wrapped in <details> so they
              collapse when not active. Open by default when present so a
              live showdown / chain pops to attention. MoveLog gets the
              remaining vertical space via `.move-log-fill` flex sizing. */}
          {view.combat ? (
            <details
              className="rail-section rail-section-combat"
              data-testid="rail-section-combat"
              open
            >
              <summary className="rail-section-summary">Combat</summary>
              <CombatPanel
                combat={view.combat}
                battlefieldName={
                  view.battlefields.find((bf) => bf.id === view.combat?.battlefieldId)?.name
                }
                localPlayerId={us.id}
                assignableUnits={
                  view.combat
                    ? view.battlefields.find((bf) => bf.id === view.combat!.battlefieldId)
                        ?.units ?? []
                    : []
                }
                actionsLegal={actionsLegal}
                disabled={busy || isGameOver}
                onAssignAttacker={(unitId) =>
                  void runMove(
                    "assignAttacker",
                    { playerId: us.id, unitId },
                    us.id,
                  )
                }
                onAssignDefender={(unitId) =>
                  void runMove(
                    "assignDefender",
                    { playerId: us.id, unitId },
                    us.id,
                  )
                }
                onPassFocus={() =>
                  void runMove(
                    "passShowdownFocus",
                    { playerId: us.id },
                    us.id,
                  )
                }
                onResolveCombat={(battlefieldId) =>
                  void runMove(
                    "resolveCombat",
                    { battlefieldId },
                    us.id,
                  )
                }
              />
            </details>
          ) : (
            <details
              className="rail-section rail-section-combat rail-section-empty"
              data-testid="rail-section-combat"
            >
              <summary className="rail-section-summary">
                Combat <span className="rail-section-empty-hint">(idle)</span>
              </summary>
              <p className="rail-section-empty-body">No active showdown.</p>
            </details>
          )}
          {view.chain && view.chain.items.length > 0 ? (
            <details
              className="rail-section rail-section-chain"
              data-testid="rail-section-chain"
              open
            >
              <summary className="rail-section-summary">
                Chain <span className="rail-section-count">({view.chain.items.length})</span>
              </summary>
              <ChainPanel
                chain={view.chain}
                localPlayerId={us.id}
                actionsLegal={actionsLegal}
                disabled={busy || isGameOver}
                onPassPriority={() =>
                  void runMove(
                    "passChainPriority",
                    { playerId: us.id },
                    us.id,
                  )
                }
              />
            </details>
          ) : (
            <details
              className="rail-section rail-section-chain rail-section-empty"
              data-testid="rail-section-chain"
            >
              <summary className="rail-section-summary">
                Chain <span className="rail-section-empty-hint">(empty)</span>
              </summary>
              <p className="rail-section-empty-body">No spells on the chain.</p>
            </details>
          )}
          <div className="move-log-fill" data-testid="move-log-fill">
            <MoveLog trail={trail} cardNames={cardNames} />
          </div>
        </aside>
      </div>

      {isGameOver ? (
        <div
          className="game-over-banner"
          data-testid="game-over-banner"
          aria-live="polite"
          role="status"
        >
          <div className="game-over-banner-inner">
            <span
              className="game-over-banner-trophy"
              data-testid="game-over-trophy"
              aria-hidden="true"
            >
              ♛
            </span>
            <span className="game-over-banner-title">GAME OVER</span>
            <span
              className="game-over-banner-winner"
              data-testid="game-over-winner"
            >
              {view.winner} Wins
            </span>
            <span
              className="game-over-banner-subtitle"
              data-testid="game-over-subtitle"
            >
              Victory · Turn {view.turn.number}
            </span>
          </div>
        </div>
      ) : null}

      {picker ? (
        <BattlefieldPicker
          cardId={picker.cardId}
          cardLabel={picker.cardLabel}
          battlefields={view.battlefields}
          legalLocations={picker.legalLocations}
          onPick={pickLocation}
          onCancel={() => setPicker(null)}
        />
      ) : null}

      {targetPicker ? (
        <TargetPicker
          cardId={targetPicker.cardId}
          cardLabel={targetPicker.cardLabel}
          hint={targetPicker.hint}
          battlefields={view.battlefields}
          casterId={targetPicker.playerId}
          onConfirm={pickTargets}
          onCancel={() => setTargetPicker(null)}
          legalTargetIds={targetPicker.legalTargetIds}
          legalTargets={targetPicker.legalTargets}
          playerTarget={targetPicker.playerTarget}
          gearTarget={targetPicker.gearTarget}
          permanentTarget={targetPicker.permanentTarget}
          spellTarget={targetPicker.spellTarget}
          cardInTrashTarget={targetPicker.cardInTrashTarget}
          cardInHandTarget={targetPicker.cardInHandTarget}
          cardInDeckTarget={targetPicker.cardInDeckTarget}
          runeTarget={targetPicker.runeTarget}
        />
      ) : null}
    </div>
  );
}
