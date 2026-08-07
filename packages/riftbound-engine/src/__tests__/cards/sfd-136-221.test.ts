/**
 * Hard Bargain — sfd-136-221 · Spell · Chaos · 2 energy (no power) · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   [Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)
 *   Counter a spell unless its controller pays [2].
 *
 * Rules: 813 (Reaction: playable in Closed states / onto a chain on any player's turn); 355.8 +
 * 355.9.a.2 ("a spell" = a spell on the chain — none there → not playable; abilities are not
 * spells); 355.9.c (cannot target itself); 158.1 / 355.17 (the "unless … pays [2]" ransom is a
 * choice its CONTROLLER makes on resolution — a payment, not a cost of Hard Bargain); 425.1.a (a
 * countered spell does nothing and is put in the trash); 820 (Repeat [2]: optional additional cost
 * paid while playing, 4 energy total, ONE chain item, instructions run twice; 820.2.a each
 * execution may pick a different spell).
 *
 * Head-judge corner cases covered below:
 *   1. The ransom prompt belongs to the TARGET's controller (P2), not the caster; paying [2] keeps
 *      the spell (it then resolves normally), declining counters it. Both outcomes leave Hard
 *      Bargain in the trash.
 *   2. A controller who cannot afford [2] gets no choice at all — the counter simply lands.
 *   3. Exactly [2] left: paying drains the pool to 0 and the spell survives (one-short vs exact).
 *   4. Repeat on the SAME spell = "counter it unless they pay 2" twice: a controller with 4 must
 *      pay twice (4 total) to keep it; with only 2 they pay once and the second execution counters.
 *   5. Repeat across TWO different enemy spells on one chain: each gets its own ransom prompt.
 *   6. Negative space: empty chain → unplayable even on your own turn; a triggered ability on the
 *      chain is not "a spell"; 1 energy → unaffordable; repeat needs 4.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-136-221";
const SHIELDBEARER = "ogn-051-298"; // unit, 3: "When you play me, stun a unit." (a triggered ABILITY on the chain)

/** A plain [Action] bolt: `energyCost` energy, "Deal 3 to a unit." */
function bolt(name: string, energyCost = 1) {
  return {
    abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
    cardType: "spell",
    domain: "fury",
    energyCost,
    name,
    timing: "action",
  };
}
const REACTION_BOLT = { ...bolt("Quick Bolt"), abilities: [{ ...bolt("x").abilities[0], timing: "reaction" }], timing: "reaction" };

/** P2's turn. P2 (with `p2Energy` AFTER paying 1 for the bolt) bolts P1's 3-might unit and passes; P1 holds Hard Bargain with `p1Energy`. */
async function facingBolt(p2EnergyAfter: number, p1Energy = 2): Promise<Game> {
  const game = await scenario()
    .active(P2)
    .resources(P2, { energy: p2EnergyAfter + 1 })
    .resources(P1, { energy: p1Energy })
    .unit(P1, "base", { might: 3, name: "Victim" }, "victim")
    .hand(P2, bolt("Bolt"), "bolt")
    .hand(P1, CARD, "hb")
    .build();
  await game.p2.cast("bolt", { targets: "victim" });
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
  return game;
}

