/**
 * Interaction: Blade Twirler (ven-002-166) · Unit · Fury · 4 · 4 Might
 *     "The first time I move each turn, choose a player. They [Burn 1]. (They put the top card of their Main Deck into
 *      their trash.)"
 *   × Ride the Wind (ogn-173-298) · Spell · Chaos · 2+[chaos] · Action · "Move a friendly unit and ready it."
 *   × Retreat (ogn-104-298) · Spell · Mind · 1 · Reaction · "Return a friendly unit to its owner's hand. Its owner channels
 *     1 rune exhausted."
 *
 * Position: P1's turn, ample resources. P1 already controls bf1 (a Buddy stands there, so no showdown arises); P2 holds
 * bf2. Blade Twirler is ready in P1's base; P1 holds two Ride the Wind and a Retreat.
 *
 * Question:
 *  (a) Twirler Standard-Moves base → bf1: trigger? Which part is decided at FIN (the player) vs RES (the burn)?
 *  (b) Ride the Wind #1 moves it bf1 → base and readies it — its SECOND move this turn: does "the first time I move each
 *      turn" trigger again (does being readied, or the direction, matter)?
 *  (c) Retreat it (→ hand, channel 1 rune exhausted), re-play it to base (enters exhausted), Ride the Wind #2 moves it
 *      base → bf1 — same physical card, same turn, third move overall: trigger or not? Total burns this turn?
 *  (d) Control: next turn's first move.
 *
 * Rules: 383.1 ("the [Nth] time" is a trigger phrase), 446.1 (every board→board change of position is a Move — Ride the
 * Wind's included), 355.10 (a PLAYER mentioned in a triggered ability's text is a target → chosen at finalization,
 * 402.2), 440.1 (Burn), 124 / 124.1 (a card that goes board → hand → board is a NEW OBJECT with no memory), 144.2
 * (exhausting is the Standard Move's cost — irrelevant to the trigger), 456.1 (recalls don't trigger move abilities —
 * contrast; nothing here is a recall).
 *
 * Expected: (a) yes — item on the chain; player chosen at FIN (either player legal), Burn 1 at RES → burns 1.
 * (b) no — second move of this object this turn; it still moves and readies → burns 1. (c) Retreat makes it a new
 * object; re-played and moved by Ride the Wind #2 it IS "the first time I move" for that object → triggers → burns 2
 * (not 3, not 1); P1 channeled 1 rune exhausted and paid 4 for the Twirler again. (d) new turn → first move triggers.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLADE_TWIRLER = "ven-002-166";
const RIDE_THE_WIND = "ogn-173-298";
const RETREAT = "ogn-104-298";

const START = { chaos: 2, energy: 12 } as const;

/**
 * P1's turn. bf1: P1's (Buddy 2 holds it). bf2: P2's (Enemy 2 holds it — gives Ride the Wind a second destination so
 * its destination is a real choice). Blade Twirler READY in P1's base; hand: rtw1, rtw2, retreat. Pool 12 + [chaos][chaos].
 */
function board() {
  return scenario()
    .resources(P1, { energy: START.energy, power: { chaos: START.chaos } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "bf2", { might: 2, name: "Enemy" }, "enemy")
    .unit(P1, "base", BLADE_TWIRLER, "twirler")
    .hand(P1, RIDE_THE_WIND, "rtw1")
    .hand(P1, RIDE_THE_WIND, "rtw2")
    .hand(P1, RETREAT, "retreat");
}

interface Burns {
  p1: number;
  p2: number;
}

function burnsSince(game: Game, decks0: Burns): Burns {
  return { p1: decks0.p1 - game.p1.deck().length, p2: decks0.p2 - game.p2.deck().length };
}

function decks(game: Game): Burns {
  return { p1: game.p1.deck().length, p2: game.p2.deck().length };
}

function twirlerTriggers(game: Game): number {
  return game.chain().filter((i) => i.cardId === "twirler" && i.triggered).length;
}

/**
 * Resolve a Blade Twirler trigger that is on the chain: pass priority around; when the "choose a player" prompt shows
 * (whenever the engine asks it), name `who`; settle to the open state.
 */
async function resolveTwirl(game: Game, who: string): Promise<void> {
  const r = await game.settle();
  if (r.reason === "unanswered") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick(who);
    const done = await game.settle();
    expect(done.reason).toBe("open");
  } else {
    expect(r.reason).toBe("open");
  }
}

/** (a): Standard Move base → bf1, P1 names P2 for the burn. */
async function firstMove(game: Game): Promise<void> {
  await game.p1.move("twirler", "bf1");
  expect(game.zoneOf("twirler")).toBe("battlefield-bf1");
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(P2); // FIN-time player choice (rules timing)
  }
  await resolveTwirl(game, P2);
}

