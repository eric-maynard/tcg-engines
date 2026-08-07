/**
 * Repulse — unl-106-219 · Spell · Body · 1 energy + [body] · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Choose a friendly unit at a battlefield. Counter an enemy spell or ability that chooses it
 *   and no other friendly unit.
 *
 * Rules: 813 (Reaction timing — needs priority on a chain / focus in a showdown on the enemy
 * turn), 355.8 (both choices must exist or the spell cannot be played), 355.9.b ("friendly" /
 * "enemy" are read relative to Repulse's controller), 425.1 (a countered item does nothing, is
 * cleared from the chain, costs stay paid), 359.3.e.9.a (uses THIS card as its example: an item
 * that chose several friendly units is not a legal Repulse target unless the others left the board).
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. Two linked choices: the friendly unit must be AT A BATTLEFIELD — an enemy spell aimed at my
 *     unit in base gives Repulse nothing to protect (not castable, 355.8).
 *  2. "…and no other friendly unit": Singularity on TWO of my battlefield units is NOT counterable;
 *     Singularity on one of mine + one of theirs IS; Challenge (their unit + my unit) IS — the
 *     enemy unit is not a "friendly unit" from my side of the table (355.9.b).
 *  3. "enemy spell OR ABILITY": an enemy triggered ability on the chain that chooses my
 *     battlefield unit is fair game; my OWN spell on my own unit never is; a spell that chooses
 *     nothing (Flurry of Blades) never is.
 *  4. Repulse is itself a 1-cost / 1-power spell → Defy can counter it; LIFO then lets the
 *     original bolt land (negative space for the protection).
 *  5. Cost/timing: 1 + [body]; no window in the opponent's Neutral Open state until they act and
 *     pass priority; nothing on the chain on my own turn → unplayable.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-106-219";
const HEXTECH_RAY = "ogn-009-298"; // Action, 1+[fury]: Deal 3 to a unit at a battlefield.
const CHALLENGE = "ogn-128-298"; // Action, 2+[body]: Choose a friendly unit and an enemy unit. They fight.
const SINGULARITY = "ogn-105-298"; // 6+[mind][mind]: Deal 6 to each of up to two units.
const FLURRY = "ogn-133-298"; // Reaction, 1: Deal 1 to all units at battlefields (chooses nothing).
const DISCIPLINE = "ogn-058-298"; // Reaction, 2: Give a unit +2 Might this turn. Draw 1.
const SHIELDBEARER = "ogn-051-298"; // Unit, 3: When you play me, stun a unit.
const DEFY = "ogn-045-298"; // Reaction, 1+[calm]: Counter a spell that costs ≤4 and ≤1 power.

/** P2's turn. P1 holds bf1 with two units and has one in base; P2's unit sits in P2's base (no
 *  enemy presence at bf1, so no cleanup combat muddies the damage assertions). */
function board(p1 = { energy: 1, power: { body: 1 } as Record<string, number> }) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 12, power: { body: 2, calm: 2, fury: 2, mind: 2 } })
    .resources(P1, p1)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Mine" }, "mine")
    .unit(P1, "bf1", { might: 4, name: "Buddy" }, "buddy")
    .unit(P1, "base", { might: 5, name: "Home" }, "home")
    .unit(P2, "base", { might: 5, name: "Theirs" }, "theirs")
    .hand(P1, CARD, "repulse");
}

/** Cast Repulse protecting `unit` against chain item `item`, whatever target shape the engine asks for. */
async function repulse(game: Game, unit: string, item: string) {
  const opts = game.p1.option("cast", "repulse")?.fields.find((f) => f.name === "targets")?.options ?? [];
  const twoRole = opts.some((o) => Array.isArray(o) && o.length === 2);
  await game.p1.cast("repulse", { targets: twoRole ? [unit, item] : item });
}

