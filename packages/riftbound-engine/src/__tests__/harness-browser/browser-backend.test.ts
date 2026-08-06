/**
 * BrowserBackend against the LIVE app (gated — see _gate.ts).
 *
 *   RB_BROWSER_TESTS=1 bun test packages/riftbound-engine/src/__tests__/harness-browser
 *
 * Each test launches its own /play/test goldfish game (P1 = us, P2 = server goldfish).
 */

import { afterEach, expect, test } from "bun:test";
import type { ActionDecision, Game, PickDecision } from "../../harness";
import { P1 } from "../../harness";
import { BrowserBackend, attachBrowserGame } from "../../harness/browser";
import type { UiCard } from "../../harness/browser";
import { BASE_URL, LIVE_TIMEOUT, describeLive } from "./_gate";

const CLEAVE = "ogn-004-298";
const STACKED_DECK = "ogn-183-298";

let current: BrowserBackend | undefined;

afterEach(async () => {
  await current?.close();
  current = undefined;
});

async function launch(actMode: "semantic" | "visual" = "semantic"): Promise<{ backend: BrowserBackend; game: Game }> {
  const backend = await BrowserBackend.launch({ actMode, baseUrl: BASE_URL, mode: "test", seat: P1 });
  current = backend;
  return { backend, game: attachBrowserGame(backend) };
}

/** Raw read-back from window.__rbGameState (the assertion oracle independent of the adapter). */
function raw(backend: BrowserBackend) {
  const s = backend.currentFrame.snapshot;
  const mine = (zone: string): UiCard[] => (s.zones[zone] ?? []).filter((c) => c.owner === P1);
  return { energy: s.runePools[P1]?.energy ?? 0, mine, snapshot: s, turn: s.turn };
}

/** First playable unit option after tapping; falls back to tutoring a vanilla 2-drop. */
async function pickUnitToPlay(backend: BrowserBackend, game: Game): Promise<string> {
  const opt = game.p1
    .legal()
    .filter((o) => o.moveId === "playUnit" && o.card)
    .sort((a, b) => game.state(a.card as string).energyCost - game.state(b.card as string).energyCost)[0];
  if (opt?.card) {
    return opt.card;
  }
  const { cardId } = await backend.tutor("sfd-018-221");
  return cardId;
}