/** Cast a Ride the Wind on the Twirler towards `dest` ("base" | "battlefield-bf1") and let it resolve (answering a burn prompt with P2 if one appears). */
async function rideTheWind(game: Game, alias: "rtw1" | "rtw2", dest: string): Promise<void> {
  await game.p1.cast(alias, { targets: "twirler" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
  await game.p1.pick(dest);
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(P2); // a FIN-time player choice of a fresh Twirler trigger, if the engine asks it here
  }
  await resolveTwirl(game, P2);
  expect(game.zoneOf(alias)).toBe("trash");
}

/** (c) prefix: Retreat the Twirler (→ hand, channel 1 exhausted), re-play it to base. */
async function retreatAndReplay(game: Game): Promise<void> {
  await game.p1.cast("retreat", { targets: "twirler" });
  await game.settle();
  expect(game.zoneOf("twirler")).toBe("hand");
  await game.p1.play("twirler", { to: "base" });
  await game.settle();
  expect(game.zoneOf("twirler")).toBe("base");
}

describe("Blade Twirler — 'the first time I move each turn' vs Ride the Wind (2nd move) vs Retreat + replay (new object)", () => {
  test("setup sanity: Twirler ready in base, 4 Might; P1 controls bf1 via Buddy; Ride the Wind costs 2 + [chaos], Retreat 1", async () => {
    const game = await board().build();
    expect(game.state("twirler")).toMatchObject({ isReady: true, might: 4, zone: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("rtw1")).toMatchObject({ energyCost: 2, powerCost: ["chaos"] });
    expect(game.state("retreat").energyCost).toBe(1);
  });

  // ── (a) first Standard Move ───────────────────────────────────────────────────────────────────

  test("(a) Standard Move base → bf1 (its first move this turn) puts ONE Blade Twirler trigger on the chain; the move cost only exhausted it (144.2); no showdown (P1 already holds bf1); nothing burned yet", async () => {
    const game = await board().build();
    const d0 = decks(game);
    await game.p1.move("twirler", "bf1");
    expect(game.zoneOf("twirler")).toBe("battlefield-bf1");
    expect(game.state("twirler").isExhausted).toBe(true);
    expect(twirlerTriggers(game)).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "twirler", controller: P1, triggered: true })]);
    expect(game.gameState.battlefields.bf1?.contested ?? false).toBe(false);
    expect(burnsSince(game, d0)).toEqual({ p1: 0, p2: 0 });
  });

  test("(a) 'choose a player' is a TARGET of the triggered ability (355.10) — P1 should be asked to name the player at FINALIZATION (timing FIN, both players offered, not declinable), before anyone holds priority (402.2)", async () => {
    // Expected: right after the move the open decision is P1's FIN pick {player-1, player-2}; priority only afterwards.
    // Actual: the item is finalized with no choice; P1 gets priority at once and the player is asked at RESOLUTION (timing RES).
    const game = await board().build();
    await game.p1.move("twirler", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", seat: P1, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual([P1, P2].sort());
    await game.p1.pick(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(twirlerTriggers(game)).toBe(1);
  });

  test("(a) whichever step asks it, the choice offers BOTH players and cannot be declined; naming P2 burns exactly P2's top Main Deck card into P2's trash on RESOLUTION (440.1) — burns: P2 1, P1 0", async () => {
    const game = await board().build();
    const d0 = decks(game);
    const p2Top = game.p2.deck()[0] as string;
    await game.p1.move("twirler", "bf1");
    let d = game.decision();
    if (d?.kind !== "pick") {
      const r = await game.settle();
      expect(r.reason).toBe("unanswered");
      d = game.decision();
    }
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual([P1, P2].sort());
    expect(burnsSince(game, d0)).toEqual({ p1: 0, p2: 0 }); // nothing burned before resolution
    await game.p1.pick(P2);
    await game.settle();
    expect(burnsSince(game, d0)).toEqual({ p1: 0, p2: 1 });
    expect(game.zoneOf(p2Top)).toBe("trash");
    expect(game.p2.trash()).toContain(p2Top);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(a) control: P1 may name THEMSELF — then P1's own top card is burned and P2's deck is untouched", async () => {
    const game = await board().build();
    const d0 = decks(game);
    await game.p1.move("twirler", "bf1");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick(P1);
    }
    await resolveTwirl(game, P1);
    expect(burnsSince(game, d0)).toEqual({ p1: 1, p2: 0 });
  });

  // ── (b) Ride the Wind: second move this turn ──────────────────────────────────────────────────

  test("(b) Ride the Wind #1 then moves it bf1 → base and readies it: it DID move (446.1) and is ready in base, but this is its SECOND move this turn → no Blade Twirler trigger, no prompt; burns stay at P2 1 (readiness and direction are irrelevant)", async () => {
    const game = await board().build();
    const d0 = decks(game);
    await firstMove(game);
    expect(burnsSince(game, d0)).toEqual({ p1: 0, p2: 1 });
    await game.p1.cast("rtw1", { targets: "twirler" });
    expect(game.p1.energy()).toBe(START.energy - 2);
    expect(game.p1.power("chaos")).toBe(START.chaos - 1);
    await game.p1.pick("base"); // destination, chosen at play (FIN)
    expect(twirlerTriggers(game)).toBe(0);
    const r = await game.settle();
    expect(r.reason).toBe("open"); // no "choose a player" prompt appeared
    expect(game.state("twirler")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.zoneOf("rtw1")).toBe("trash");
    expect(twirlerTriggers(game)).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(burnsSince(game, d0)).toEqual({ p1: 0, p2: 1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) nor does a further Standard Move (base → bf1 again, third move of the same object) trigger — still 1 burn", async () => {
    const game = await board().build();
    const d0 = decks(game);
    await firstMove(game);
    await rideTheWind(game, "rtw1", "base");
    await game.p1.move("twirler", "bf1"); // it is ready again, so it may Standard-Move once more
    expect(twirlerTriggers(game)).toBe(0);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("twirler")).toBe("battlefield-bf1");
    expect(burnsSince(game, d0)).toEqual({ p1: 0, p2: 1 });
  });

  // ── (c) Retreat → replay → Ride the Wind #2 ───────────────────────────────────────────────────

  test("(c) Retreat returns the Twirler to P1's hand and P1 (its owner) channels 1 rune EXHAUSTED; re-playing it costs 4 again and it enters the base exhausted; no move trigger from any of that — energy 12 −2 (RtW) −1 (Retreat) −4 (Twirler) = 5, burns still 1", async () => {
    const game = await board().build();
    const d0 = decks(game);
    await firstMove(game);
    await rideTheWind(game, "rtw1", "base");
    const runes0 = game.p1.runes().length;
    const runeDeck0 = game.p1.runeDeck().length;
    await game.p1.cast("retreat", { targets: "twirler" });
    expect(game.p1.energy()).toBe(START.energy - 2 - 1);
    await game.settle();
    expect(game.zoneOf("twirler")).toBe("hand");
    expect(game.p1.hand()).toContain("twirler");
    expect(game.p1.runes()).toHaveLength(runes0 + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck0 - 1);
    expect(game.zoneOf("retreat")).toBe("trash");
    await game.p1.play("twirler", { to: "base" });
    expect(game.p1.energy()).toBe(START.energy - 2 - 1 - 4); // paid for a second time
    await game.settle();
    expect(game.state("twirler")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(twirlerTriggers(game)).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(burnsSince(game, d0)).toEqual({ p1: 0, p2: 1 });
  });

  test("(c) the re-played Twirler is a NEW OBJECT with no memory of this turn's moves (124 / 124.1) — Ride the Wind #2 moving it base → bf1 is 'the first time I move' for THIS object → the trigger fires again, P1 names a player, they Burn 1 → total burns this turn: P2 2 (not 1, not 3)", async () => {
    // Expected: after RtW #2's destination is chosen a Blade Twirler trigger goes on the chain; naming P2 burns a second card.
    // Actual: the engine keys the "first move this turn" memory to the card id across the hand round-trip, so the
    // fresh Twirler's first move is treated as its fourth — no trigger, burns stay at 1.
    const game = await board().build();
    const d0 = decks(game);
    await firstMove(game);
    await rideTheWind(game, "rtw1", "base");
    await retreatAndReplay(game);
    expect(game.p1.energy()).toBe(5);
    await game.p1.cast("rtw2", { targets: "twirler" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 0 } });
    await game.p1.pick("battlefield-bf1");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick(P2); // FIN-time player choice, if asked here
    }
    // Ride the Wind resolves (move + ready) → the fresh object's first move → trigger
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("twirler")).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
    const asked = game.decision()?.kind === "pick" || twirlerTriggers(game) === 1;
    expect(asked).toBe(true);
    await resolveTwirl(game, P2);
    expect(burnsSince(game, d0)).toEqual({ p1: 0, p2: 2 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) the parts the engine does get right: Ride the Wind #2 moves the re-played (exhausted) Twirler base → bf1 and readies it; one Ride the Wind each in the trash, Retreat in the trash, 3 energy and no chaos left", async () => {
    const game = await board().build();
    await firstMove(game);
    await rideTheWind(game, "rtw1", "base");
    await retreatAndReplay(game);
    await rideTheWind(game, "rtw2", "battlefield-bf1");
    expect(game.state("twirler")).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["rtw1", "rtw2", "retreat"]));
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (d) next turn ─────────────────────────────────────────────────────────────────────────────

  test("(d) control: the per-turn memory resets — on P1's NEXT turn the Twirler's first move (bf1 → base, the 'other direction') triggers again and burns 1 more, however many times it moved this turn", async () => {
    const game = await board().build();
    const d0 = decks(game);
    await firstMove(game);
    await rideTheWind(game, "rtw1", "base");
    await game.p1.move("twirler", "bf1"); // third move this turn, no trigger
    await game.settle();
    expect(burnsSince(game, d0)).toEqual({ p1: 0, p2: 1 });
    await game.advanceTurn(); // → P2's turn
    await game.advanceTurn(); // → P1's next turn (P1 drew 1 at turn start)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("twirler")).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
    const d1 = decks(game);
    await game.p1.move("twirler", "base");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick(P2);
    }
    expect(twirlerTriggers(game)).toBe(1);
    await resolveTwirl(game, P2);
    expect(burnsSince(game, d1)).toEqual({ p1: 0, p2: 1 });
    expect(game.violations()).toEqual([]);
  });
});
