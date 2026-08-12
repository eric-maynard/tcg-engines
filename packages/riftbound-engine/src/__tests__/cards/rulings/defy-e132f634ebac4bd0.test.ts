/**
 * Ruling e132f634ebac4bd0 — Defy (OGN-045 → ogn-045-298) · [Reaction] · Calm · [1][calm]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] [Action] · Order · [2][order]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: Can you Defy a spell cast from hidden?
 * A: Yes. Playing a facedown card from Hidden is still PLAYING that spell: it goes on the chain like
 *    any other spell and is a legal object for a counter.
 * Rules: 811.1.c.3 (playing from hidden IS playing the card), 425.1 (counter → the spell is trashed
 *        without resolving), 419.4 (the played spell becomes a chain item).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * Turn 3, P1 active. P1 controls bf1 with a Holder and hid Hidden Blade there last turn.
 * P2's Victim stands at bf1 (the Blade's kill target) and P2 holds Defy with [1][calm] up.
 */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
    .unit(P2, "bf1", { might: 2, name: "Victim" }, "victim")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .hand(P2, DEFY, "defy")
    .resources(P2, { energy: 1, power: { calm: 1 } });
}

describe("Ruling e132f634ebac4bd0 — a spell played from hidden can be Defied", () => {
  test("the flip puts Hidden Blade on the chain as an ordinary spell of P1's, targeting the Victim", async () => {
    const game = await board().build();
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    await game.p1.reveal("blade");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("victim");
    }
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "blade", controller: P1, targets: ["victim"], triggered: false }),
    ]);
    expect(game.zoneOf("blade")).toBe("chain");
    expect(game.state("blade").isHidden).toBe(false);
  });

  test("ruling: P2 may cast Defy naming that flipped spell — it is a legal counter target", async () => {
    const game = await board().build();
    await game.p1.reveal("blade");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("victim");
    }
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    const targets = game.p2.option("cast", "defy")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect(targets.flat()).toContain("blade");
  });

  test("the counter resolves: Hidden Blade is trashed without resolving — the Victim lives and nobody draws 2", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await game.p1.reveal("blade");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("victim");
    }
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "blade" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // only Defy left P2's hand; the "draws 2" never happened
    expect(game.violations()).toEqual([]);
  });

  test("contrast: unanswered, the same flipped spell resolves and kills the Victim (so the counter is what saved it)", async () => {
    const game = await board().build();
    await game.p1.reveal("blade");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("victim");
    }
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