describe("Repulse (unl-106-219)", () => {
  test("cost + Reaction timing: answers Hextech Ray at my battlefield unit once P2 passes priority; pays 1 energy + 1 body; stacks on top", async () => {
    const game = await board().hand(P2, HEXTECH_RAY, "ray").build();
    expect(game.p1.can("cast", "repulse")).toBe(false); // P2's Neutral Open state — no window (813 / 316.5.b)
    await game.p2.cast("ray", { targets: "mine" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "repulse")).toBe(true);
    await repulse(game, "mine", "ray");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ray", "repulse"]);
    expect(game.zoneOf("repulse")).toBe("chain");
  });

  test("counters the enemy spell: Hextech Ray does nothing, my unit is undamaged, both spells in trash, P2's payment is not refunded (425.1)", async () => {
    const game = await board().hand(P2, HEXTECH_RAY, "ray").build();
    await game.p2.cast("ray", { targets: "mine" });
    expect(game.p2.resources()).toEqual({ energy: 11, power: { body: 2, calm: 2, fury: 1, mind: 2 } });
    await game.p2.passPriority();
    await repulse(game, "mine", "ray");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("mine").damage).toBe(0);
    expect(game.zoneOf("mine")).toBe("battlefield-bf1");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("repulse")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 11, power: { body: 2, calm: 2, fury: 1, mind: 2 } });
    expect(game.violations()).toEqual([]);
  });

  test("unaffordable: 1 energy without body power, or body power without energy → not offered against a legal target", async () => {
    for (const pool of [{ energy: 1, power: {} }, { energy: 0, power: { body: 1 } }]) {
      const game = await board(pool).hand(P2, HEXTECH_RAY, "ray").build();
      await game.p2.cast("ray", { targets: "mine" });
      await game.p2.passPriority();
      expect(game.p1.can("cast", "repulse")).toBe(false);
      const r = await game.p1.try((p) => p.cast("repulse", { targets: "ray" }));
      expect(r.ok).toBe(false);
      expect(game.zoneOf("repulse")).toBe("hand");
    }
  });

  test("nothing on the chain on my own turn → Repulse cannot be played at all (355.8)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { body: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5 }, "mine")
      .hand(P1, CARD, "repulse")
      .build();
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("cast", "repulse")).toBe(false);
  });

  test("Challenge choosing THEIR unit + MY battlefield unit is counterable — the enemy unit is not 'another friendly unit' (355.9.b); nobody fights", async () => {
    const game = await board().hand(P2, CHALLENGE, "challenge").build();
    await game.p2.cast("challenge", { targets: ["theirs", "mine"] });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "repulse")).toBe(true);
    await repulse(game, "mine", "challenge");
    await game.settle();
    expect(game.state("mine").damage).toBe(0);
    expect(game.state("theirs").damage).toBe(0);
    expect(game.zoneOf("challenge")).toBe("trash");
  });

  test("Singularity at ONE of my battlefield units + one of theirs is counterable — neither takes 6", async () => {
    const game = await board().hand(P2, SINGULARITY, "sing").build();
    await game.p2.cast("sing", { targets: ["mine", "theirs"] });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "repulse")).toBe(true);
    await repulse(game, "mine", "sing");
    await game.settle();
    expect(game.zoneOf("mine")).toBe("battlefield-bf1");
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.state("mine").damage).toBe(0);
    expect(game.state("theirs").damage).toBe(0);
  });

  test("Singularity choosing TWO of my battlefield units is NOT a legal Repulse target ('…and no other friendly unit', 359.3.e.9.a) — both should die", async () => {
    // Expected: Repulse is not offered (the only enemy item chose Mine AND Buddy); Singularity
    // resolves and kills both. Actual: the parsed effect is a bare `counter`, so any spell on the
    // chain is a legal target and Repulse counters it.
    const game = await board().hand(P2, SINGULARITY, "sing").build();
    await game.p2.cast("sing", { targets: ["mine", "buddy"] });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "repulse")).toBe(false);
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.zoneOf("buddy")).toBe("trash");
  });

  test("the protected unit must be AT A BATTLEFIELD — Challenge aimed at my BASE unit gives Repulse no legal first choice (355.8)", async () => {
    // Expected: not castable; Challenge resolves and Home (5) trades 5 damage with Theirs (5).
    // Actual: castable (bare counter), so the assertion on can() fails.
    const game = await board().hand(P2, CHALLENGE, "challenge").build();
    await game.p2.cast("challenge", { targets: ["theirs", "home"] });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "repulse")).toBe(false);
    await game.settle();
    expect(game.zoneOf("home")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
  });

  test("an enemy spell that chooses NOTHING (Flurry of Blades: all units at battlefields) is never a Repulse target", async () => {
    // Expected: not offered; Flurry resolves for 1 on every battlefield unit. Actual: offered.
    const game = await board().hand(P2, FLURRY, "flurry").build();
    await game.p2.cast("flurry");
    await game.p2.passPriority();
    expect(game.chain().map((i) => i.cardId)).toEqual(["flurry"]);
    expect(game.p1.can("cast", "repulse")).toBe(false);
    await game.settle();
    expect(game.state("mine").damage).toBe(1);
    expect(game.state("buddy").damage).toBe(1);
    expect(game.state("home").damage).toBe(0);
  });

  test("an enemy spell that chose only THEIR OWN unit (Discipline on Theirs) is not counterable — it chose no friendly unit of mine", async () => {
    // Expected: not offered; Discipline resolves (+2 → 7 Might). Actual: offered.
    const game = await board().hand(P2, DISCIPLINE, "disc").build();
    await game.p2.cast("disc", { targets: "theirs" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "repulse")).toBe(false);
    await game.settle();
    expect(game.state("theirs").might).toBe(7);
  });

  test("my OWN spell on my own battlefield unit is not an 'enemy spell' — Repulse stays unplayable on top of my Discipline", async () => {
    // Expected: on my turn, with only my Discipline (→ Mine) on the chain, Repulse is not legal.
    // Actual: the bare counter accepts any spell that is not Repulse itself.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5, name: "Mine" }, "mine")
      .hand(P1, DISCIPLINE, "disc")
      .hand(P1, CARD, "repulse")
      .build();
    await game.p1.cast("disc", { targets: "mine" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["disc"]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "repulse")).toBe(false);
  });

  test("'spell OR ABILITY' — an enemy triggered ability (Solari Shieldbearer's 'stun a unit') aimed at my battlefield unit can be countered; the Shieldbearer stays, nothing is stunned", async () => {
    // Expected (355.9.a.2 / 425.1.a): with the play trigger on the chain P1 may Repulse it choosing
    // Mine; the trigger is cleared, no unit is stunned, Solari remains in P2's base. Actual: the
    // parsed counter only accepts SPELL items, so Repulse is not even offered.
    const game = await board().hand(P2, SHIELDBEARER, "solari").script(P2, ["mine"]).build();
    await game.p2.play("solari");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "solari", triggered: true, type: "ability" })]);
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.p1.can("cast", "repulse")).toBe(true);
    await repulse(game, "mine", "solari");
    await game.settle({ policy: "first" }); // were the stun still live, "first" would stun something
    expect(game.zoneOf("solari")).toBe("base");
    expect(game.state("mine").isStunned).toBe(false);
    expect(game.state("buddy").isStunned).toBe(false);
    expect(game.state("home").isStunned).toBe(false);
    expect(game.zoneOf("repulse")).toBe("trash");
  });

  test("Repulse is itself a cheap spell: P2's Defy counters it (3-item chain, LIFO) and Hextech Ray then lands for 3", async () => {
    const game = await board().hand(P2, HEXTECH_RAY, "ray").hand(P2, DEFY, "defy").build();
    await game.p2.cast("ray", { targets: "mine" });
    await game.p2.passPriority();
    await repulse(game, "mine", "ray");
    expect(game.actingSeat()).toBe(P1); // 337.1.a — the caster keeps priority
    expect(game.p2.can("cast", "defy")).toBe(false);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "repulse" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ray", "repulse", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("repulse")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("mine").damage).toBe(3);
    expect(game.zoneOf("mine")).toBe("battlefield-bf1"); // 3 < 5
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } }); // 425.1.c — no refund
  });

  test("negative space: without Repulse the same Hextech Ray deals 3 to my unit", async () => {
    const game = await board().hand(P2, HEXTECH_RAY, "ray").build();
    await game.p2.cast("ray", { targets: "mine" });
    await game.settle();
    expect(game.state("mine").damage).toBe(3);
    expect(game.zoneOf("repulse")).toBe("hand");
  });

  test("registry payload should encode BOTH choices — a friendly battlefield unit, then an ENEMY spell-or-ability that chooses it and no other friendly unit", async () => {
    // Expected shape (mirroring Not So Fast's parse): counter → target { type: "spell-or-ability",
    // controller: "enemy", filter.chooses { controller: "friendly", type: "unit", … } } plus a
    // friendly-unit-at-battlefield choice. Actual: abilities = [{ effect: { type: "counter" } }].
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "body", energyCost: 1, powerCost: ["body"], timing: "reaction" });
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as { type: string; timing?: string; effect?: unknown };
    expect(ability).toMatchObject({ timing: "reaction", type: "spell" });
    const json = JSON.stringify(ability.effect);
    expect(json).toContain('"counter"');
    expect(json).toContain('"spell-or-ability"');
    expect(json).toContain('"enemy"');
    expect(json).toMatch(/"chooses"/);
    expect(json).toMatch(/"battlefield"/); // the protected unit must be at a battlefield
  });
});
