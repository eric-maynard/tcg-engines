/**
 * Ruling ed7be06439eb754d — Mask of Foresight (OGN-060 → ogn-060-298), gear
 *   "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *   × Yasuo, Remorseful (ogn-076-298) · 6 Might "When I attack, deal damage equal to my Might to an
 *     enemy unit here."
 *
 * Q: With two Masks in play, do they add their Might to Yasuo before his "when I attack" trigger
 *    resolves, so his trigger deals the boosted amount?
 * A: Yes — because all three triggers come from the SAME event, their controller chooses the order
 *    they go on the chain. Put Yasuo's trigger on first (bottom) and both Masks above it: the Masks
 *    resolve first, and Yasuo's damage is then measured from his boosted Might.
 * Rules: 383.3.d (a player orders their own simultaneous triggers), 340 (the chain resolves top-down),
 *        the damage amount is read as the trigger resolves.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK = "ogn-060-298";
const YASUO = "ogn-076-298";

/** P1: two Masks in play and Yasuo in base. P2 holds bf1 with a 20-Might Titan that survives anything. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .gear(P1, MASK, "mask1")
    .gear(P1, MASK, "mask2")
    .unit(P1, "base", YASUO, "yasuo")
    .unit(P2, "bf1", { might: 20, name: "Titan" }, "titan");
}

/** Resolve chain items without touching the open showdown. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 12 && game.chain().length > 0 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
}

describe("Ruling ed7be06439eb754d — the controller orders the same-event triggers so both Masks resolve before Yasuo's damage", () => {
  test("attacking alone raises three triggers at once and P1 is offered the order", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    const d = game.decision() as Extract<Decision, { kind: "order" }>;
    expect(d).toMatchObject({ kind: "order", seat: P1, timing: "FIN", defaultable: true });
    expect(d.items.map((i) => i.card).sort()).toEqual(["mask1", "mask2", "yasuo"]);
    expect(game.chain()).toHaveLength(3);
    expect(game.state("yasuo").might).toBe(6); // nothing has resolved yet
  });

  test("Yasuo's trigger placed at the BOTTOM: both Masks resolve first (+1 each) and his trigger then deals 8", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    const d = game.decision() as Extract<Decision, { kind: "order" }>;
    const key = (card: string) => d.items.find((i) => i.card === card)!.key;
    // First named = bottom of the chain, last named = top (resolves first).
    await game.p1.order([key("yasuo"), key("mask1"), key("mask2")]);
    await drainChain(game);
    expect(game.state("yasuo").might).toBe(8); // 6 + 1 + 1
    expect(game.state("titan").damage).toBe(8);
    expect(game.violations()).toEqual([]);
  });

  test("the ordering is what does it: leaving Yasuo's trigger on top makes it resolve first, for only 6", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    await game.acceptTriggerOrder(); // keep the listed order — Yasuo's trigger is on top
    await drainChain(game);
    expect(game.state("titan").damage).toBe(6);
    expect(game.state("yasuo").might).toBe(8); // the Masks still resolved, just too late to count
  });

  test("with only ONE Mask the same ordering gives 7 — each Mask contributes exactly +1", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .gear(P1, MASK, "mask1")
      .unit(P1, "base", YASUO, "yasuo")
      .unit(P2, "bf1", { might: 20, name: "Titan" }, "titan")
      .build();
    await game.p1.move("yasuo", "bf1");
    const d = game.decision() as Extract<Decision, { kind: "order" }>;
    const key = (card: string) => d.items.find((i) => i.card === card)!.key;
    await game.p1.order([key("yasuo"), key("mask1")]);
    await drainChain(game);
    expect(game.state("titan").damage).toBe(7);
  });
});
