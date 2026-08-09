/**
 * Ruling 04f59888c32096b8 — Star-Crossed (UNL-128 → unl-128-219) · Spell · Chaos · 3+[chaos] · Reaction
 *   "Return a friendly unit and an enemy unit to their owners' hands."
 *   × Elder Dragon (UNL-118 → unl-118-219) · 12+[body]x4 · 10 Might · "Any amount of your damage is enough to
 *     kill enemy units. When you play me, choose up to one enemy unit at each location. Deal 1 to them."
 *   × Flurry of Blades (OGN-133 → ogn-133-298) · 1 · Reaction · "Deal 1 to all units at battlefields."
 *
 * Q: I Star-Crossed the Elder Dragon in response to its play trigger; they respond with Flurry of Blades.
 *    Do all my units at battlefields die?
 * A: Yes. LIFO: Flurry resolves first while Elder Dragon is still on the board, so the Dragon player's 1
 *    damage is lethal to my units at battlefields. Then Star-Crossed returns the Dragon to hand — a friendly
 *    target already killed by Flurry stays in the trash. Then the Dragon's play trigger resolves with the
 *    targets it locked in when it was put on the chain.
 * Rules: 336–340 (chain, LIFO resolution), 142.4.c (lethal-damage modifier — Elder Dragon is the example),
 *        813 (Reaction), 359.3.e (targets gone → instruction not performed), 376/383 (triggered abilities).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";
const ELDER_DRAGON = "unl-118-219";
const FLURRY_OF_BLADES = "ogn-133-298";

/**
 * P2's turn (the Elder Dragon player). P1 holds bf1 with A (3) and bf2 with B (4), and has C (2) in base;
 * P2 holds bf3 with a 3-Might Guard. P2: exactly 12+1 energy and 4 body (Dragon + Flurry). P1: exactly
 * 3 + chaos (Star-Crossed).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 13, power: { body: 4 } })
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "A" }, "a")
    .unit(P1, "bf2", { might: 4, name: "B" }, "b")
    .unit(P1, "base", { might: 2, name: "C" }, "c")
    .unit(P2, "bf3", { might: 3, name: "Guard" }, "guard")
    .hand(P2, ELDER_DRAGON, "ed")
    .hand(P2, FLURRY_OF_BLADES, "flurry")
    .hand(P1, STAR_CROSSED, "sc");
}

/** If the engine asks P2 to lock the Dragon trigger's targets now, name every enemy unit offered (bounded). */
async function answerDragonTargetPrompts(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P2) {
      return;
    }
    await (d.options[0] ? game.p2.pick(d.options[0].key) : game.p2.decline());
  }
}

/**
 * P2 plays Elder Dragon to base (trigger → chain); P1 answers with Star-Crossed [friendly, Dragon]; P2 answers
 * with Flurry of Blades. Returns with chain = [ed-trigger, sc, flurry].
 */
