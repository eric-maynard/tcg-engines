/**
 * Emperor's Divide — sfd-043-221 · Spell · Calm · 2 energy (no power) · Action
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Action] (Play on your turn or in showdowns.)
 *   Move any number of friendly units at a battlefield to their base.
 *
 * Head-judge notes — the tricky situations for this card:
 *   1. "any number" may be zero (355.13): the spell is castable with no friendly unit at any
 *      battlefield and then simply resolves to the trash.
 *   2. "friendly units at a battlefield": enemy units and units in a base are never legal; the
 *      singular "a battlefield" (same template as Fox-Fire, 355.11.b) means one battlefield per cast.
 *   3. [Action] timing (rule 155): own turn in an open state, or in a showdown while holding Focus —
 *      even on the opponent's turn; never on a closed chain and never in the opponent's open state.
 *   4. The retreat trick: cast by the DEFENDER in a combat showdown, all defenders go home before
 *      damage → nobody is hurt and the attacker conquers an empty battlefield (466.3.a / 466.5);
 *      cast by the ATTACKER, the attack is called off and the defender keeps control.
 *   5. Hidden (811): hide for [rainbow] at a battlefield you control; from the next turn it is a
 *      0-cost Reaction whose choices are restricted to units at THAT battlefield (811.1.d.2).
 *   6. Counter-card: Minotaur Reckoner (sfd-014-221, "Units can't move to base") shuts it off.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-043-221";
const RECKONER = "sfd-014-221";
const CANTRIP = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Cantrip",
  timing: "action",
} as const;

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "A" }, "a", { exhausted: true })
    .unit(P1, "bf1", { might: 3, name: "B" }, "b", { damage: 1 })
    .unit(P1, "bf1", { might: 1, name: "Stay" }, "stay")
    .unit(P1, "bf2", { might: 2, name: "Far" }, "far")
    .unit(P2, "bf2", { might: 4, name: "Foe" }, "foe")
    .unit(P1, "base", { might: 1, name: "Home" }, "home")
    .hand(P1, CARD, "ed");
}

function targetSets(game: { p1: { option: (v: string, c: string) => { fields: readonly { arg: string; options?: readonly unknown[] }[] } | undefined } }, verb = "cast") {
  const sets = (game.p1.option(verb, "ed")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
  return sets.map((s) => [...s].sort().join("+")).sort();
}

describe("Emperor's Divide (sfd-043-221)", () => {
  test.failing("BUG: parsed abilities should carry the 'at a battlefield' restriction (target.location) — the parser drops it", async () => {
    // Expected: move target = friendly units, quantity any, location "battlefield". Actual: no `location`
    // key at all, which is why base units become legal targets (see the target-set BUG below).
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "calm", energyCost: 2, name: "Emperor's Divide", timing: "action" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { keyword: "Hidden", type: "keyword" },
      {
        effect: { target: { controller: "friendly", location: "battlefield", quantity: "any", type: "unit" }, to: "base", type: "move" },
        timing: "action",
        type: "spell",
      },
    ]);
  });

  test("costs 2 energy; moves the chosen friendly units (2 of 3 at bf1) to base keeping their exhausted/damage state; spell → trash", async () => {
    const game = await board().build();
    await game.p1.cast("ed", { targets: ["a", "b"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ed", controller: P1, triggered: false })]);
    expect(game.locationOf("a")).toBe("bf1"); // nothing moves before resolution
    await game.settle();
    expect(game.locationOf("a")).toBe("base");
    expect(game.locationOf("b")).toBe("base");
    expect(game.state("a").isExhausted).toBe(true);
    expect(game.state("b").damage).toBe(1);
    expect(game.locationOf("stay")).toBe("bf1");
    expect(game.locationOf("far")).toBe("bf2");
    expect(game.locationOf("foe")).toBe("bf2");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // still occupied by Stay
    expect(game.zoneOf("ed")).toBe("trash");
    const poor = await board().resources(P1, { energy: 1 }).build();
    expect(poor.p1.can("cast", "ed")).toBe(false);
  });

  test("legal target sets: only FRIENDLY units, any subset of the bf1 trio, and the empty set (355.13); enemy units rejected", async () => {
    const game = await board().build();
    const norm = targetSets(game);
    expect(norm).toContain(""); // zero targets is a legal choice
    expect(norm).toEqual(expect.arrayContaining(["a", "b", "stay", "a+b", "a+stay", "b+stay", "a+b+stay", "far"]));
    expect(norm.some((s) => s.includes("foe"))).toBe(false); // enemy
    const enemy = await game.p1.try((p) => p.cast("ed", { targets: ["foe"] }));
    expect(!enemy.ok && enemy.error.code).toBe("ILLEGAL_ARGS");
  });

  test.failing("BUG: 'units AT A BATTLEFIELD' — a friendly unit sitting in the base must not be a legal target", async () => {
    // Expected: "home" never appears in any target set and naming it is ILLEGAL_ARGS.
    // Actual: the location filter is missing, so base units are offered (and "moved" to where they already are).
    const game = await board().build();
    const norm = targetSets(game);
    expect(norm.some((s) => s.split("+").includes("home"))).toBe(false);
    const r = await game.p1.try((p) => p.cast("ed", { targets: ["home"] }));
    expect(!r.ok && r.error.code).toBe("ILLEGAL_ARGS");
  });

  test.failing("BUG: 'at A battlefield' (singular, cf. Fox-Fire 355.11.b) — units from two different battlefields cannot be mixed in one cast", async () => {
    // Expected: no set contains both a bf1 unit and "far" (bf2). Actual: a+far, b+far, a+b+far … are all offered.
    const game = await board().build();
    const norm = targetSets(game);
    expect(norm.some((s) => s.includes("far") && s !== "far")).toBe(false);
    const split = await game.p1.try((p) => p.cast("ed", { targets: ["a", "far"] }));
    expect(!split.ok && split.error.code).toBe("ILLEGAL_ARGS");
  });

  test("zero targets: castable with no friendly unit at any battlefield; resolves doing nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "foe")
      .unit(P1, "base", { might: 1 }, "home")
      .hand(P1, CARD, "ed")
      .build();
    expect(game.p1.can("cast", "ed")).toBe(true);
    await game.p1.cast("ed", { targets: [] });
    await game.settle();
    expect(game.zoneOf("ed")).toBe("trash");
    expect(game.locationOf("foe")).toBe("bf1");
    expect(game.locationOf("home")).toBe("base");
    expect(game.p1.energy()).toBe(0);
  });

  test("[Action] timing: not castable in the opponent's open state, nor by anyone on a closed chain", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "ed")).toBe(false);
    const game = await board().hand(P1, CANTRIP, "cantrip").build();
    await game.p1.cast("cantrip");
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("cast", "ed")).toBe(false); // an Action is not a Reaction
    await game.settle();
    expect(game.p1.can("cast", "ed")).toBe(true);
  });

  test("defender's retreat: in a combat showdown on the opponent's turn, pull every defender home → no damage, attacker conquers", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "D1" }, "d1")
      .unit(P1, "bf1", { might: 2, name: "D2" }, "d2")
      .unit(P2, "base", { might: 6, name: "Attacker" }, "atk")
      .hand(P1, CARD, "ed")
      .build();
    await game.p2.move("atk", "bf1");
    expect(game.p1.can("cast", "ed")).toBe(false); // P2 holds Focus first
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "ed")).toBe(true);
    await game.p1.cast("ed", { targets: ["d1", "d2"] });
    await game.settle();
    expect(game.locationOf("d1")).toBe("base");
    expect(game.locationOf("d2")).toBe("base");
    expect(game.state("d1").damage).toBe(0);
    expect(game.state("d2").damage).toBe(0);
    expect(game.state("atk").damage).toBe(0);
    expect(game.locationOf("atk")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
  });

  test("attacker's retreat: with Focus as the attacker, pull both attackers home → no combat, defender keeps the battlefield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "A1" }, "a1")
      .unit(P1, "base", { might: 2, name: "A2" }, "a2")
      .hand(P1, CARD, "ed")
      .build();
    await game.p1.move(["a1", "a2"], "bf1");
    expect(game.actingSeat()).toBe(P1); // attacker has Focus
    await game.p1.cast("ed", { targets: ["a1", "a2"] });
    await game.settle();
    expect(game.locationOf("a1")).toBe("base");
    expect(game.locationOf("a2")).toBe("base");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.state("wall").damage).toBe(0);
    expect(game.state("a1").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Hidden: hide for [rainbow] at a battlefield you control (no chain, not revealable this turn); not at an enemy battlefield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "holder")
      .hand(P1, CARD, "ed")
      .build();
    await game.p1.hide("ed", "bf1");
    expect(game.zoneOf("ed")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("reveal", "ed")).toBe(false);
    const enemyBf = await scenario().resources(P1, { power: { rainbow: 1 } }).battlefield("bf1", { controller: P2 }).hand(P1, CARD, "ed").build();
    expect(enemyBf.p1.can("hide", "ed")).toBe(false);
  });

  function hiddenAtBf1() {
    return scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Here" }, "here")
      .unit(P1, "bf1", { might: 2, name: "Here2" }, "here2")
      .unit(P1, "bf2", { might: 2, name: "There" }, "there")
      .hand(P1, CARD, "ed");
  }

  test("from facedown on a later turn: played for 0 (opens a chain, 811.1.c.3); units at OTHER battlefields are untouched (811.1.d.2); → trash", async () => {
    const game = await hiddenAtBf1().build();
    await game.p1.hide("ed", "bf1");
    await game.advanceTurn();
    expect(game.p1.can("reveal", "ed")).toBe(true); // already a Reaction on the opponent's turn (811.6)
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    const norm = targetSets(game, "reveal");
    expect(norm.some((s) => s.includes("there"))).toBe(false);
    await game.p1.reveal("ed", { answers: [["here", "here2"]] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ed", controller: P1, triggered: false })]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("here", "here2");
      await game.settle();
    }
    expect(game.locationOf("here")).toBe("base");
    expect(game.locationOf("here2")).toBe("base");
    expect(game.locationOf("there")).toBe("bf2");
    expect(game.zoneOf("ed")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
  });

  test.failing("BUG: from facedown the caster still CHOOSES 'any number' — picking only Here must leave Here2 holding bf1", async () => {
    // Expected: a target choice (at play time or a pick on resolution) restricted to here|here2; choosing just
    // "here" moves only it. Actual: no choice is offered and every friendly unit at bf1 is moved home.
    const game = await hiddenAtBf1().build();
    await game.p1.hide("ed", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.reveal("ed", { answers: [["here"]] });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("here");
      await game.settle();
    }
    expect(game.locationOf("here")).toBe("base");
    expect(game.locationOf("here2")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("hidden copy reacts on the OPPONENT's turn (811.6): when attacked, reveal for 0 with Focus and evacuate the defender", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Scout" }, "scout")
      .unit(P2, "base", { might: 5, name: "Bruiser" }, "bruiser")
      .facedown(P1, "bf1", CARD, "ed", { hiddenOnTurn: 1 })
      .build();
    await game.p2.move("bruiser", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "ed")).toBe(true);
    await game.p1.reveal("ed", { answers: [["scout"]] });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("scout");
      await game.settle();
    }
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.state("scout").damage).toBe(0);
    expect(game.zoneOf("ed")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("counter-card: with Minotaur Reckoner ('Units can't move to base') in play the chosen unit stays put", async () => {
    // Reckoner's static binds both players' units and effect-driven moves alike; the spell still
    // resolves (and is trashed) but its move instruction cannot be carried out.
    const game = await board().unit(P2, "base", RECKONER, "reckoner").build();
    await game.p1.cast("ed", { targets: ["a", "b"] });
    await game.settle();
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.locationOf("b")).toBe("bf1");
    expect(game.zoneOf("ed")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
  });
});
