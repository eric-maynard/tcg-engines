/**
 * Rocket Barrage — sfd-077-221 · Spell · Mind · 4 energy + [mind]
 *
 *   [Repeat] [4][mind] (You may pay the additional cost to repeat this spell's effect, and may make
 *   different choices.)
 *   Choose one —
 *     • Deal 4 to a unit in a base.
 *     • Kill a gear.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - No [Action]/[Reaction] printed → standard timing: own turn, Neutral Open state only (not in a
 *    showdown, not in response, not on the opponent's turn).
 *  - Mode 1 is "a unit IN A BASE" (either player's base) — units at battlefields are never legal;
 *    4 damage is exactly lethal on 4 Might, one short on 5.
 *  - Mode 2 kills ANY gear (friendly or enemy). Natural counter-target: Poro Snax — a killed Snax
 *    draws nothing for its owner (its draw is an activated cash-in, not a Deathknell).
 *  - 820.2.a uses this very card as its example: with the Repeat cost paid the effect executes
 *    twice as ONE chain item and each execution may pick a different mode and/or target
 *    (4 + kill gear; 4 + 4 on one 8-Might unit; two different gear in a chosen order).
 *  - 355.8: playable iff at least one mode has a legal target (gear only → yes; nothing → no); a
 *    mode with no legal target may not be the one chosen.
 *  - Cost edge: 4 + [mind]; Repeat needs 8 + 2 mind total; [rainbow] in the pool pays [mind].
 *  - Deflect on the chosen base unit adds [rainbow] to the cost for an opposing caster.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-077-221";
const PORO_SNAX = "sfd-046-221"; // gear: "[1][calm], [Exhaust], Kill this: Draw 1."
const DEFLECTOR = "ogn-013-298"; // Pouty Poro — 2-Might unit with Deflect
const DAMAGE = 0; // printed mode order
const KILL_GEAR = 1;

function board(energy = 4, mind = 1) {
  return scenario()
    .resources(P1, { energy, power: { mind } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Frontliner" }, "front")
    .unit(P2, "base", { might: 4, name: "Four" }, "four")
    .unit(P2, "base", { might: 5, name: "Five" }, "five")
    .unit(P1, "base", { might: 8, name: "Big Friend" }, "big")
    .gear(P2, PORO_SNAX, "snax")
    .gear(P1, PORO_SNAX, "mySnax")
    .hand(P1, CARD, "rb");
}

/**
 * Pass priority around and answer the spell's prompts (mode index / target alias) in order.
 * Returns the option keys each pick prompt offered, for targeting assertions.
 */
async function resolve(game: Game, answers: (string | number)[]): Promise<string[][]> {
  const offered: string[][] = [];
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick") {
      offered.push(d.options.map((o) => o.card ?? o.key));
      const want = answers.shift();
      expect(want).toBeDefined();
      const key = d.options.find((o) => o.key === String(want) || o.card === want)?.key;
      expect(key).toBeDefined();
      await game.seat(d.seat).answer({ keys: [key as string], kind: "pick" });
    } else {
      throw new Error(`unexpected ${d.kind} prompt: ${d.prompt}`);
    }
  }
  return offered;
}

