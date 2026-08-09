/**
 * Interaction: The Harrowing (ogn-198-298) · Spell · Chaos · 6+[chaos][chaos] · Action
 *     "Play a unit from your trash, ignoring its Energy cost. (You must still pay its Power cost.)"
 *   × Soulgorger (ogn-196-298) · Unit · Chaos · 8+[chaos][chaos] · 5 Might
 *     "When you play me, you may play a unit from your trash, ignoring its Energy cost."
 *   × Vanguard Captain (ogn-218-298) · Unit · Order · 3+[order] · 3 Might
 *     "[Legion] — When you play me, play two 1 [Might] Recruit unit tokens here."
 *
 * Rules: 355.10.a (a unit in your PUBLIC trash is a target, chosen on cast), 354.1–354.3 (a play begun
 * by a resolving effect puts the card on the chain Pending and waits for that effect to finish),
 * 337.1/337.1.a/337.2 (the oldest Pending item is finalized at once, no priority passes, permanents
 * resolve immediately), 337.4 (priority only once nothing is Pending), 355.2.a (location = base or a
 * battlefield you control, chosen per play), 356.1.b.2 (ignore Energy only — Power still paid),
 * 359.2.c/143.4 (units and unit tokens enter exhausted), 355.5.b (a play trigger's choices are made
 * when the TRIGGER finalizes, not when the unit is played), 383.3.a (a leading "you may" is decided
 * at finalization), 812.1.c/419.4.b (Legion: a DIFFERENT card Finalized by you this turn),
 * 191.3.d (P1 decides for "When you play me"), 350.2 (tokens are played but are not cards), 419.3.b.
 *
 * Question: P1 (nothing played yet) casts The Harrowing on Soulgorger in trash, then uses Soulgorger's
 * trigger on Vanguard Captain in trash. Who is Pending/Finalized when, what is paid, may the two units
 * land in DIFFERENT locations, where can P2 react, does everything enter exhausted, and is Captain's
 * Legion active when the only "other cards" are the very Harrowing/Soulgorger playing him? (Yes.)
 * Contrast: Captain from hand as the first card of the turn → no tokens.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARROWING = "ogn-198-298";
const SOULGORGER = "ogn-196-298";
const CAPTAIN = "ogn-218-298";
const DISCIPLINE = "ogn-058-298"; // Calm Reaction, 2 energy — P2's "I could respond here" probe

/**
 * P1: exactly 6 energy (Harrowing) + chaos 4 (2 for Harrowing, 2 for Soulgorger) + order 1 (Captain).
 * No spare energy at all — every unit must come in at Energy 0. P1 controls bf1 (via a holder), P2
 * controls bf2. P2 holds a Reaction and the energy for it.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { chaos: 4, order: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Their Holder" }, "theirHolder")
    .trash(P1, SOULGORGER, "sg")
    .trash(P1, CAPTAIN, "captain")
    .hand(P1, HARROWING, "har")
    .hand(P2, DISCIPLINE, "disc");
}

const tokensAt = (game: Game, loc: string) => game.p1.units(loc).filter((u) => game.state(u).isToken);

/** Cast Harrowing on Soulgorger and have both players pass → Harrowing resolves, Soulgorger is Pending. */
async function harrowingResolves(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("har", { targets: "sg" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

/** …then Soulgorger to `l1`, accept the trigger, everyone passes, pick Captain, Captain to `l2`. */
async function fullLine(l1: "base" | "bf1", l2: "base" | "bf1"): Promise<Game> {
  const game = await harrowingResolves();
  await game.p1.pick(l1); // Soulgorger's location
  await game.p1.yes(); // 383.3.a — perform the optional trigger
  await game.settle(); // both pass on Soulgorger's trigger → it resolves
  await pickCaptainIfAsked(game); // engine asks which trash unit on resolution (see BUG 4)
  await game.p1.pick(l2); // Captain's location
  await game.settle(); // Captain's Legion trigger resolves
  return game;
}

describe("The Harrowing → Soulgorger → Vanguard Captain (nested effect-plays + Legion)", () => {
  test("1) Harrowing targets a unit in P1's trash at cast time (355.10.a): offered = {Soulgorger, Captain}; P1 pays 6 + [chaos][chaos]", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "har")?.fields.find((f) => f.arg === "targets");
    expect(field?.required).toBe(true);
    expect((field?.options ?? []).map((o) => (o as string[])[0]).sort()).toEqual(["captain", "sg"]);
    await game.p1.cast("har", { targets: "sg" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 2, order: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "har", controller: P1, targets: ["sg"], triggered: false })]);
    expect(game.zoneOf("har")).toBe("chain");
    expect(game.zoneOf("sg")).toBe("trash"); // only targeted, not yet played
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1); // Harrowing is Finalized
  });

  test("1) P2 may react to The Harrowing normally: after P1 passes, P2 holds priority with a legal Reaction", async () => {
    const game = await board().build();
    await game.p1.cast("har", { targets: "sg" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc")).toBe(true);
    expect(game.p2.can("passPriority")).toBe(true);
  });

  test("2) Harrowing resolves: it is in the trash, Soulgorger is a Pending permanent on the chain and P1 — with no priority pass — is asked for its location (354.2, 337.1/337.1.a, 355.2.a)", async () => {
    const game = await harrowingResolves();
    expect(game.zoneOf("har")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sg", controller: P1, type: "permanent" })]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "sg" } });
    // 355.2.a: base or a battlefield P1 controls — never P2's bf2
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bf1"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 2, order: 1 } }); // nothing paid for sg yet
  });

  // Expected (354.1–354.2): beginning the play removes Soulgorger from the trash and puts it on the
  // chain as a Pending item, so while P1 is choosing its location it is in zone "chain".
  // Actual: the chain lists Soulgorger but the card instance still reports zone "trash".
  test("2) while Pending, Soulgorger has left the trash and is in the chain zone (354.2)", async () => {
    const game = await harrowingResolves();
    expect(game.chain().map((i) => i.cardId)).toEqual(["sg"]);
    expect(game.zoneOf("sg")).toBe("chain");
    expect(game.p1.trash()).not.toContain("sg");
  });

  test("3) Soulgorger finalizes: Energy 8→0 but [chaos][chaos] is paid (356.1.b.2); it enters EXHAUSTED at the chosen battlefield and counts as P1's 2nd card played", async () => {
    const game = await harrowingResolves();
    await game.p1.pick("bf1");
    expect(game.zoneOf("sg")).toBe("battlefield-bf1");
    expect(game.state("sg")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, order: 1 } });
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(2);
  });

  test("3) the Power cost is real: with only ONE chaos left after Harrowing, Soulgorger never reaches the board and that chaos is not spent", async () => {
    // Naming Soulgorger on cast is still fine (P1 could Add power in response); the play just fails on resolution.
    const game = await board().resources(P1, { energy: 6, power: { chaos: 3, order: 1 } }).build();
    await game.p1.cast("har", { targets: "sg" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1, order: 1 } });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.zoneOf("sg")).toBe("trash");
    expect(game.locationOf("sg")).toBeUndefined();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1, order: 1 } });
    expect(game.zoneOf("har")).toBe("trash");
  });

  // Expected (355.10.a): Harrowing TARGETED Soulgorger; if that target cannot be played on resolution the
  // spell simply does nothing more — it may not swap in a different trash unit. Actual: the engine falls
  // back to a "pick a revealed card to play" prompt offering Vanguard Captain instead.
  test("3) an unpayable targeted Soulgorger does not let Harrowing substitute another trash unit on resolution", async () => {
    const game = await board().resources(P1, { energy: 6, power: { chaos: 3, order: 1 } }).build();
    await game.p1.cast("har", { targets: "sg" });
    await game.settle();
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(offered).not.toContain("captain");
    expect(d).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("3→4) no priority between Harrowing resolving and Soulgorger finalizing (337.1.a): P2's next decision only comes once Soulgorger is on the board and its trigger is Finalized", async () => {
    const game = await harrowingResolves();
    // P1: destination (RES) → P1: opt-in for the trigger (FIN) → P1 priority → P2 priority
    expect(game.decision()?.seat).toBe(P1);
    await game.p1.pick("bf1");
    const optIn = game.decision();
    expect(optIn).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "sg" }, timing: "FIN" }); // 383.3.a
    await game.p1.yes();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sg", triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    // 337.4: nothing Pending → P2 gets priority and MAY react before the trigger resolves
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc")).toBe(true);
    expect(game.zoneOf("sg")).toBe("battlefield-bf1");
    expect(game.zoneOf("captain")).toBe("trash"); // Captain not played yet — still exposed in the trash
  });

  // Expected (355.10.a + 355.5/355.5.b): "a unit from your trash" is a target of Soulgorger's TRIGGER,
  // chosen when that trigger is finalized — so the chain item names Captain before P2 gets priority
  // (which is what lets P2 answer by e.g. removing Captain from the trash to fizzle the play).
  // Actual: no choice at finalization; the engine asks which trash unit only as the trigger resolves.
  test("4) Captain is chosen as the trigger's target at finalization and shown on the chain before P2's priority (355.5.b, 355.10.a)", async () => {
    const game = await harrowingResolves();
    await game.p1.pick("bf1");
    await game.p1.yes();
    await pickCaptainIfAsked(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sg", targets: ["captain"], triggered: true })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()[0]?.targets).toEqual(["captain"]);
  });

  test("5) 'you may' declined (383.3.a.2): the trigger leaves the chain, Captain stays in the trash, order power untouched, open main phase", async () => {
    const game = await harrowingResolves();
    await game.p1.pick("bf1");
    await game.p1.no();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("captain")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, order: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(2);
  });

  test("5) trigger resolves: Captain goes Pending, P1 picks ITS location independently (base while Soulgorger sits at bf1), pays [order] but 0 energy, enters exhausted", async () => {
    const game = await harrowingResolves();
    await game.p1.pick("bf1");
    await game.p1.yes();
    await game.settle();
    await pickCaptainIfAsked(game);
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "captain" } });
    expect(dest?.kind === "pick" ? dest.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bf1"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "captain", type: "permanent" })]);
    await game.p1.pick("base");
    expect(game.zoneOf("captain")).toBe("base");
    expect(game.locationOf("sg")).toBe("bf1");
    expect(game.state("captain")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, order: 0 } });
  });

  test("6) LEGION IS ACTIVE: Harrowing and Soulgorger were Finalized by P1 this turn (812.1.c, 419.4.b) — Captain's trigger goes on the chain (P2 may respond) and makes two exhausted 1-Might Recruit tokens 'here' = Captain's location, not Soulgorger's", async () => {
    const game = await harrowingResolves();
    await game.p1.pick("bf1");
    await game.p1.yes();
    await game.settle();
    await pickCaptainIfAsked(game);
    await game.p1.pick("base");
    // Captain's play trigger is a chain item of its own; P2 gets a window on it too
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "captain", controller: P1, triggered: true, type: "ability" })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.settle();
    const tokens = tokensAt(game, "base");
    expect(tokens).toHaveLength(2);
    for (const t of tokens) {
      expect(game.state(t)).toMatchObject({ controller: P1, isExhausted: true, isToken: true, might: 1, name: "Recruit" });
    }
    expect(tokensAt(game, "bf1")).toHaveLength(0);
  });

  test("6) reversed locations: Soulgorger to base, Captain to bf1 → the Recruits appear at bf1 (355.2 per play; 'here' follows Captain)", async () => {
    const game = await fullLine("base", "bf1");
    expect(game.locationOf("sg")).toBe("base");
    expect(game.locationOf("captain")).toBe("bf1");
    expect(tokensAt(game, "bf1")).toHaveLength(2);
    expect(tokensAt(game, "base")).toHaveLength(0);
    expect(tokensAt(game, "bf1").every((t) => game.state(t).isExhausted)).toBe(true);
  });

  test("end state: P1 has played exactly 3 CARDS this turn (Harrowing, Soulgorger, Captain — tokens are not cards, 350.2); all three bodies exhausted; chain empty; no invariant violations", async () => {
    const game = await fullLine("bf1", "base");
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(3);
    expect(game.zoneOf("har")).toBe("trash");
    expect(game.state("sg").isExhausted).toBe(true);
    expect(game.state("captain").isExhausted).toBe(true);
    expect(game.p1.units("base").length + game.p1.units("bf1").length).toBe(1 /* holder */ + 2 /* sg, captain */ + 2 /* recruits */);
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, order: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: Captain played from HAND as P1's first card of the turn costs 3+[order], Legion is inactive → no Recruit tokens", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .hand(P1, CAPTAIN, "captain")
      .build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    await game.p1.play("captain", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("captain")).toBe("base");
    expect(game.state("captain").isExhausted).toBe(true);
    expect(tokensAt(game, "base")).toHaveLength(0);
    expect(gameStateCount(game)).toBe(1);
  });

  test("contrast: Captain from hand as the SECOND card (after any other finalized card) → two Recruits; the effect-play route changes cost and timing, not the Legion test", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { order: 1 } })
      .hand(P1, { energyCost: 1, might: 1, name: "Cheap Body" }, "cheap")
      .hand(P1, CAPTAIN, "captain")
      .build();
    await game.p1.play("cheap");
    await game.settle();
    await game.p1.play("captain");
    await game.settle();
    expect(tokensAt(game, "base")).toHaveLength(2);
    expect(gameStateCount(game)).toBe(2);
  });
});

function gameStateCount(game: Game): number {
  return game.gameState.cardsPlayedThisTurn?.[P1] ?? 0;
}

/** If the engine is asking which trash unit Soulgorger's trigger plays (a non-destination pick), name Captain. */
async function pickCaptainIfAsked(game: Game): Promise<void> {
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.semantics !== "destination" && d.options.some((o) => o.key === "captain")) {
    await game.p1.pick("captain");
  }
}
