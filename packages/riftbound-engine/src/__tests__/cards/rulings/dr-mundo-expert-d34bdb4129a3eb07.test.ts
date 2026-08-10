/**
 * Ruling d34bdb4129a3eb07 — Dr. Mundo, Expert (ogn-109-298) × Convergent Mutation (ogn-108-298) × Switcheroo (sfd-145-221)
 *   Mundo — Unit · 6 Might: "My Might is increased by the number of cards in your trash. At the start of your Beginning
 *   Phase, recycle 3 from your trash."
 *   Convergent Mutation — [Reaction] · [2][mind]: "Choose a friendly unit. This turn, increase its Might to the Might of
 *   another friendly unit."
 *   Switcheroo — [Hidden][Action] · [2][chaos][chaos]: "Swap the Might of two units at the same battlefield this turn."
 *
 * Q: Does Mundo's trash-count Might rise before or after a spell's effect — can the spell card hitting the trash save him
 *    from that spell's lethal damage — and how does it combine with Convergent Mutation / Switcheroo?
 * A: The effect applies first, then the spell goes to the trash as part of its resolution (before Cleanup), so Mundo's
 *    passive is already +1 when lethal damage is checked — it can save him. Might-setting spells snapshot a fixed modifier
 *    when they resolve; the +1 for the spell card is added on top afterwards (the snapshot doesn't change).
 * Rules: 354 (resolved spell → trash), 520 / Cleanup (lethal check after resolution), 477.3 (increase-to / swap = fixed delta).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MUNDO = "ogn-109-298";
const CONVERGENT_MUTATION = "ogn-108-298";
const SWITCHEROO = "sfd-145-221";
/** Inline P1 spell: "Deal 6 to a unit." — exactly Mundo's starting Might. */
const BLAST = { abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "mind", energyCost: 1, name: "Test Blast", timing: "action" } as const;

describe("Ruling d34bdb4129a3eb07 — the resolving spell reaches the trash (Mundo +1) before lethal damage is checked; set-Might spells snapshot", () => {
  // Expected: the 6 damage is marked, the spell finishes resolving and goes to P1's trash (Mundo → 7), and only then does
  // the Cleanup check lethal damage — 6 < 7, Mundo lives. Actual: the engine kills Mundo as the damage lands (before the
  // spell card reaches the trash), so he dies at 6/6 and ends in the trash alongside the spell.
  test("ruling d34bdb4129a3eb07 — P1's own 6-damage spell on a 6-Might Mundo: spell → trash (+1) precedes the lethal check, Mundo SURVIVES at 7 (engine kills him before the spell hits the trash)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", MUNDO, "mundo")
      .hand(P1, BLAST, "blast")
      .build();
    expect(game.p1.trash()).toEqual([]);
    expect(game.state("mundo").might).toBe(6);
    await game.p1.cast("blast", { targets: "mundo" });
    await game.settle();
    expect(game.zoneOf("blast")).toBe("trash");
    expect(game.p1.trash()).toEqual(["blast"]);
    expect(game.zoneOf("mundo")).toBe("base"); // not dead
    expect(game.state("mundo")).toMatchObject({ damage: 6, might: 7 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the same 6 damage from the OPPONENT's spell goes to P2's trash — Mundo stays 6 and dies", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", MUNDO, "mundo")
      .hand(P2, { ...BLAST, domain: "fury" }, "blast")
      .build();
    await game.p2.cast("blast", { targets: "mundo" });
    await game.settle();
    expect(game.p2.trash()).toEqual(["blast"]);
    expect(game.zoneOf("mundo")).toBe("trash");
  });

  test("Convergent Mutation (Mundo → a 9-Might ally): the +3 is snapshotted on resolution, THEN the spell hits the trash for another +1 — Mundo ends at 10 with a fixed +3 modifier", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .unit(P1, "base", MUNDO, "mundo")
      .unit(P1, "base", { might: 9, name: "Giant" }, "giant")
      .hand(P1, CONVERGENT_MUTATION, "cm")
      .build();
    expect(game.state("mundo").might).toBe(6);
    await game.p1.cast("cm", { targets: ["mundo", "giant"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("cm")).toBe("trash");
    expect(game.state("giant").might).toBe(9); // reference unit untouched
    expect(game.state("mundo").mightModifier).toBe(3); // 9 − 6, snapshotted
    expect(game.state("mundo").might).toBe(10); // 6 + 3 (snapshot) + 1 (CM now in trash)
  });

  test("Switcheroo by P1 (Mundo 6 ↔ enemy 2 at the same battlefield): fixed −4 / +4 deltas, then Switcheroo lands in P1's trash → Mundo 3 (not 2), the enemy 6", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "bf1", MUNDO, "mundo")
      .unit(P2, "bf1", { might: 2, name: "Imp" }, "imp")
      .hand(P1, SWITCHEROO, "sw")
      .build();
    expect(game.state("mundo").might).toBe(6);
    await game.p1.cast("sw", { targets: ["mundo", "imp"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("sw")).toBe("trash");
    expect(game.state("mundo").mightModifier).toBe(-4);
    expect(game.state("imp")).toMatchObject({ might: 6, mightModifier: 4 });
    expect(game.state("mundo").might).toBe(3); // 6 − 4 + 1 for the Switcheroo in P1's trash
  });

  test("the snapshot doesn't track later trash changes: after Convergent Mutation, a second P1 spell reaching the trash moves Mundo 10 → 11 while the +3 modifier stays +3", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .unit(P1, "base", MUNDO, "mundo")
      .unit(P1, "base", { might: 9, name: "Giant" }, "giant")
      .unit(P2, "base", { might: 8, name: "Dummy" }, "dummy")
      .hand(P1, CONVERGENT_MUTATION, "cm")
      .hand(P1, { ...BLAST, name: "Test Poke", abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }] }, "poke")
      .build();
    await game.p1.cast("cm", { targets: ["mundo", "giant"] });
    await game.settle();
    expect(game.state("mundo")).toMatchObject({ might: 10, mightModifier: 3 });
    await game.p1.cast("poke", { targets: "dummy" });
    await game.settle();
    expect(game.p1.trash().toSorted()).toEqual(["cm", "poke"]);
    expect(game.state("mundo")).toMatchObject({ might: 11, mightModifier: 3 });
    expect(game.violations()).toEqual([]);
  });
});