describeLive("BrowserBackend (semantic) — core loop on the live UI+server", () => {
  test(
    "launch → turn 1 → tapRune ×2 → play cheapest unit (base, exhausted, energy paid) → endTurn → our turn 3 with 4 runes",
    async () => {
      const { backend, game } = await launch();
      const p1 = game.p1;

      expect(backend.sandbox).toBe(true);
      expect(backend.viewingPlayer).toBe(P1);
      expect(game.turnNumber()).toBe(1);
      expect(game.turnPlayer()).toBe(P1);
      expect(game.phase()).toBe("main");
      const d0 = game.decision() as ActionDecision;
      expect(d0).toMatchObject({ context: "main", kind: "action", seat: P1 });
      expect(d0.id).toContain(`d${backend.seq()}:`);
      expect(p1.runes()).toHaveLength(2);
      expect(raw(backend).energy).toBe(0);

      const t1 = await p1.tapRune();
      expect(t1.executed[0]).toMatchObject({ moveId: "exhaustRune", seat: P1 });
      expect(t1.executed.some((e) => e.moveId === "sandboxAutoPlay" && e.auto)).toBe(true);
      await p1.tapRune();
      expect(p1.energy()).toBe(2);
      expect(raw(backend).energy).toBe(2);
      expect(p1.runes({ ready: true })).toHaveLength(0);

      const unit = await pickUnitToPlay(backend, game);
      const cost = game.state(unit).cardType === "unit" ? game.state(unit).energyCost : 0;
      const energyBefore = p1.energy();
      const played = await p1.play(unit);
      expect(played.executed[0]).toMatchObject({ moveId: "playUnit", params: { cardId: unit } });
      await game.settle({ policy: "first" }); // e.g. "When you play me, discard 1"
      expect(game.zoneOf(unit)).toBe("base");
      expect(game.state(unit).isExhausted).toBe(true);
      expect(p1.energy()).toBe(energyBefore - cost);
      // Same facts straight from the client snapshot.
      const inBase = raw(backend)
        .mine("base")
        .find((c) => c.id === unit);
      expect(inBase?.meta?.exhausted).toBe(true);
      expect(raw(backend).energy).toBe(energyBefore - cost);

      const et = await p1.endTurn();
      expect(et.executed[0]?.moveId).toBe("endTurn");
      // Goldfish auto-plays player-2's turn; wait until it is our open main phase again.
      await backend.waitFor((o) => o.turn.activePlayer === P1 && o.turn.number === 3, { timeoutMs: 15_000 });
      await game.settle(); // our own start-of-turn trigger (Loose Cannon) → pass
      expect(game.turnNumber()).toBe(3);
      expect(game.turnPlayer()).toBe(P1);
      expect(game.phase()).toBe("main");
      expect(p1.runes()).toHaveLength(4);
      expect(raw(backend).mine("runePool")).toHaveLength(4);
      expect(game.state(unit).isReady).toBe(true);
      expect(backend.transcript().steps.length).toBeGreaterThanOrEqual(4);
    },
    LIVE_TIMEOUT,
  );

  test(
    "targeted spell via tutor: Cleave cast with {targets} → chain item visible → settle resolves it (trash, Assault granted)",
    async () => {
      const { backend, game } = await launch();
      const p1 = game.p1;
      await p1.tapRunes(2);
      const ally = await pickUnitToPlay(backend, game);
      await p1.play(ally);
      await game.settle({ policy: "first" });
      expect(game.zoneOf(ally)).toBe("base");

      const { cardId: cleave } = await backend.tutor(CLEAVE);
      expect(p1.hand()).toContain(cleave);
      const opt = p1.option("cast", cleave);
      expect(opt?.fields.find((f) => f.name === "targets")?.options).toContainEqual([ally]);

      const r = await p1.cast(cleave, { targets: ally });
      expect(r.executed[0]).toMatchObject({ moveId: "playSpell", params: { cardId: cleave, targets: [ally] } });
      expect(game.chain().map((c) => c.cardId)).toEqual([cleave]);
      expect(backend.currentFrame.snapshot.interaction?.chain?.items.map((i) => i.cardId)).toEqual([cleave]);
      const d = game.decision() as ActionDecision;
      expect(d).toMatchObject({ context: "chain", seat: P1 });
      expect(d.passKey).toBeDefined();

      const s = await game.settle();
      expect(s.reason).toBe("open");
      expect(game.chain()).toHaveLength(0);
      expect(game.zoneOf(cleave)).toBe("trash");
      expect(game.state(ally).grantedKeywords).toContainEqual({ duration: "turn", keyword: "Assault", value: 3 });
    },
    LIVE_TIMEOUT,
  );

  test(
    "pendingChoice via tutor: Stacked Deck surfaces pick(from-revealed) from the live snapshot → answer → resolved",
    async () => {
      const { backend, game } = await launch();
      const p1 = game.p1;
      const { cardId: sd } = await backend.tutor(STACKED_DECK);
      const deckBefore = p1.deck();
      const top3 = deckBefore.slice(0, 3);
      await p1.cast(sd);
      const s = await game.settle();
      expect(s.reason).toBe("unanswered");
      const d = s.decision as PickDecision;
      expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1, semantics: "from-revealed", timing: "RES" });
      expect(backend.currentFrame.snapshot.pendingChoice).toMatchObject({ type: "reveal-and-pick" });
      expect(d.options.map((o) => o.card).sort()).toEqual([...top3].sort());
      expect(d.options.every((o) => o.label.length > 0 && !o.label.startsWith("player-"))).toBe(true);

      const choice = d.options[1] ?? d.options[0];
      const handBefore = p1.hand().length;
      const r = await p1.pick(choice?.key as string);
      expect(r.executed[0]).toMatchObject({ moveId: "resolvePendingChoice", params: { pickedCardId: choice?.card } });
      await game.settle();
      expect(backend.currentFrame.snapshot.pendingChoice).toBeUndefined();
      expect(p1.hand()).toContain(choice?.card as string);
      expect(p1.hand()).toHaveLength(handBefore + 1);
      const rest = top3.filter((c) => c !== choice?.card);
      expect(p1.deck().slice(-2).sort()).toEqual(rest.sort());
      expect(game.zoneOf(sd)).toBe("trash");
      expect((game.decision() as ActionDecision).context).toBe("main");
    },
    LIVE_TIMEOUT,
  );

  test(
    "errors come back as results: unknown option / illegal target / stale decision id leave state untouched",
    async () => {
      const { backend, game } = await launch();
      const seq0 = backend.seq();
      const hash0 = backend.stateHash();
      const bad = await game.act(P1, { key: "playUnit:nope", kind: "action" });
      expect(bad.ok).toBe(false);
      expect(!bad.ok && bad.error.code).toBe("UNKNOWN_OPTION");
      const stale = await game.act(P1, { decisionId: "d0:player-1:action", key: "endTurn:-", kind: "action" });
      expect(!stale.ok && stale.error.code).toBe("STALE_DECISION");
      expect(backend.seq()).toBe(seq0);
      expect(backend.stateHash()).toBe(hash0);
      const { cardId: cleave } = await backend.tutor(CLEAVE);
      // No unit on board: Cleave is not castable at all → UNKNOWN_OPTION with the engine's reason.
      const none = await game.p1.try((s) => s.cast(cleave, { targets: "player-9-ghost" }));
      expect(!none.ok && none.error.code).toBe("UNKNOWN_OPTION");
      await game.p1.tapRunes(2);
      const ally = await pickUnitToPlay(backend, game);
      await game.p1.play(ally);
      await game.settle({ policy: "first" });
      // Castable now, but not with that target → ILLEGAL_ARGS listing the legal values; nothing dispatched.
      const seq1 = backend.seq();
      const r = await game.p1.try((s) => s.cast(cleave, { targets: "player-9-ghost" }));
      expect(!r.ok && r.error.code).toBe("ILLEGAL_ARGS");
      expect(!r.ok && JSON.stringify(r.error.detail)).toContain(ally);
      expect(backend.seq()).toBe(seq1);
      expect(game.zoneOf(cleave)).toBe("hand");
    },
    LIVE_TIMEOUT,
  );
});