/** Pass priority around until the chain item on top resolves into a prompt (or the chain empties). */
async function passUntilPrompt(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Hard Bargain (sfd-136-221)", () => {
  test("cost + Reaction timing: on the opponent's turn, onto their chain, for exactly 2 energy; one non-triggered chain item on top", async () => {
    const game = await facingBolt(2);
    expect(game.p1.can("cast", "hb")).toBe(true);
    await game.p1.cast("hb", { targets: "bolt" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt", "hb"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "hb", controller: P1, triggered: false });
  });

  test("on resolution the targeted spell's CONTROLLER (P2) — not the caster — is asked whether to pay [2]", async () => {
    const game = await facingBolt(2);
    await game.p1.cast("hb", { targets: "bolt" });
    await passUntilPrompt(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(d?.kind === "yes-no" && d.canAccept).toBe(true);
    expect(d?.prompt ?? "").toMatch(/\[2\]/);
    // Nothing has been charged or countered yet while the question is open.
    expect(game.p2.energy()).toBe(2);
    expect(game.zoneOf("bolt")).toBe("chain");
  });

  test("controller PAYS [2]: their pool drops by exactly 2, the spell is NOT countered and resolves (Victim takes 3 and dies); Hard Bargain → trash", async () => {
    const game = await facingBolt(2);
    await game.p1.cast("hb", { targets: "bolt" });
    await passUntilPrompt(game);
    await game.p2.yes();
    expect(game.p2.energy()).toBe(0); // exactly-2 case: drained to zero, still allowed
    expect(game.zoneOf("hb")).toBe("trash");
    await game.settle(); // bolt is still on the chain → both pass → it resolves
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  test("controller DECLINES: the spell is countered — no damage, it goes to the trash immediately (425.1.a), P2 keeps their 2 energy", async () => {
    const game = await facingBolt(2);
    await game.p1.cast("hb", { targets: "bolt" });
    await passUntilPrompt(game);
    await game.p2.no();
    expect(game.p2.energy()).toBe(2);
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim").damage).toBe(0);
    expect(game.zoneOf("hb")).toBe("trash");
  });

  test("controller CANNOT afford [2] (1 energy left): no prompt at all — the counter simply lands", async () => {
    const game = await facingBolt(1);
    await game.p1.cast("hb", { targets: "bolt" });
    await game.settle(); // must not stop on any yes/no
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.state("victim").damage).toBe(0);
    expect(game.p2.energy()).toBe(1);
    expect(game.zoneOf("hb")).toBe("trash");
  });

  // BUG — expected (820.1.d.1): with Repeat paid the instruction runs twice, so the controller faces
  // two separate "pay [2]" ransoms for the same spell. Actual: both executions collapse into ONE
  // prompt; after a single payment the bolt resolves and P2 keeps 2 energy.
  test("Repeat on the same spell should demand the [2] ransom twice (820.1.d.1); engine asks once", async () => {
    const game = await facingBolt(4, 4);
    const repeatField = game.p1.option("cast", "hb")?.fields.find((f) => f.arg === "repeat");
    expect(repeatField?.max).toBe(1); // a single Repeat instance (820.1.c.3)
    await game.p1.cast("hb", { repeat: 1, targets: "bolt" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(2); // bolt + ONE Hard Bargain (820.3.a)
    await passUntilPrompt(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes();
    expect(game.p2.energy()).toBe(2);
    // Second execution asks again.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes();
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash"); // bolt survived both and resolved
    expect(game.zoneOf("hb")).toBe("trash");
  });

  // BUG — same root cause: expected the second execution to find no payable ransom and counter the
  // bolt (Victim untouched). Actual: one payment of 2 fully saves the bolt and Victim dies.
  test("Repeat on the same spell vs a controller with only [2] — second execution should counter it; engine lets it resolve", async () => {
    const game = await facingBolt(2, 4);
    await game.p1.cast("hb", { repeat: 1, targets: "bolt" });
    await passUntilPrompt(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes();
    expect(game.p2.energy()).toBe(0);
    await game.settle(); // no second prompt possible → countered
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.state("victim").damage).toBe(0);
    expect(game.zoneOf("victim")).toBe("base");
  });

  // BUG — expected (820.2.a): the repeated execution may name a DIFFERENT spell, so with two enemy
  // spells on the chain a two-target repeat cast is legal and each spell's controller answers its
  // own ransom. Actual: the repeat variant only enumerates a single chain target — the two-target
  // cast is rejected as ILLEGAL_ARGS.
  test("Repeat should allow two different spells as the two counter targets (820.2.a); engine offers one target only", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 6 })
      .resources(P1, { energy: 4 })
      .unit(P1, "base", { might: 3, name: "Victim" }, "victim")
      .unit(P1, "base", { might: 3, name: "Bystander" }, "bystander")
      .hand(P2, bolt("Bolt A"), "boltA")
      .hand(P2, REACTION_BOLT, "boltB")
      .hand(P1, CARD, "hb")
      .build();
    await game.p2.cast("boltA", { targets: "victim" });
    await game.p2.cast("boltB", { targets: "bystander" }); // Reaction bolt stacks on P2's own chain
    await game.p2.passPriority();
    expect(game.p2.energy()).toBe(4);
    await game.p1.cast("hb", { repeat: 1, targets: ["boltB", "boltA"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((i) => i.cardId)).toEqual(["boltA", "boltB", "hb"]);
    await passUntilPrompt(game);
    // Two separate ransoms, one per spell; P2 (4 energy) pays both and ends at 0.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes();
    expect(game.p2.energy()).toBe(2);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes();
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("victim")).toBe("trash"); // boltA survived
    expect(game.zoneOf("bystander")).toBe("trash"); // boltB survived
    expect(game.zoneOf("hb")).toBe("trash");
  });

  test("Repeat is optional and must be affordable: with 3 energy the repeat variant is refused (nothing spent), the plain cast is fine; repeat:2 is never legal", async () => {
    const game = await facingBolt(2, 3);
    const r = await game.p1.try((p) => p.cast("hb", { repeat: 1, targets: "bolt" }));
    expect(r.ok).toBe(false);
    expect(game.p1.energy()).toBe(3);
    expect(game.zoneOf("hb")).toBe("hand");
    await game.p1.cast("hb", { targets: "bolt" });
    expect(game.p1.energy()).toBe(1);
    const rich = await facingBolt(2, 9);
    const twice = await rich.p1.try((p) => p.cast("hb", { repeat: 2, targets: "bolt" }));
    expect(twice.ok).toBe(false);
  });

  test("negative space: 1 energy → not castable; empty chain on your OWN turn → not castable (355.8); your own Hard Bargain is never its own target (355.9.c)", async () => {
    const poor = await facingBolt(2, 1);
    expect(poor.p1.can("cast", "hb")).toBe(false);
    const own = await scenario().resources(P1, { energy: 6 }).unit(P2, "base", { might: 1 }, "u").hand(P1, CARD, "hb").build();
    expect(own.chain()).toEqual([]);
    expect(own.p1.can("cast", "hb")).toBe(false);
    // With a spell of MY OWN on the chain it becomes castable (a spell is a spell) — but only that spell is offered, never hb itself.
    const mine = await scenario().resources(P1, { energy: 6 }).unit(P2, "base", { might: 1 }, "u").hand(P1, bolt("My Bolt"), "myBolt").hand(P1, CARD, "hb").build();
    await mine.p1.cast("myBolt", { targets: "u" });
    expect(mine.p1.can("cast", "hb")).toBe(true);
    const targets = mine.p1.option("cast", "hb")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["myBolt"]]);
  });

  test("'a spell' is not 'an ability': with only a triggered ability (Solari Shieldbearer's stun) on the chain, Hard Bargain is not playable", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3 })
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 3 }, "victim")
      .hand(P2, SHIELDBEARER, "solari")
      .hand(P1, CARD, "hb")
      .build();
    await game.p2.play("solari", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "solari", triggered: true })]);
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.p1.can("cast", "hb")).toBe(false);
  });

  test("parsed abilities: one reaction-timed spell ability — counter with an `unless: { energy: 2 }` ransom and Repeat [2]; card cost 2, no power", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "chaos", energyCost: 2, name: "Hard Bargain", timing: "reaction" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { type: "counter", unless: { energy: 2 } },
      repeat: { energy: 2 },
      timing: "reaction",
      type: "spell",
    });
  });
});
