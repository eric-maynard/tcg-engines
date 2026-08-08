/**
 * Rampage — ven-083-166 · Spell · Body · 3 energy (no power)
 *
 *   As you play this, you may pay [body] as an additional cost.
 *   Choose a friendly unit and an enemy unit. If you paid the additional cost, give the friendly
 *   unit +2 [Might] this turn. They deal damage equal to their Mights to each other.
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. The optional cost is decided and paid WHILE PLAYING (355.1.a / 356.2.b): declining charges
 *     3 energy only and leaves the body power in the pool; paying charges 3 + [body]. No body
 *     power → the "pay" variant must not exist (and forcing it must never grant the +2).
 *  2. Ordering inside the effect: the +2 [Might] lands BEFORE the mutual damage, so it changes the
 *     lethal math both ways — a 3 into a 5: unpaid → only the friendly dies; paid → 5 vs 5, both die.
 *  3. "+2 this turn" outlives the spell (the survivor reads 5 for the rest of the turn) and expires
 *     at end of turn together with the marked damage (healed in the Ending Step).
 *  4. Roles are fixed: first choice FRIENDLY, second ENEMY (unlike Clash of Giants). Two friendlies,
 *     two enemies, or the pair reversed are illegal; with no enemy (or no friendly) unit on the
 *     board the spell cannot be played at all. Location is unrestricted (base ↔ battlefield is fine).
 *  5. Linked "each other" (359.3.e.5 / 359.3.e.12): if the friendly unit is bounced (Gust) in
 *     response, its Might is null — the enemy takes nothing and nobody is substituted.
 *  6. The damage is dealt BY THE UNITS and is not combat damage (417.6.b.3): a stunned friendly
 *     unit still deals its full Might. No [Action]/[Reaction]: own turn, open state only.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-083-166";
const GUST = "ogn-169-298"; // [Reaction] 1 energy: return a unit at a battlefield with ≤3 Might to its owner's hand

function board(energy = 3, power: Record<string, number> = { body: 1 }) {
  return scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf2", { might: 3, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 1, name: "Squire" }, "squire")
    .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
    .unit(P2, "base", { might: 2, name: "Minnow" }, "minnow")
    .hand(P1, CARD, "rampage");
}

describe("Rampage (ven-083-166)", () => {
  test("registry payload: optional [body] additional-cost static + a friendly→enemy fight whose +2 (turn) rider is gated on paid-additional-cost; 3 energy, no power, no Action/Reaction timing", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "body", energyCost: 3, name: "Rampage" });
    expect(def?.powerCost).toBeUndefined();
    expect(def?.timing).not.toBe("action");
    expect(def?.timing).not.toBe("reaction");
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { additionalCost: { power: ["body"] }, optional: true, type: "additional-cost-option" },
      type: "static",
    });
    expect(def?.abilities?.[1]).toMatchObject({
      effect: {
        attacker: { controller: "friendly", type: "unit" },
        defender: { controller: "enemy", type: "unit" },
        onAttacker: { condition: { type: "paid-additional-cost" }, then: { amount: 2, duration: "turn", type: "modify-might" }, type: "conditional" },
        type: "fight",
      },
      type: "spell",
    });
  });

  test("unpaid: 3 energy only (body power untouched); Ally 3 into Brute 5 across locations — Ally dies, Brute keeps 3 damage, no +2 anywhere; spell to trash", async () => {
    const game = await board().build();
    expect(game.p1.option("cast", "rampage")?.fields.some((f) => f.arg === "payOptional")).toBe(true);
    await game.p1.cast("rampage", { targets: ["ally", "brute"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1 } });
    expect(game.zoneOf("rampage")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.state("brute").damage).toBe(3);
    expect(game.state("brute").might).toBe(5);
    expect(game.zoneOf("rampage")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("paid [body]: 3 energy + 1 body deducted; the +2 lands before the exchange — Ally (3+2=5) and Brute (5) kill each other", async () => {
    const game = await board().build();
    await game.p1.cast("rampage", { payOptional: true, targets: ["ally", "brute"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("rampage")).toBe("trash");
  });

  test("paid, friendly survives: Ally (5) into Minnow (2) — Minnow dies, Ally takes 2 and reads 5 Might for the rest of the turn; after the turn passes it is 3 again and healed", async () => {
    const game = await board().build();
    await game.p1.cast("rampage", { payOptional: true, targets: ["ally", "minnow"] });
    await game.settle();
    expect(game.zoneOf("minnow")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf2");
    expect(game.state("ally").might).toBe(5);
    expect(game.state("ally").damage).toBe(2);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(3);
    expect(game.state("ally").damage).toBe(0);
  });

  test("unpaid, friendly survives: Ally (3) into Minnow (2) — Minnow dies, Ally takes 2 and stays at 3 Might (no rider without the cost)", async () => {
    const game = await board().build();
    await game.p1.cast("rampage", { targets: ["ally", "minnow"] });
    await game.settle();
    expect(game.zoneOf("minnow")).toBe("trash");
    expect(game.state("ally").might).toBe(3);
    expect(game.state("ally").damage).toBe(2);
  });

  test("cost edge cases: 2 energy → not castable; no body power → castable but no 'pay' variant, and forcing payOptional never yields the +2", async () => {
    expect((await board(2).build()).p1.can("cast", "rampage")).toBe(false);
    const noBody = await board(3, { fury: 1 }).build();
    expect(noBody.p1.can("cast", "rampage")).toBe(true);
    const payField = noBody.p1.option("cast", "rampage")?.fields.find((f) => f.arg === "payOptional");
    expect(payField?.options ?? [false]).not.toContain(true);
    const forced = await noBody.p1.try((p) => p.cast("rampage", { payOptional: true, targets: ["ally", "minnow"] }));
    if (!forced.ok) {
      await noBody.p1.cast("rampage", { targets: ["ally", "minnow"] });
    }
    await noBody.settle();
    expect(noBody.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    expect(noBody.zoneOf("minnow")).toBe("trash");
    expect(noBody.state("ally").might).toBe(3);
  });

  test("roles are fixed friendly→enemy: the offered pairs are exactly {friendly}×{enemy} (friendly first); two friendlies, two enemies or one unit twice are illegal and leave the spell in hand", async () => {
    const game = await board().build();
    const pairs = game.p1.option("cast", "rampage")?.fields.find((f) => f.arg === "targets")?.options as string[][];
    expect([...pairs].map((p) => p.join(">")).sort()).toEqual(["ally>brute", "ally>minnow", "squire>brute", "squire>minnow"]);
    for (const pair of [["ally", "squire"], ["brute", "minnow"], ["ally", "ally"]] as const) {
      const r = await game.p1.try((p) => p.cast("rampage", { targets: [...pair] }));
      expect(r.ok).toBe(false);
    }
    expect(game.zoneOf("rampage")).toBe("hand");
    expect(game.p1.energy()).toBe(3);
  });

  test("needs BOTH a friendly and an enemy unit on the board: with only friendlies, or only enemies, it is not castable", async () => {
    const onlyMine = await scenario().resources(P1, { energy: 3, power: { body: 1 } }).unit(P1, "base", { might: 3 }, "a").unit(P1, "base", { might: 2 }, "b").hand(P1, CARD, "rampage").build();
    expect(onlyMine.p1.can("cast", "rampage")).toBe(false);
    const onlyTheirs = await scenario().resources(P1, { energy: 3, power: { body: 1 } }).unit(P2, "base", { might: 3 }, "a").unit(P2, "base", { might: 2 }, "b").hand(P1, CARD, "rampage").build();
    expect(onlyTheirs.p1.can("cast", "rampage")).toBe(false);
  });

  test("timing: no [Action]/[Reaction] — not castable with Focus in a showdown, nor on the opponent's turn", async () => {
    const game = await board().build();
    await game.p1.move("squire", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "rampage")).toBe(false);
    const opp = await board().active(P2).build();
    expect(opp.p1.can("cast", "rampage")).toBe(false);
  });

  test("not combat damage (417.6.b.3 / 423.1.b): a STUNNED friendly 3 still deals its 3 to Minnow and kills it", async () => {
    const game = await board().unit(P1, "base", { might: 3, name: "Dazed" }, "dazed", { stunned: true }).build();
    expect(game.state("dazed").isStunned).toBe(true);
    await game.p1.cast("rampage", { targets: ["dazed", "minnow"] });
    await game.settle();
    expect(game.zoneOf("minnow")).toBe("trash");
    expect(game.state("dazed").damage).toBe(2);
  });

  test("opponent gets priority: Rampage waits on the chain as a spell item controlled by P1 until both pass", async () => {
    const game = await board().build();
    await game.p1.cast("rampage", { targets: ["ally", "brute"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rampage", controller: P1, triggered: false })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.state("brute").damage).toBe(0); // nothing has resolved yet
    await game.p2.passPriority();
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.state("brute").damage).toBe(3);
  });

  test("linked 'each other' (359.3.e.5/.12): P2 Gusts the paid-for Ally in response — Ally is in hand, Brute takes NO damage, and no bystander (Squire) is substituted", async () => {
    const game = await board().resources(P2, { energy: 1 }).hand(P2, GUST, "gust").build();
    await game.p1.cast("rampage", { payOptional: true, targets: ["ally", "brute"] });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("gust", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.zoneOf("rampage")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.state("brute").damage).toBe(0);
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.state("squire").damage).toBe(0);
    expect(game.state("squire").might).toBe(1); // the +2 rider did not hop onto another friendly unit
  });
});