describeLive("BrowserBackend (visual) — gestures instead of executeMove", () => {
  test(
    "tapRune (click rune) + play (click hand card) + targeted cast (click → target) + Space (pass) all dispatch through the DOM",
    async () => {
      const { backend, game } = await launch("visual");
      const p1 = game.p1;
      const start = backend.visualLog.length;

      await p1.tapRune();
      await p1.tapRune();
      expect(p1.energy()).toBe(2);
      const taps = backend.visualLog.slice(start).filter((v) => v.moveId === "exhaustRune");
      expect(taps).toHaveLength(2);
      for (const t of taps) {
        expect(t.dispatched).toBe(true);
        expect(t.gesture).toStartWith("click rune ");
        expect(t.visualFallback).toBeUndefined();
        expect(t.mismatch).toBeUndefined();
      }

      const unit = await pickUnitToPlay(backend, game);
      await p1.play(unit);
      const playRec = backend.visualLog.at(-1);
      expect(playRec).toMatchObject({ dispatched: true, moveId: "playUnit" });
      expect(playRec?.gesture).toContain(`click hand ${unit}`);
      expect(playRec?.visualFallback).toBeUndefined();
      await game.settle({ policy: "first" });
      expect(game.zoneOf(unit)).toBe("base");
      expect(raw(backend).mine("base").some((c) => c.id === unit)).toBe(true);

      const { cardId: cleave } = await backend.tutor(CLEAVE);
      await p1.cast(cleave, { targets: unit });
      const castRec = backend.visualLog.at(-1);
      expect(castRec).toMatchObject({ dispatched: true, moveId: "playSpell" });
      expect(castRec?.gesture).toContain(`→ target ${unit}`);
      expect(game.chain().map((c) => c.cardId)).toEqual([cleave]);

      // Space = pass priority (init.js hotkey); goldfish passes back and the spell resolves.
      await p1.pass();
      const passRec = backend.visualLog.at(-1);
      expect(passRec).toMatchObject({ dispatched: true, gesture: "Space (pass)", moveId: "passChainPriority" });
      await game.settle();
      expect(game.zoneOf(cleave)).toBe("trash");
      expect(backend.visualLog.slice(start).filter((v) => v.visualFallback)).toEqual([]);
    },
    LIVE_TIMEOUT,
  );

  test(
    "pending-choice modal click; unmappable moves fall back to semantic with a visualFallback note",
    async () => {
      const { backend, game } = await launch("visual");
      const p1 = game.p1;
      const { cardId: sd } = await backend.tutor(STACKED_DECK);
      await p1.cast(sd);
      const s = await game.settle();
      const d = s.decision as PickDecision;
      expect(d.kind).toBe("pick");
      await p1.pick(d.options[0]?.key as string);
      expect(backend.visualLog.at(-1)).toMatchObject({ dispatched: true, moveId: "resolvePendingChoice" });
      expect(backend.visualLog.at(-1)?.gesture).toStartWith("click modal card #");
      await game.settle();
      expect(p1.hand()).toContain(d.options[0]?.card as string);

      // recycleRune has no dedicated gesture in visual.ts → semantic fallback, recorded.
      const rune = p1.runes()[0] as string;
      await p1.recycleRune(rune);
      const rec = backend.visualLog.at(-1);
      expect(rec).toMatchObject({ dispatched: false, moveId: "recycleRune" });
      expect(rec?.visualFallback).toContain("no visual mapping");
      expect(game.zoneOf(rune)).toBe("runeDeck");
    },
    LIVE_TIMEOUT,
  );
});
