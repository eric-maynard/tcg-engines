/**
 * Danger Zone — sfd-182-221 · Spell · Fury/Mind · 1 energy + 1 power (hybrid fury|mind pip) · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   [Repeat] [1][rainbow] (You may pay the additional cost to repeat this spell's effect.)
 *   Give your Mechs +1 [Might] this turn.
 *
 * Rules: 813 (Reaction timing); 355.10.d ("your Mechs" is selected programmatically — nothing is
 * targeted, so the spell is playable with zero Mechs and simply does nothing, 359.3.e.10); 105.2 /
 * 187 (a Mech unit TOKEN is a Mech; a unit is a Mech only if it carries the MECH tag — Rumble is not);
 * "your" = units you control, wherever they are (base or any battlefield); the +1 is applied once on
 * RESOLUTION to the Mechs that exist then (it is not a continuous static — a Mech played afterwards
 * gets nothing); 317.2 (expires end of turn); 820 (Repeat [1][rainbow]: 2 energy + 2 power total, one
 * chain item, +2 each); 135.2.e.5.a / .6.c (the power pip is payable with fury OR mind power).
 *
 * Head-judge corner cases covered below:
 *   1. Scope: friendly Mech-tagged units (Bubble Bot, Mega-Mech) AND a friendly Mech token, at base and
 *      at a battlefield — yes; friendly non-Mech and ENEMY Mechs — no.
 *   2. Zero Mechs: castable, resolves, nothing changes, spell in trash.
 *   3. One-shot, not static: a Bubble Bot played after Danger Zone resolved reads 3, not 4.
 *   4. Repeat: +2 each for 2 energy + 2 power; with 1 power only the plain cast is legal.
 *   5. Cost is energy AND power: 1 energy alone or 1 power alone → not castable; fury pays, mind pays.
 *   6. Defender's Reaction in the opponent's combat: two 3-Might Mech defenders (+1 each = 8) beat a
 *      7-Might attacker they would otherwise lose to; the bonus is gone next turn.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-182-221";
const BUBBLE_BOT = "sfd-062-221"; // 3-Might Mind unit, MECH
const MEGA_MECH = "ogn-088-298"; // 8-Might Mind unit, MECH
const RUMBLE = "sfd-089-221"; // Rumble, Scrapper — tagged Rumble (NOT a Mech); static: your Mechs +1 (including me)

function board(res: { energy?: number; power?: Record<string, number> } = { energy: 1, power: { fury: 1 } }) {
  return scenario()
    .resources(P1, res)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", BUBBLE_BOT, "bub")
    .unit(P1, "bf1", MEGA_MECH, "mega")
    .unit(P1, "base", { might: 2, name: "Plain Recruit" }, "plain")
    .unit(P2, "base", BUBBLE_BOT, "theirBub")
    .hand(P1, CARD, "dz");
}

const mechToken = (game: Game, owner = P1) => game.findAll({ name: "Mech", owner }).find((id) => game.state(id).isToken) as string;

describe("Danger Zone (sfd-182-221)", () => {
  test("costs 1 energy + 1 power (fury pays the hybrid pip); no targets asked; one chain item; → trash", async () => {
    const game = await board().build();
    expect(game.p1.option("cast", "dz")?.fields.some((f) => f.arg === "targets")).toBe(false); // 355.10.d — nothing is chosen
    await game.p1.cast("dz");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dz", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("dz")).toBe("trash");
  });

  // BUG — expected: every friendly Mech (tagged unit or token, any location) +1. Actual: the parsed
  // target filter is `tag: "Mechs"`, which no card/token carries, so nothing changes.
  test("friendly Mechs (units + token, base + battlefield) should get +1 — parsed tag \"Mechs\" matches nothing, spell is a no-op", async () => {
    const game = await board().build();
    await game.p1.do("addToken", { playerId: P1, tokenName: "Mech", zoneId: "base" });
    await game.p2.do("addToken", { playerId: P2, tokenName: "Mech", zoneId: "base" });
    const mine = mechToken(game, P1);
    const theirs = mechToken(game, P2);
    expect(game.state(mine).might).toBe(3);
    await game.p1.cast("dz");
    await game.settle();
    expect(game.state("bub")).toMatchObject({ baseMight: 3, isBuffed: false, might: 4 });
    expect(game.state("mega").might).toBe(9);
    expect(game.state(mine).might).toBe(4);
    expect(game.state("plain").might).toBe(2);
    expect(game.state("theirBub").might).toBe(3);
    expect(game.state(theirs).might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  // BUG — same root cause (no +1 ever lands, so the expiry cannot be observed).
  test("+1 this turn then expires at end of turn (317.2) — never applied (tag \"Mechs\" mis-parse)", async () => {
    const game = await board().build();
    await game.p1.cast("dz");
    await game.settle();
    expect(game.state("bub").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("bub").might).toBe(3);
    expect(game.state("mega").might).toBe(8);
    expect(game.state("bub").mightModifier).toBe(0);
  });

  test("zero Mechs: still castable (nothing is targeted), resolves doing nothing, costs are paid and it goes to the trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { mind: 1 } })
      .unit(P1, "base", { might: 2, name: "Plain" }, "plain")
      .unit(P2, "base", BUBBLE_BOT, "theirBub")
      .hand(P1, CARD, "dz")
      .build();
    expect(game.p1.can("cast", "dz")).toBe(true);
    await game.p1.cast("dz");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("dz")).toBe("trash");
    expect(game.state("plain").might).toBe(2);
    expect(game.state("theirBub").might).toBe(3);
  });

  // BUG — same root cause; once fixed this also guards the one-shot (non-static) semantics.
  test("one-shot on resolution (a Mech played afterwards stays 3) — the +1 never lands at all (tag \"Mechs\" mis-parse)", async () => {
    const game = await board({ energy: 4, power: { fury: 1 } }).hand(P1, BUBBLE_BOT, "lateBub").build();
    await game.p1.cast("dz");
    await game.settle();
    expect(game.state("bub").might).toBe(4);
    await game.p1.play("lateBub", { to: "base" });
    await game.settle({ policy: "first" }); // Bubble Bot's "ready another friendly Mech" prompt, if any
    expect(game.zoneOf("lateBub")).toBe("base");
    expect(game.state("lateBub").might).toBe(3);
    expect(game.state("bub").might).toBe(4);
  });

  test("cost negatives: 1 energy with no power, or power with 0 energy → not castable; MIND power pays the pip just like fury", async () => {
    expect((await board({ energy: 3 }).build()).p1.can("cast", "dz")).toBe(false);
    expect((await board({ energy: 0, power: { fury: 2 } }).build()).p1.can("cast", "dz")).toBe(false);
    const mind = await board({ energy: 1, power: { mind: 1 } }).build();
    expect(mind.p1.can("cast", "dz")).toBe(true);
    await mind.p1.cast("dz");
    expect(mind.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });

  // BUG — costs are charged correctly (2 energy + 2 power, one chain item) but neither execution
  // modifies anything because of the `tag: "Mechs"` filter.
  test("Repeat should give each friendly Mech +2 (Rumble excluded) — both executions are no-ops (tag \"Mechs\" mis-parse)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1, mind: 1 } })
      .unit(P1, "base", BUBBLE_BOT, "bub")
      .unit(P1, "base", RUMBLE, "rumble")
      .hand(P1, CARD, "dz")
      .build();
    expect(game.state("bub").might).toBe(4); // 3 + Rumble's static
    const rumbleBefore = game.state("rumble").might;
    expect(game.p1.option("cast", "dz")?.fields.find((f) => f.arg === "repeat")?.max).toBe(1);
    await game.p1.cast("dz", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.state("bub").might).toBe(6); // 3 + 1 static + 2 Danger Zone×2
    expect(game.state("rumble").might).toBe(rumbleBefore); // tagged Rumble, not Mech — Danger Zone skips him
    await game.advanceTurn();
    expect(game.state("bub").might).toBe(4);
  });

  test("[Repeat] must be affordable: with 2 energy but a single power the repeat variant is refused (nothing spent) while the plain cast is fine; repeat:2 never legal", async () => {
    const game = await board({ energy: 2, power: { fury: 1 } }).build();
    const r = await game.p1.try((p) => p.cast("dz", { repeat: 1 }));
    expect(r.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    await game.p1.cast("dz");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } });
    const rich = await board({ energy: 9, power: { fury: 5 } }).build();
    expect((await rich.p1.try((p) => p.cast("dz", { repeat: 2 }))).ok).toBe(false);
  });

  // BUG — the Reaction is castable at the right time and paid for, but the defenders stay 3+3 and
  // lose exactly as in the no-spell baseline.
  test("defender's Reaction should turn 3+3 Mechs into 4+4 and kill a 7-Might attacker — no +1 applied (tag \"Mechs\" mis-parse)", async () => {
    const mk = () =>
      scenario()
        .active(P2)
        .resources(P1, { energy: 1, power: { mind: 1 } })
        .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", BUBBLE_BOT, "botA")
        .unit(P1, "bf1", BUBBLE_BOT, "botB")
        .unit(P2, "base", { might: 7, name: "Bruiser" }, "bruiser")
        .hand(P1, CARD, "dz");
    const plain = await mk().build();
    await plain.p2.move("bruiser", "bf1");
    await plain.settle();
    expect(plain.zoneOf("botA")).toBe("trash");
    expect(plain.zoneOf("botB")).toBe("trash"); // 7 covers 3 + 3
    expect(plain.locationOf("bruiser")).toBe("bf1"); // 6 < 7
    expect(plain.gameState.battlefields.bf1?.controller).toBe(P2);

    const game = await mk().build();
    expect(game.p1.can("cast", "dz")).toBe(false); // P2's Neutral Open state
    await game.p2.move("bruiser", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "dz")).toBe(true);
    await game.p1.cast("dz");
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash"); // 4 + 4 = 8 ≥ 7
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    const survivors = ["botA", "botB"].filter((u) => game.zoneOf(u) === "battlefield-bf1");
    expect(survivors).toHaveLength(1); // 7 damage: 4 lethal on one bot, 3 < 4 on the other
    await game.advanceTurn();
    expect(game.state(survivors[0] as string).might).toBe(3);
  });

  // BUG — everything else in the payload is right (timing, cost, repeat, friendly/all/modify-might);
  // the filter came out as `{ tag: "Mechs" }` instead of the `{ tag: "Mech" }` every other Mech card uses.
  test("parsed target filter should be { tag: \"Mech\" } like Rumble/Forecaster — parser emitted \"Mechs\"", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 1, name: "Danger Zone", timing: "reaction" });
    expect([...(def?.domain as string[])].sort()).toEqual(["fury", "mind"]);
    expect(def?.powerCost).toEqual(["rainbow"]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: {
        amount: 1,
        duration: "turn",
        target: { controller: "friendly", quantity: "all", type: "unit" },
        type: "modify-might",
      },
      repeat: { energy: 1, power: ["rainbow"] },
      timing: "reaction",
      type: "spell",
    });
    // The tag every other Mech-matters card uses (Rumble, Forecaster, Breakneck Mech) is "Mech".
    const filter = (def?.abilities?.[0] as { effect: { target: { filter?: { tag?: unknown } } } }).effect.target.filter;
    expect(filter).toEqual({ tag: "Mech" });
  });
});
