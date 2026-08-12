/**
 * Ruling e9dd1d8eb4f15546 — Defy (OGN-045 → ogn-045-298) · [Reaction] · Calm · [1][calm]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Action] · "Kill a unit at a battlefield. Its controller draws 2."
 *   × Stupefy (OGN-095 → ogn-095-298) · [Reaction] · "Give a unit -1 [Might] this turn, to a minimum of 1. Draw 1."
 *
 * Q: When the opponent puts an Action and then a Reaction on the chain, may Defy counter the one I pick,
 *    or is it forced to counter the last spell added?
 * A: You choose. Defy targets a spell like any other target: any legal spell on the chain, not only the top.
 * Rules: 355.5 / 355.8 (the caster chooses the target among all legal ones), 336/337 (the chain is a list of
 *        items; LIFO only governs RESOLUTION order), 425.1 (a countered spell is trashed without resolving).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const HIDDEN_BLADE = "ogn-213-298";
const STUPEFY = "ogn-095-298";

/**
 * Turn 3, P2's turn. P2 holds bf1 with a Guard; P1 has Sacrifice (2 Might) and Bystander (3 Might) there.
 * P2 has both spells and plenty of resources; P1 has one Defy and exactly [1][calm].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P1, "bf1", { might: 2, name: "Sacrifice" }, "sacrifice")
    .unit(P1, "bf1", { might: 3, name: "Bystander" }, "bystander")
    .hand(P2, HIDDEN_BLADE, "blade")
    .hand(P2, STUPEFY, "stupefy")
    .resources(P2, { energy: 6, power: { mind: 3, order: 3 } })
    .hand(P1, DEFY, "defy")
    .resources(P1, { energy: 1, power: { calm: 1 } });
}

/** P2 casts Hidden Blade at the Sacrifice, keeps priority, then casts Stupefy at the Bystander. */
async function twoSpellChain() {
  const game = await board().build();
  await game.p2.cast("blade", { targets: "sacrifice" });
  await game.p2.cast("stupefy", { targets: "bystander" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "stupefy"]); // bottom → top
  await game.p2.passPriority(); // P2 finally lets go; now P1 may respond
  return game;
}

describe("Ruling e9dd1d8eb4f15546 — Defy may name any spell on the chain, not just the top one", () => {
  test("P2 holds priority to stack an Action then a Reaction: both sit on the chain, Blade at the bottom", async () => {
    const game = await twoSpellChain();
    expect(game.chain()[0]).toMatchObject({ cardId: "blade", controller: P2 });
    expect(game.chain()[1]).toMatchObject({ cardId: "stupefy", controller: P2 });
    expect(game.zoneOf("sacrifice")).toBe("battlefield-bf1"); // nothing has resolved
    expect(game.state("bystander").might).toBe(3);
  });

  test("ruling: Defy's legal targets include BOTH chain items — the bottom Action as well as the top Reaction", async () => {
    const game = await twoSpellChain();
    expect(game.p1.can("cast", "defy")).toBe(true);
    const targets = (game.p1.option("cast", "defy")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat();
    expect(new Set(targets)).toEqual(new Set(["blade", "stupefy"]));
  });

  test("countering the BOTTOM spell: the Blade is trashed unresolved (Sacrifice lives) while the top Stupefy still resolves", async () => {
    const game = await twoSpellChain();
    await game.p1.cast("defy", { targets: "blade" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "stupefy", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("sacrifice")).toBe("battlefield-bf1"); // the kill never happened
    expect(game.state("bystander").might).toBe(2); // Stupefy resolved: 3 − 1
    expect(game.violations()).toEqual([]);
  });

  test("the other choice is equally available: naming the TOP spell counters Stupefy and lets the Blade kill the Sacrifice", async () => {
    const game = await twoSpellChain();
    await game.p1.cast("defy", { targets: "stupefy" });
    await game.settle();
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("bystander").might).toBe(3); // no -1
    expect(game.zoneOf("sacrifice")).toBe("trash"); // the Blade resolved
    expect(game.violations()).toEqual([]);
  });
});
