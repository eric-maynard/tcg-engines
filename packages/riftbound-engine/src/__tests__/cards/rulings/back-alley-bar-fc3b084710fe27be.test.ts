/**
 * Ruling fc3b084710fe27be — Back-Alley Bar (OGN-277 → ogn-277-298) · Battlefield
 *   "When a unit moves from here, give it +1 [Might] this turn."
 *   × Blade Dancer (SFD-195 → sfd-195-221) · Legend (Irelia)
 *   "When you choose a friendly unit, you may exhaust me and pay [rainbow] to ready it. …"
 *
 * Q: Does Back-Alley Bar TARGET the unit it pumps, so that Irelia's legend ("when you choose a friendly unit") can be
 *    used off it?
 * A: No. The moving unit is only part of the Bar's trigger condition, not a target (355.10.c); nothing is "chosen", so
 *    Blade Dancer does not trigger. The +1 is simply applied when the Bar's trigger resolves.
 * Rules: 355.10.c (objects named only in a trigger condition are not targets), 383.4.b (Targeting Effects = "choose").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BACK_ALLEY_BAR = "ogn-277-298";
const BLADE_DANCER = "sfd-195-221";

/** [Action] "Give a unit +1 [Might] this turn." — a spell that DOES choose, for the contrast. */
const NUDGE = {
  abilities: [
    { effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Test Nudge",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

/**
 * P1's turn; P1's legend is Blade Dancer (ready) and P1 has a rainbow to pay it. bf1 = Back-Alley Bar (live), held by
 * P1's Anchor + an exhausted Mover (so a "ready it" would be observable). P1 also holds a Nudge.
 */
function board() {
  return scenario()
    .resources(P1, { power: { rainbow: 1 } })
    .legend(P1, BLADE_DANCER, "irelia")
    .battlefield("bf1", { controller: P1, def: BACK_ALLEY_BAR, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 5, name: "Far Wall" }, "farwall")
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .unit(P1, "bf1", { might: 2, name: "Mover" }, "mover")
    .hand(P1, NUDGE, "nudge");
}

describe("Ruling fc3b084710fe27be — Back-Alley Bar doesn't target, so Blade Dancer can't be used off it", () => {
  test("Mover moves from the Bar to base: the Bar's trigger gives it +1 this turn with NO choice made — and Blade Dancer is never offered (no 'choose' happened)", async () => {
    const game = await board().build();
    await game.p1.move("mover", "base");
    expect(game.locationOf("mover")).toBe("base");
    // Walk the chain by hand: at no point is P1 offered Blade Dancer's "exhaust me and pay [rainbow]" opt-in,
    // nor asked to pick a target for the Bar.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      expect(d?.kind).not.toBe("yes-no");
      expect(d?.kind).not.toBe("pick");
      if (d?.kind === "action" && d.context === "chain") {
        expect(game.chain().every((c) => c.cardId !== "irelia")).toBe(true);
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("mover")).toMatchObject({ might: 3, mightModifier: 1 }); // +1 this turn from the Bar
    expect(game.state("mover").isExhausted).toBe(true); // nothing readied it
    expect(game.state("irelia").isExhausted).toBe(false); // legend untouched
    expect(game.p1.power("rainbow")).toBe(1); // nothing paid
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a spell that CHOOSES the Mover (Nudge) does trigger Blade Dancer: P1 is offered 'exhaust me and pay [rainbow]' and, accepting, the Mover is readied", async () => {
    const game = await board().build();
    await game.p1.move("mover", "base");
    await game.settle();
    expect(game.state("mover")).toMatchObject({ isExhausted: true, might: 3 });
    await game.p1.cast("nudge", { targets: "mover" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "irelia" } });
    await game.p1.yes();
    await game.settle();
    expect(game.state("irelia").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.state("mover")).toMatchObject({ isReady: true, might: 4 });
  });
});
