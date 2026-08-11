/**
 * Interaction: Sona's end-of-turn trigger vs. removing Sona in response.
 *   × Sona, Harmonious (ogn-073-298) · Unit · Calm · 4 · Champion, 4 Might
 *     "At the end of your turn, if I'm at a battlefield, ready up to 4 friendly runes."      — P1, at bf1 (or base)
 *   × Shakedown (ogn-033-298) · Spell · Fury · 2+[fury] · Reaction
 *     "Choose an enemy unit. Deal 6 to it unless its controller has you draw 2."           — P2's response
 *   × Retreat (ogn-104-298) · Spell · Mind · 1 · Reaction
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."    — P1's own response
 *
 * Rules: 383.2.a.1 (an "if …" immediately after the trigger condition is part of the CONDITION, checked once
 * when the condition is fulfilled — Sona is the rule's own example: "If she is removed in reaction to the
 * triggered ability, it will still resolve"), 317.1 (Ending Step: end-of-turn triggers), 402.2 / 355.5 (a
 * triggered ability's choices of game objects are made when it is FINALIZED, before anyone gets priority),
 * 355.9.c (an ability and its source are separate objects), 323.5 (lethal damage → killed at Cleanup),
 * 337.4 (controller of the newest item gets priority), 320.1 (Closed state: Reactions/[Add] only),
 * 317.2 (Expiration: pools empty; "ready" is a status and persists).
 *
 * Question: P1 ends the turn with Sona at bf1 and 5 exhausted runes.
 *  (a) When are the "up to 4 runes" chosen?
 *  (b) P2 responds with Shakedown on Sona, P1 takes the 6 → Sona dies before her ability resolves. Runes ready?
 *  (c) P1 responds to their own trigger with Retreat (Sona → hand, channel 1 rune exhausted). Runes ready? Can
 *      the freshly channelled rune be one of the four?
 *  (d) Sona in BASE at the Ending Step — anything on the chain? Any window to respond?
 *
 * Expected: (a) at finalization (402.2 / 355.5): P1 picks 4 of the 5 exhausted runes right away, then P1 → P2
 * get priority. (b) Shakedown resolves first (LIFO), Sona dies at the Cleanup; her ability still resolves in
 * full — 4 runes ready. (c) Retreat resolves first (Sona → hand, 6th rune channelled exhausted); the ability
 * then readies exactly the 4 runes locked at finalization — the new rune was not on the board when choices
 * were made and cannot be substituted in → 4 ready + 2 exhausted going into P2's turn. (d) condition not met
 * at 317.1 → nothing on the chain, no priority for anyone, straight on to P2's turn with all 5 runes exhausted.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SONA = "ogn-073-298";
const SHAKEDOWN = "ogn-033-298";
const RETREAT = "ogn-104-298";

const OLD_RUNES = ["r1", "r2", "r3", "r4", "r5"];

/**
 * Turn 3, P1 active, main phase. P1: Sona at bf1 (or base), five EXHAUSTED calm runes r1..r5, one known rune
 * "newRune" on top of the rune deck (what Retreat will channel), 1 energy, Retreat in hand.
 * P2: 2 energy + 1 fury (exactly Shakedown), Shakedown in hand.
 */
function board(opts: { sonaAt?: "bf1" | "base" } = {}) {
  const b = scenario()
    .turn(3)
    .active(P1)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, opts.sonaAt ?? "bf1", SONA, "sona");
  for (const r of OLD_RUNES) {
    b.rune(P1, "calm", { alias: r, exhausted: true });
  }
  return b
    .card("newRune", { def: { cardType: "rune", domain: "mind", name: "mind Rune" }, owner: P1, zone: "runeDeck" })
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .hand(P1, RETREAT, "retreat")
    .hand(P2, SHAKEDOWN, "shakedown");
}

const ready = (game: Game) => [...game.p1.runes({ ready: true })].sort();
const exhausted = (game: Game) => [...game.p1.runes({ ready: false })].sort();

