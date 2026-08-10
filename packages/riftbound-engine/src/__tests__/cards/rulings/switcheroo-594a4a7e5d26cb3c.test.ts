/**
 * Ruling 594a4a7e5d26cb3c — Switcheroo (SFD-145 → sfd-145-221) · Action · [2][chaos][chaos]
 *     "Swap the Might of two units at the same battlefield this turn."
 *   (Discipline ogn-058-298 is cited only as the contrast: an intangible +Might, unlike a buff, is not an object.)
 *   Buff spender used for the nuance: Udyr, Wildman (ogn-157-298) 6 Might · "Spend my buff: Choose one — … Give me [Ganking] this turn."
 *
 * Q: Switcheroo swaps a BUFFED unit's Might with an opponent's unit — does the buff stay, and what are the Might values?
 * A: Current Might values are swapped (A 5 incl. +1 buff ↔ B 2 → A 2, B 5) but the buff is a physical object that stays on A.
 *    If A's buff is later spent/removed, A's Might drops by 1.
 * Rules: 433 (swap Might = ± modifiers from current values), 702/703 (a buff is an object worth +1 Might; spending removes it).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";
const UDYR = "ogn-157-298";

describe("Ruling 594a4a7e5d26cb3c — Switcheroo swaps current Might; the buff object stays put", () => {
  test("the ruling's numbers: A = 4 + buff (5) vs enemy B = 2 at the same battlefield → after Switcheroo A is 2 AND still buffed, B is 5", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Unit A" }, "A", { buffed: true })
      .unit(P2, "bf1", { might: 2, name: "Unit B" }, "B")
      .hand(P1, SWITCHEROO, "sw")
      .build();
    expect(game.state("A")).toMatchObject({ baseMight: 4, isBuffed: true, might: 5 });
    expect(game.state("B").might).toBe(2);
    await game.p1.cast("sw", { targets: ["A", "B"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("sw")).toBe("trash");
    expect(game.state("A")).toMatchObject({ isBuffed: true, might: 2 }); // 4 + 1 buff − 3
    expect(game.state("A").mightModifier).toBe(-3);
    expect(game.state("B")).toMatchObject({ isBuffed: false, might: 5 }); // 2 + 3
    expect(game.violations()).toEqual([]);
  });

  test("the swap is 'this turn': next turn A is back to 5 (4 + its buff, which it kept) and B to 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Unit A" }, "A", { buffed: true })
      .unit(P2, "bf1", { might: 2, name: "Unit B" }, "B")
      .hand(P1, SWITCHEROO, "sw")
      .build();
    await game.p1.cast("sw", { targets: ["A", "B"] });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("A")).toMatchObject({ isBuffed: true, might: 5, mightModifier: 0 });
    expect(game.state("B")).toMatchObject({ might: 2, mightModifier: 0 });
  });

  test("nuance: spending the buff AFTER the swap lowers the unit by 1 — buffed Udyr (6+1 = 7) swapped with a 2 sits at 2; he spends his buff (→ Ganking) and drops to 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", UDYR, "udyr", { buffed: true })
      .unit(P2, "bf1", { might: 2, name: "Unit B" }, "B")
      .hand(P1, SWITCHEROO, "sw")
      .build();
    expect(game.state("udyr")).toMatchObject({ isBuffed: true, might: 7 });
    await game.p1.cast("sw", { targets: ["udyr", "B"] });
    await game.settle();
    expect(game.state("udyr")).toMatchObject({ isBuffed: true, might: 2 }); // 7 − 5
    expect(game.state("B").might).toBe(7);
    // Spend my buff: choose "Give me [Ganking] this turn" (printed option index 3).
    expect(game.p1.can("activate", "udyr")).toBe(true);
    await game.p1.activate("udyr");
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        const gank = d.options.find((o) => /gank/i.test(o.label)) ?? d.options.at(-1)!;
        await game.p1.pick(gank.key);
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.state("udyr").isBuffed).toBe(false);
    expect(game.state("udyr").might).toBe(1); // the swap modifier (−5) stays; only the buff's +1 is gone
    expect(game.state("B").might).toBe(7);
  });
});