describe("Rocket Barrage (sfd-077-221)", () => {
  test("cost: 4 energy + 1 mind deducted on cast, one chain item, spell ends in trash; unaffordable at 3 energy or without the mind pip; [rainbow] pays the pip", async () => {
    const game = await board().build();
    await game.p1.cast("rb");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toHaveLength(1);
    await resolve(game, [KILL_GEAR, "snax"]);
    expect(game.zoneOf("rb")).toBe("trash");
    expect((await board(3, 1).build()).p1.can("cast", "rb")).toBe(false);
    expect((await board(4, 0).build()).p1.can("cast", "rb")).toBe(false);
    const rainbow = await scenario().resources(P1, { energy: 4, power: { rainbow: 1 } }).gear(P2, PORO_SNAX, "snax").hand(P1, CARD, "rb").build();
    expect(rainbow.p1.can("cast", "rb")).toBe(true);
    await rainbow.p1.cast("rb");
    expect(rainbow.p1.energy()).toBe(0);
    expect(rainbow.p1.power()).toBe(0);
  });

  test("mode 'Deal 4 to a unit in a base': only base units (either side) are offered — never the battlefield unit; 4 is exactly lethal on a 4-Might unit", async () => {
    const game = await board().build();
    await game.p1.cast("rb");
    const [modes, targets] = await resolve(game, [DAMAGE, "four"]);
    expect(modes).toEqual(["0", "1"]);
    expect([...(targets ?? [])].sort()).toEqual(["big", "five", "four"]);
    expect(game.zoneOf("four")).toBe("trash");
    expect(game.state("five").damage).toBe(0);
    expect(game.state("front").damage).toBe(0);
  });

  test("one short: 4 damage leaves a 5-Might base unit alive with 4 damage; it is still there next turn", async () => {
    const game = await board().build();
    await game.p1.cast("rb");
    await resolve(game, [DAMAGE, "five"]);
    expect(game.zoneOf("five")).toBe("base");
    expect(game.state("five").damage).toBe(4);
    await game.advanceTurn();
    expect(game.zoneOf("five")).toBe("base");
  });

  test("the surviving unit's 4 damage is healed in the Expiration Step (317.2.b)", async () => {
    const game = await board().build();
    await game.p1.cast("rb");
    await resolve(game, [DAMAGE, "five"]);
    expect(game.state("five").damage).toBe(4);
    await game.advanceTurn();
    expect(game.state("five").damage).toBe(0);
  });

  test("mode 'Kill a gear': any gear, enemy or friendly, is offered; the chosen enemy Poro Snax dies and its owner draws nothing", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("rb");
    const [, targets] = await resolve(game, [KILL_GEAR, "snax"]);
    expect([...(targets ?? [])].sort()).toEqual(["mySnax", "snax"]);
    expect(game.zoneOf("snax")).toBe("trash");
    expect(game.zoneOf("mySnax")).toBe("base");
    expect(game.p2.hand()).toHaveLength(p2Hand);
    for (const u of ["four", "five", "big"]) {
      expect(game.state(u).damage).toBe(0);
    }
  });

  test("355.8 legality: nothing in any base and no gear → not castable; gear only → castable; base unit only → castable", async () => {
    const nothing = await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 2 }, "front").hand(P1, CARD, "rb").build();
    expect(nothing.p1.can("cast", "rb")).toBe(false);
    const gearOnly = await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).gear(P2, PORO_SNAX, "snax").hand(P1, CARD, "rb").build();
    expect(gearOnly.p1.can("cast", "rb")).toBe(true);
    const unitOnly = await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).unit(P1, "base", { might: 1 }, "own").hand(P1, CARD, "rb").build();
    expect(unitOnly.p1.can("cast", "rb")).toBe(true);
    await unitOnly.p1.cast("rb");
    await resolve(unitOnly, [DAMAGE, "own"]); // your own base unit is a legal (if painful) choice
    expect(unitOnly.zoneOf("own")).toBe("trash");
  });

  test("a mode with no legal target may not be chosen (355.3/355.8) — with only gear around, 'Deal 4' must not be offered", async () => {
    // Expected: the mode prompt lists only mode 1 (or the kill resolves as the forced sole mode).
    // Actual: both modes are offered; picking "Deal 4" makes the spell do nothing.
    const game = await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).gear(P2, PORO_SNAX, "snax").hand(P1, CARD, "rb").build();
    await game.p1.cast("rb");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    const modeKeys = d?.kind === "pick" && /mode/i.test(d.prompt) ? d.options.map((o) => o.key) : ["1"];
    expect(modeKeys).toEqual(["1"]);
    await game.settle({ policy: "first" });
    expect(game.zoneOf("snax")).toBe("trash");
  });

  test("[Repeat] cost: 8 energy + 2 mind buys the repeated cast as a single chain item; with 4 + 1 only the plain cast is legal", async () => {
    const rich = await board(8, 2).build();
    expect(rich.p1.option("cast", "rb")?.fields.find((f) => f.arg === "repeat")).toMatchObject({ max: 1, min: 0 });
    await rich.p1.cast("rb", { repeat: 1 });
    expect(rich.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(rich.chain()).toHaveLength(1);
    const poor = await board(4, 1).build();
    const r = await poor.p1.try((p) => p.cast("rb", { repeat: 1 }));
    expect(r.ok).toBe(false);
    expect(poor.zoneOf("rb")).toBe("hand");
    expect(poor.p1.energy()).toBe(4);
    const noSecondPip = await board(8, 1).build();
    expect((await noSecondPip.p1.try((p) => p.cast("rb", { repeat: 1 }))).ok).toBe(false);
  });

  test.failing("BUG: [Repeat] paid → the effect executes twice with independent choices (820.2.a): deal 4 to a base unit AND kill a gear", async () => {
    // Expected: two mode/target rounds — "four" dies to 4 damage and the enemy Snax is killed.
    // Actual: after the first mode resolves the spell finishes; the paid-for second execution never happens.
    const game = await board(8, 2).build();
    await game.p1.cast("rb", { repeat: 1 });
    await resolve(game, [DAMAGE, "four", KILL_GEAR, "snax"]);
    expect(game.zoneOf("four")).toBe("trash");
    expect(game.zoneOf("snax")).toBe("trash");
    expect(game.zoneOf("rb")).toBe("trash");
  });

  test("[Repeat] same mode twice on one target (820.2.a): 4 + 4 kills an 8-Might base unit", async () => {
    // Expected: "big" (8 Might) takes 4 twice within one resolution and dies. Actual: only 4 damage.
    const game = await board(8, 2).build();
    await game.p1.cast("rb", { repeat: 1 });
    await resolve(game, [DAMAGE, "big", DAMAGE, "big"]);
    expect(game.zoneOf("big")).toBe("trash");
  });

  test.failing("BUG: [Repeat] 'Kill a gear' twice on two different gear kills both (820.2.a)", async () => {
    const game = await board(8, 2).build();
    await game.p1.cast("rb", { repeat: 1 });
    await resolve(game, [KILL_GEAR, "snax", KILL_GEAR, "mySnax"]);
    expect(game.zoneOf("snax")).toBe("trash");
    expect(game.zoneOf("mySnax")).toBe("trash");
  });

  test("timing (standard): not castable during a showdown on your own turn, nor on the opponent's turn, nor in response to a chain item", async () => {
    const sd = await board().unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await sd.p1.move("scout", "bf1");
    expect((sd.decision() as ActionDecision).context).toBe("showdown");
    expect(sd.p1.can("cast", "rb")).toBe(false);
    const opp = await board().active(P2).build();
    expect(opp.p1.can("cast", "rb")).toBe(false);
    // Closed state on own turn: my own Snax cash-in ability is on the chain → cannot cast in response.
    const closed = await board(5, 1).resources(P1, { power: { calm: 1, mind: 1 } }).build();
    await closed.p1.activate("mySnax", 1);
    expect(closed.chain()).toHaveLength(1);
    expect(closed.p1.can("cast", "rb")).toBe(false);
  });

  test("the opponent gets priority before it resolves; the Snax owner cannot cash the targeted gear in at that point (no Reaction) and loses it", async () => {
    const game = await board().resources(P2, { energy: 1, power: { calm: 1 } }).build();
    await game.p1.cast("rb");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p2.can("activate", "snax")).toBe(false);
    await resolve(game, [KILL_GEAR, "snax"]);
    expect(game.zoneOf("snax")).toBe("trash");
  });

  test.failing("BUG: Deflect (809) — with the enemy Deflect unit as the only possible choice and no spare power, the Barrage cannot be cast at it / cannot hurt it", async () => {
    // Expected: P1 (4 energy + exactly the [mind] pip) cannot pay the extra [rainbow] to choose P2's
    // Pouty Poro, the only object either mode could pick → the cast is illegal (or the poro is untouchable).
    // Actual: the mode/target are picked at resolution with no Deflect surcharge and the poro dies.
    const broke = await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).unit(P2, "base", DEFLECTOR, "poro").hand(P1, CARD, "rb").build();
    const castable = broke.p1.can("cast", "rb");
    if (castable) {
      await broke.p1.cast("rb");
      await broke.p1.try(() => resolve(broke, [DAMAGE, "poro"]));
    }
    expect(broke.zoneOf("poro")).toBe("base");
    expect(castable).toBe(false);
  });

  test("Deflect paid: with a spare power in the pool the opposing caster hits the 2-Might Deflect unit for 4 and it dies", async () => {
    const rich = await scenario().resources(P1, { energy: 4, power: { mind: 1, rainbow: 1 } }).unit(P2, "base", DEFLECTOR, "poro").hand(P1, CARD, "rb").build();
    await rich.p1.cast("rb");
    await resolve(rich, [DAMAGE, "poro"]);
    expect(rich.zoneOf("poro")).toBe("trash");
  });

  test.failing("BUG: Deflect surcharge is actually collected — after choosing the poro the spare [rainbow] is spent (809)", async () => {
    // Expected: energy 0, power 0 after the cast + choice. Actual: the rainbow pip is never charged.
    const rich = await scenario().resources(P1, { energy: 4, power: { mind: 1, rainbow: 1 } }).unit(P2, "base", DEFLECTOR, "poro").hand(P1, CARD, "rb").build();
    await rich.p1.cast("rb");
    await resolve(rich, [DAMAGE, "poro"]);
    expect(rich.zoneOf("poro")).toBe("trash");
    expect(rich.p1.resources()).toEqual({ energy: 0, power: { mind: 0, rainbow: 0 } });
  });

  test("parsed abilities match the printed text: one spell ability, choice of [damage 4 to base unit | kill gear], Repeat cost [4][mind]; card timing standard", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 4, powerCost: ["mind"], timing: "standard" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: {
        options: [
          { effect: { amount: 4, target: { location: "base", type: "unit" }, type: "damage" } },
          { effect: { target: { type: "gear" }, type: "kill" } },
        ],
        type: "choice",
      },
      repeat: { energy: 4, power: ["mind"] },
      type: "spell",
    });
  });
});
