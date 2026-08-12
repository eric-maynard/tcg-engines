/**
 * Ruling a83ba30d4fc49d98 — Defy (OGN-045 → ogn-045-298) · Spell · Calm · [1][calm] · [Reaction]
 *   "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Cleave (ogn-004-298) [Action] "Give a unit [Assault 3] this turn."
 *   × En Garde (ogn-046-298) [Reaction] "Give a friendly unit +1 [Might] this turn, then +1 more if alone."
 *
 * Q: When you react while a chain is open, do you automatically pass priority to the opponent, or can you
 *    keep priority and play several reactions first?
 * A: You keep priority: play as many reactions as you like, then pass when YOU choose to. Only then may the
 *    opponent respond — even holding Defy they must wait for your pass. And Defy may name ANY spell on the
 *    chain it can legally counter, not merely the newest one.
 * Rules: 340.1/340.2 (the player who added to the chain retains Priority), 309.1.a (closed state = Reactions
 *        only), 425.1 (Counter).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const CLEAVE = "ogn-004-298";
const EN_GARDE = "ogn-046-298";

/** P1's turn, neutral open. P1 holds an Action + two Reactions; P2 holds Defy. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 2, fury: 1 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, EN_GARDE, "garde1")
    .hand(P1, EN_GARDE, "garde2")
    .hand(P2, DEFY, "defy");
}

describe("Ruling a83ba30d4fc49d98 — Defy: the reacting player retains priority and may stack several reactions", () => {
  test("after playing a spell the SAME player is still the acting seat — priority is not handed over automatically", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("ruling: P1 may add any number of reactions in a row before passing", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "ally" });
    await game.p1.cast("garde1", { targets: "ally" });
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("garde2", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "garde1", "garde2"]);
    expect(game.actingSeat()).toBe(P1);
  });

  test("nuance: holding Defy does not let P2 jump in — P2 cannot act until P1 passes priority", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "ally" });
    expect(game.p2.can("cast", "defy")).toBe(false);
    const early = await game.p2.try((p) => p.cast("defy", { targets: "cleave" }));
    expect(early.ok).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);

    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "defy")).toBe(true);
  });

  test("nuance: Defy can name ANY legal spell on the chain, not just the newest one — and countering the bottom item leaves the others to resolve", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "ally" });
    await game.p1.cast("garde1", { targets: "ally" });
    await game.p1.passPriority();

    const targets = game.p2
      .option("cast", "defy")
      ?.fields?.find((f) => f.name === "targets")
      ?.options?.map((o) => String(o.key ?? o));
    expect(targets).toEqual(expect.arrayContaining(["cleave", "garde1"]));

    // Counter the OLDEST item on the chain.
    await game.p2.cast("defy", { targets: "cleave" });
    await game.settle();

    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("trash");
    // Cleave was countered: no [Assault 3]. En Garde still resolved: the ally is bigger.
    expect(game.state("ally").grantedKeywords.map((k) => k.keyword)).not.toContain("Assault");
    expect(game.state("ally").might).toBeGreaterThan(2);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