async function buildChain(game: Game, friendly: "a" | "c"): Promise<void> {
  await game.p2.play("ed", { to: "base" });
  expect(game.zoneOf("ed")).toBe("base");
  expect(game.p2.resources()).toEqual({ energy: 1, power: { body: 0 } });
  await answerDragonTargetPrompts(game);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ed", controller: P2, triggered: true })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 });
  expect(game.p1.can("cast", "sc")).toBe(true);
  const pairs = game.p1.option("cast", "sc")?.fields.find((f) => f.arg === "targets")?.options ?? [];
  expect(pairs).toContainEqual([friendly, "ed"]); // [friendly, enemy] in card-text order
  await game.p1.cast("sc", { targets: [friendly, "ed"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.p2.can("cast", "flurry")).toBe(true);
  await game.p2.cast("flurry");
  expect(game.chain().map((c) => c.cardId)).toEqual(["ed", "sc", "flurry"]);
  expect(game.p2.energy()).toBe(0);
}

/** Pass priority until the chain shrinks by one item. */
async function resolveTop(game: Game): Promise<void> {
  const before = game.chain().length;
  for (let i = 0; i < 4 && game.chain().length >= before; i++) {
    const d = game.decision();
    expect(d?.kind).toBe("action");
    await game.seat(d!.seat).pass();
  }
  expect(game.chain()).toHaveLength(before - 1);
}

describe("Ruling 04f59888c32096b8 — Star-Crossed on Elder Dragon, answered by Flurry of Blades: my battlefield units still die", () => {
  test("the chain builds bottom→top: Elder Dragon's play trigger, Star-Crossed [A, Dragon], Flurry of Blades — each Reaction legal in the Closed State", async () => {
    const game = await board().build();
    await buildChain(game, "a");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ed", controller: P2, triggered: true }),
      expect.objectContaining({ cardId: "sc", controller: P1, targets: ["a", "ed"] }),
      expect.objectContaining({ cardId: "flurry", controller: P2 }),
    ]);
    expect(game.zoneOf("ed")).toBe("base"); // the Dragon (and its passive) is still on the board
  });

  test("Flurry resolves FIRST with the Dragon still in play: its 1 damage is lethal to my units at battlefields — A (3) and B (4) die; C in base is untouched; P2's own Guard just takes 1", async () => {
    const game = await board().build();
    await buildChain(game, "a");
    await resolveTop(game); // Flurry of Blades
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.zoneOf("ed")).toBe("base");
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("c")).toBe("base");
    expect(game.state("c").damage).toBe(0); // base is not a battlefield
    expect(game.zoneOf("guard")).toBe("battlefield-bf3");
    expect(game.state("guard").damage).toBe(1); // the passive only makes ENEMY units fragile
    expect(game.chain().map((c) => c.cardId)).toEqual(["ed", "sc"]);
  });

  test("Star-Crossed resolves NEXT: the Dragon returns to P2's hand, but A — already killed by Flurry — stays in the trash (not returned); nothing is retroactively undone", async () => {
    const game = await board().build();
    await buildChain(game, "a");
    await resolveTop(game); // Flurry
    await resolveTop(game); // Star-Crossed
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("ed")).toBe("hand");
    expect(game.p2.hand()).toContain("ed");
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.p1.hand()).not.toContain("a");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ed"]); // the play trigger is still waiting, last
  });

  test("finally the Dragon's play trigger resolves and the chain empties; end state: A and B dead, Dragon in hand, all three spells in trashes, back to P2's open main phase", async () => {
    const game = await board().build();
    await buildChain(game, "a");
    await game.settle({ policy: "first" }); // any leftover resolution-time choice for the trigger: take it
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("ed")).toBe("hand");
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf3");
    expect(["base", "trash"]).toContain(game.zoneOf("c")); // C's fate depends on the trigger's locked target at base; it was never at a battlefield
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P2 });
  });

  // Ruling step 1: "Its 'When you play me' ability is placed on the chain. Your opponent locks in targets for
  // its damage" — P2 chooses the up-to-one-enemy-unit-per-location targets as the trigger is put on the chain
  // (rule 402.2), BEFORE P1 can respond with Star-Crossed; the trigger later "attempts to resolve using its
  // original targets".
  test("ruling 04f59888c32096b8 — Elder Dragon's trigger locks its targets as it goes on the chain, before anyone may respond", async () => {
    const game = await board().build();
    await game.p2.play("ed", { to: "base" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toEqual(expect.arrayContaining(["a", "b", "c"])); // one enemy unit per location: bf1, bf2, base
    await answerDragonTargetPrompts(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ed", targets: expect.arrayContaining(["a", "b", "c"]), triggered: true })]);
    // …and P1 only now receives priority to Star-Cross.
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 });
  });

  test("contrast: if Star-Crossed's friendly target is C (in base, not hit by Flurry), C DOES return to P1's hand together with the Dragon; A and B still die", async () => {
    const game = await board().build();
    await buildChain(game, "c");
    await resolveTop(game); // Flurry: A, B die; C untouched
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("c")).toBe("base");
    await resolveTop(game); // Star-Crossed
    expect(game.zoneOf("c")).toBe("hand");
    expect(game.p1.hand()).toContain("c");
    expect(game.zoneOf("ed")).toBe("hand");
    await game.settle({ policy: "first" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