/** Is P1 currently being asked to choose Sona's runes? */
function sonaRunePick(game: Game) {
  const d = game.decision();
  return d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "sona" ? d : undefined;
}

/**
 * Answer Sona's rune choice IF it is being asked right now. The rules ask at finalization (402.2) — the dedicated
 * (a) test pins that; the other tests call this at finalization AND at resolution so they keep testing their own
 * facet (does the ability still resolve?) independently of the timing question.
 */
async function chooseSonaRunesIfAsked(game: Game, runes: readonly string[]): Promise<boolean> {
  if (!sonaRunePick(game)) {
    return false;
  }
  await game.p1.pick(...runes);
  return true;
}

/** Whoever holds priority passes, then the other player passes → the top item resolves. */
async function passAround(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  await game.acting().passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  await game.acting().passPriority();
}

describe("Sona, Harmonious — removed in response to her own end-of-turn trigger (383.2.a.1)", () => {
  // ── (a) the trigger and its choices ─────────────────────────────────────────────────────────

  test("(a) 317.1 / 383.2.a.1: Sona at bf1 when P1 ends the turn → her triggered ability is put on the chain as P1's item; nothing has readied yet", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    await chooseSonaRunesIfAsked(game, ["r1", "r2", "r3", "r4"]);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "sona", controller: P1, triggered: true });
    expect(ready(game)).toEqual([]);
  });

  // 402.2 / 355.5: "ready up to 4 friendly runes" names specific game objects, so the runes are chosen while the
  // triggered ability is FINALIZED — immediately, before P1 (then P2) receive priority — and the finalized item
  // shows them. Engine (when this fails): finalizes the item with no choice and only asks "Choose a target for
  // Sona" as the ability RESOLVES, after both players passed — P1 gets to see P2's response before committing.
  test("(a) the 'up to 4 runes' are chosen at FINALIZATION (402.2 / 355.5) — P1 is asked to pick from the 5 exhausted runes before anyone gets priority, and the chain item then carries those 4 targets", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    const d = sonaRunePick(game);
    expect(d).toBeDefined();
    expect(d).toMatchObject({ kind: "pick", max: 4, seat: P1 });
    expect((d?.options ?? []).map((o) => o.card ?? o.key).sort()).toEqual(OLD_RUNES);
    await game.p1.pick("r1", "r2", "r3", "r4");
    expect([...(game.chain()[0]?.targets ?? [])].sort()).toEqual(["r1", "r2", "r3", "r4"]);
    // only now: 337.4 — P1 (controller) holds priority first
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(ready(game)).toEqual([]); // choosing is not readying
  });

  test("(a) 337.4 / 320.1: with the trigger pending P1 holds priority first, then P2; it is a Closed state — P1 may cast the Reaction Retreat or use [Add] (recycle a rune) but has no move / play-unit / endTurn; P2 may cast the Reaction Shakedown", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    await chooseSonaRunesIfAsked(game, ["r1", "r2", "r3", "r4"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "retreat")).toBe(true);
    const verbs = new Set(game.p1.legal().map((o) => o.verb));
    expect(verbs.has("passPriority")).toBe(true);
    expect(verbs.has("recycleRune")).toBe(true);
    expect(verbs.has("move")).toBe(false);
    expect(verbs.has("play")).toBe(false);
    expect(verbs.has("endTurn")).toBe(false);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "shakedown")).toBe(true);
  });

  // ── (b) Shakedown kills Sona in response ────────────────────────────────────────────────────

  test("(b) P2 responds with Shakedown on Sona: it goes on top of Sona's trigger targeting her; LIFO — it resolves first and Sona's controller (P1) is the one who elects 'deal 6' vs 'have P2 draw 2'", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    await chooseSonaRunesIfAsked(game, ["r1", "r2", "r3", "r4"]);
    await game.p1.passPriority();
    await game.p2.cast("shakedown", { targets: "sona" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sona", "shakedown"]); // bottom → top
    expect(game.chain()[1]?.targets).toEqual(["sona"]);
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.power("fury")).toBe(0);
    await passAround(game); // P2 (controller of the newest item) then P1
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "shakedown" } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sona"]); // Sona's ability still pending underneath
  });

  test("(b) 323.5 + 383.2.a.1: P1 declines the draw → Sona takes 6 and is killed at the Cleanup while her ability is STILL on the chain; the ability then resolves in full — the 4 chosen runes READY (condition is not re-checked; the ability does not need its source, 355.9.c)", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await game.p1.endTurn();
    await chooseSonaRunesIfAsked(game, ["r1", "r2", "r3", "r4"]);
    await game.p1.passPriority();
    await game.p2.cast("shakedown", { targets: "sona" });
    await passAround(game);
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const deal6 = d?.kind === "pick" ? d.options.find((o) => /deal 6/i.test(o.label)) : undefined;
    expect(deal6).toBeDefined();
    await game.p1.pick(deal6?.key as string);
    // Shakedown done, Cleanup ran: Sona (4 Might, 6 damage) is dead; P2 drew nothing.
    expect(game.zoneOf("sona")).toBe("trash");
    expect(game.zoneOf("shakedown")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "sona", triggered: true });
    expect(ready(game)).toEqual([]);
    // Both pass on the source-less ability → it resolves anyway.
    await passAround(game);
    await chooseSonaRunesIfAsked(game, ["r1", "r2", "r3", "r4"]);
    expect(ready(game)).toEqual(["r1", "r2", "r3", "r4"]);
    expect(game.state("r5").isExhausted).toBe(true);
    expect(game.zoneOf("sona")).toBe("trash");
  });

  test("(b) into P2's turn: the chain is empty so the turn rolls over with no further window; 317.2 empties P1's floating energy but the 4 readied runes stay READY, r5 stays exhausted, Sona stays in P1's trash", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    await chooseSonaRunesIfAsked(game, ["r1", "r2", "r3", "r4"]);
    await game.p1.passPriority();
    await game.p2.cast("shakedown", { targets: "sona" });
    await passAround(game);
    const d = game.decision();
    const deal6 = d?.kind === "pick" ? d.options.find((o) => /deal 6/i.test(o.label)) : undefined;
    await game.p1.pick(deal6?.key as string);
    await passAround(game);
    await chooseSonaRunesIfAsked(game, ["r1", "r2", "r3", "r4"]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p1.energy()).toBe(0); // the unspent [1] is lost (317.2)
    expect(ready(game)).toEqual(["r1", "r2", "r3", "r4"]);
    expect(exhausted(game)).toEqual(["r5"]);
    expect(game.zoneOf("sona")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ── (c) Retreat bounces Sona in response ────────────────────────────────────────────────────

  test("(c) P1 responds to their OWN trigger with Retreat on Sona: Retreat sits on top and resolves first — Sona → P1's hand, P1 channels 1 rune EXHAUSTED (now 6 runes, all exhausted); Sona's ability is still on the chain", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    await chooseSonaRunesIfAsked(game, ["r1", "r2", "r3", "r4"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.cast("retreat", { targets: "sona" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sona", "retreat"]);
    await passAround(game); // P1 (newest item's controller) then P2
    expect(game.zoneOf("sona")).toBe("hand");
    expect(game.p1.hand()).toContain("sona");
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.zoneOf("newRune")).toBe("runePool");
    expect(game.state("newRune").isExhausted).toBe(true);
    expect(game.p1.runes()).toHaveLength(6);
    expect(ready(game)).toEqual([]);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "sona", triggered: true });
  });

  test("(c) 383.2.a.1: with Sona in hand her ability still resolves — the 4 originally-exhausted runes P1 chose READY; going into P2's turn P1 has 4 ready + 2 exhausted runes (r5 and the freshly channelled one), 0 energy, Sona in hand", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    await chooseSonaRunesIfAsked(game, ["r1", "r2", "r3", "r4"]);
    await game.p1.cast("retreat", { targets: "sona" });
    await passAround(game); // Retreat resolves
    await passAround(game); // Sona's ability resolves
    await chooseSonaRunesIfAsked(game, ["r1", "r2", "r3", "r4"]);
    expect(ready(game)).toEqual(["r1", "r2", "r3", "r4"]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(ready(game)).toEqual(["r1", "r2", "r3", "r4"]);
    expect(exhausted(game)).toEqual(["newRune", "r5"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("sona")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  // 402.2 / 355.5 / 355.15: the runes were locked when the trigger was finalized — the rune Retreat channelled
  // afterwards was not on the board then and can never be one of the four (choices are not re-made at resolution).
  // Engine (when this fails): asks at resolution instead and offers all six runes INCLUDING "newRune".
  test("(c) the freshly channelled rune is never eligible — Sona's rune choice (locked at finalization, 402.2 / 355.5) can only name r1..r5, so 'newRune' is not offered at any point and stays exhausted", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    const offeredEarly = sonaRunePick(game)?.options.map((o) => o.card ?? o.key) ?? [];
    if (offeredEarly.length > 0) {
      expect(offeredEarly.sort()).toEqual(OLD_RUNES);
      await game.p1.pick("r1", "r2", "r3", "r4");
    }
    await game.p1.cast("retreat", { targets: "sona" });
    await passAround(game);
    await passAround(game);
    // If the engine asks anything here at all, the new rune must not be among the options.
    const late = sonaRunePick(game);
    const offeredLate = late?.options.map((o) => o.card ?? o.key) ?? [];
    expect(offeredLate).not.toContain("newRune");
    // and trying to name it is rejected
    if (late) {
      await expect(game.p1.pick("newRune", "r1", "r2", "r3")).rejects.toThrow();
    }
  });

  // ── (d) Sona in base: no trigger, no window ─────────────────────────────────────────────────

  test("(d) 383.2.a.1 'No' side: Sona in P1's BASE when the Ending Step begins → the condition is not met, NOTHING is put on the chain, nobody receives priority (P1 cannot even cast Retreat), and the game proceeds straight into P2's turn with all 5 runes still exhausted", async () => {
    const game = await board({ sonaAt: "base" }).build();
    await game.p1.endTurn();
    // No chain item was ever created and no Closed-state window opened: we are already in P2's turn.
    expect(game.chain()).toEqual([]);
    expect(sonaRunePick(game)).toBeUndefined();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    // P1 had no moment to respond: Retreat is not castable now (no priority on P2's open turn), and no move exists
    // that would have carried Sona base → battlefield during the Ending Step anyway.
    expect(game.p1.can("cast", "retreat")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "move")).toBe(false);
    expect(game.zoneOf("sona")).toBe("base");
    expect(ready(game)).toEqual([]);
    expect(exhausted(game)).toEqual([...OLD_RUNES]);
    expect(game.p1.energy()).toBe(0); // 317.2 still emptied the pool
    expect(game.violations()).toEqual([]);
  });

  test("(d) contrast in the same position: had Sona been at bf1 the very same endTurn() leaves the game in P1's Ending Step with her trigger pending — the base case really is 'no trigger', not 'trigger that fizzled'", async () => {
    const atBf = await board({ sonaAt: "bf1" }).build();
    await atBf.p1.endTurn();
    await chooseSonaRunesIfAsked(atBf, ["r1", "r2", "r3", "r4"]);
    expect(atBf.phase()).toBe("ending");
    expect(atBf.turnPlayer()).toBe(P1);
    expect(atBf.chain().map((c) => c.cardId)).toEqual(["sona"]);

    const inBase = await board({ sonaAt: "base" }).build();
    await inBase.p1.endTurn();
    expect(inBase.chain()).toEqual([]);
    expect(inBase.turnPlayer()).toBe(P2);
  });
});
