/**
 * Strike Down — sfd-107-221 · Spell · Body · 3 energy + [body] · (no [Action]/[Reaction] → standard timing)
 *
 *   Choose an equipped friendly unit. It deals damage equal to its Might to an enemy unit.
 *   Then detach an Equipment from it.
 *
 * Head-judge notes (trickiest situations for this card):
 *  - Two chosen objects at play time: an EQUIPPED FRIENDLY unit and an ENEMY unit (any location).
 *    No equipped friendly unit (or only an equipped ENEMY unit) → the spell has no legal target and
 *    cannot be played at all. A bare friendly unit is not a legal first choice.
 *  - "damage equal to its Might" is read on resolution (359.3.f.2) and INCLUDES the Equipment's
 *    Might bonus, because the detach only happens afterwards ("Then").
 *  - 359.3.e.12 (the CR's own Strike Down example): if the chosen unit stops being equipped while
 *    the spell is on the chain (Angle Shot detaches its only Equipment), it is no longer a legal
 *    choice → Might reads null → no damage, nothing to detach.
 *  - "detach AN Equipment": exactly one, even if the unit wears two; the other stays attached.
 *    The detached gear stays on the board (435.4) and, if that leaves it at a battlefield, it is
 *    recalled to base in the next Cleanup (435.4.a / 323.7). It is not killed or returned to hand.
 *  - The unit deals the damage (a friendly source), the enemy unit need not be "here"; exactly
 *    lethal kills, one short does not.
 *  - Standard timing: only on your turn in an open state — not in a showdown, not as a reaction.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-107-221";
const DORANS_BLADE = "sfd-095-221"; // Equipment · Body · Equip [body] · +2 Might
const HEXDRINKER = "sfd-102-221"; // Equipment · Body · Equip [body] · +1 Might
const ANGLE_SHOT = "sfd-011-221"; // Reaction spell: attach/detach an Equipment (2 energy)

/** P1: Knight (3 + Doran's Blade = 5 might) and a bare unit; P2: Foe with `foeMight` in its base. */
function board(foeMight = 6) {
  return scenario()
    .resources(P1, { energy: 3, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", { might: 3, name: "Knight" }, "knight", { equippedWith: ["blade"] })
    .gear(P1, DORANS_BLADE, "blade", { attachedTo: "knight" })
    .unit(P1, "base", { might: 2, name: "Bare" }, "bare")
    .unit(P2, "base", { might: foeMight, name: "Foe" }, "foe")
    .hand(P1, CARD, "sd");
}

/**
 * Cast Strike Down choosing [friendly equipped unit, enemy unit] (card-text order). Today's engine
 * exposes no targets at all, so fall back to a bare cast — the assertions then judge the outcome.
 */
async function castStrikeDown(game: Game, friendly: string, enemy: string): Promise<void> {
  const wantsTargets = game.p1.option("cast", "sd")?.fields.some((f) => f.arg === "targets") ?? false;
  await game.p1.cast("sd", wantsTargets ? { targets: [friendly, enemy] } : {});
}

describe("Strike Down (sfd-107-221)", () => {
  test.failing("BUG: parsed abilities should carry BOTH the might-based damage step and the detach step; only `detach` was produced", async () => {
    // Expected: one spell ability whose effect is a sequence [damage(amount = chosen unit's Might, to enemy unit), detach].
    // Actual: `{ effect: { type: "detach" } }` — the whole first sentence pair is missing.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 3, powerCost: ["body"], timing: "standard" });
    expect(def?.abilities).toHaveLength(1);
    const text = JSON.stringify(def?.abilities?.[0]);
    expect(text).toContain('"detach"');
    expect(text).toContain('"damage"');
    expect(text).toMatch(/might/i);
    expect(text).toMatch(/enemy/i);
  });

  test("cost gate: legal with 3 energy + 1 body; not legal with 2 energy or without the body power", async () => {
    expect((await board().build()).p1.can("cast", "sd")).toBe(true);
    expect((await board().resources(P1, { energy: 2, power: { body: 1 } }).build()).p1.can("cast", "sd")).toBe(false);
    expect((await board().resources(P1, { energy: 3, power: { body: 0 } }).build()).p1.can("cast", "sd")).toBe(false);
  });

  test("standard timing: not castable on the opponent's turn, nor while its controller holds Focus in a showdown", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "sd")).toBe(false);
    const game = await board().battlefield("theirs", { controller: P2 }).build();
    await game.p1.move("bare", "theirs");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "sd")).toBe(false);
  });

  test.failing("BUG: needs an equipped FRIENDLY unit — with only a bare friendly unit and an equipped ENEMY unit the spell is not playable", async () => {
    // Expected: no legal first choice → cannot be cast (spells need legal targets to be played).
    // Actual: the engine offers the cast with no targets at all.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .unit(P1, "base", { might: 2, name: "Bare" }, "bare")
      .unit(P2, "base", { might: 3, name: "Their Knight" }, "theirKnight", { equippedWith: ["theirBlade"] })
      .gear(P2, DORANS_BLADE, "theirBlade", { attachedTo: "theirKnight" })
      .hand(P1, CARD, "sd")
      .build();
    expect(game.p1.can("cast", "sd")).toBe(false);
  });

  test.failing("BUG: main line — pays 3+[body]; Knight (3+2) deals 5 to the enemy unit, THEN Doran's Blade is detached and stays in base", async () => {
    // Expected: foe takes 5 (survives at 6 might), blade unattached in P1's base, knight back to 3 might.
    // Actual: no targets are accepted and no damage step exists.
    const game = await board(6).build();
    await castStrikeDown(game, "knight", "foe");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sd", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.state("foe").damage).toBe(5);
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.state("blade").attachedTo).toBeUndefined();
    expect(game.state("knight").attachments).toEqual([]);
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.state("blade").owner).toBe(P1);
    expect(game.state("knight").might).toBe(3);
    expect(game.state("knight").damage).toBe(0); // the enemy does not hit back — this is not combat
    expect(game.zoneOf("sd")).toBe("trash");
  });

  test.failing("BUG: the Equipment bonus counts — exactly lethal: a 5-might enemy dies to the 3+2 Knight", async () => {
    const game = await board(5).build();
    await castStrikeDown(game, "knight", "foe");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.state("blade").attachedTo).toBeUndefined();
  });

  test.failing("BUG: one short is not lethal — a 6-might enemy survives with 5 damage marked", async () => {
    const game = await board(6).build();
    await castStrikeDown(game, "knight", "foe");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.state("foe").damage).toBe(5);
  });

  test.failing("BUG: the enemy unit may be anywhere — an enemy at a battlefield is a legal second choice and takes the damage there", async () => {
    const game = await board()
      .battlefield("theirs", { controller: P2 })
      .unit(P2, "theirs", { might: 4, name: "Sentry" }, "sentry")
      .build();
    await castStrikeDown(game, "knight", "sentry");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.state("foe").damage).toBe(0);
  });

  test.failing("BUG: 'detach AN Equipment' — with two attached, 6 damage is dealt (3+2+1) and exactly one chosen Equipment comes off", async () => {
    // Expected: P1 picks which Equipment to detach (we pick Hexdrinker); Doran's Blade stays on → knight 5 might.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .unit(P1, "base", { might: 3, name: "Knight" }, "knight", { equippedWith: ["blade", "hex"] })
      .gear(P1, DORANS_BLADE, "blade", { attachedTo: "knight" })
      .gear(P1, HEXDRINKER, "hex", { attachedTo: "knight" })
      .unit(P2, "base", { might: 8, name: "Foe" }, "foe")
      .hand(P1, CARD, "sd")
      .script(P1, ["hex"])
      .build();
    expect(game.state("knight").might).toBe(6);
    await castStrikeDown(game, "knight", "foe");
    await game.settle();
    expect(game.state("foe").damage).toBe(6);
    expect(game.state("hex").attachedTo).toBeUndefined();
    expect(game.state("blade").attachedTo).toBe("knight");
    expect(game.state("knight").attachments).toEqual(["blade"]);
    expect(game.state("knight").might).toBe(5);
  });

  test.failing("BUG: an Equipment detached from a unit AT A BATTLEFIELD is recalled to its controller's base in the next Cleanup (435.4.a)", async () => {
    // Expected: blade ends unattached in P1's base. Actual (today's detach): it is left in the battlefield zone.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Knight" }, "knight", { equippedWith: ["blade"] })
      .gear(P1, DORANS_BLADE, "blade", { attachedTo: "knight" })
      .unit(P2, "base", { might: 8, name: "Foe" }, "foe")
      .hand(P1, CARD, "sd")
      .build();
    await castStrikeDown(game, "knight", "foe");
    await game.settle();
    expect(game.state("blade").attachedTo).toBeUndefined();
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.locationOf("knight")).toBe("bf1");
  });

  test("359.3.e.12 — if Angle Shot detaches the Knight's only Equipment in response, the Knight is no longer a legal choice: no damage is dealt", async () => {
    // P2 reacts on P1's chain with Angle Shot (detach mode) on Knight + Blade. Strike Down then resolves against an
    // unequipped unit: Might reads null, the damage instruction is ignored, and there is nothing left to detach.
    // (Passes trivially while the damage step is unimplemented; guards the mistarget rule once it is.)
    const game = await board(4).resources(P2, { energy: 2 }).hand(P2, ANGLE_SHOT, "shot").build();
    await castStrikeDown(game, "knight", "foe");
    await game.p1.passPriority();
    await game.p2.cast("shot", { targets: ["knight", "blade"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sd", "shot"]);
    await game.settle();
    expect(game.state("blade").attachedTo).toBeUndefined();
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.state("foe").damage).toBe(0);
    expect(game.state("knight").might).toBe(3);
    expect(game.zoneOf("sd")).toBe("trash");
    expect(game.zoneOf("shot")).toBe("trash");
  });
});
