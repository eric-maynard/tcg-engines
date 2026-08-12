/**
 * Ruling f7a53a17f98868cb — Mystic Reversal (OGN-080 → ogn-080-298) · [Reaction] [4][calm][calm][calm]
 *   "Gain control of a spell. You may make new choices for it."
 *
 * Q: Can I use Mystic Reversal against an opponent's Mystic Reversal that has taken my spell, and when?
 * A: Two routes, both legal and equivalent here.
 *    · Option 1 — answer their Mystic Reversal with yours, choosing THEIR Mystic Reversal. Yours resolves, you own
 *      theirs, and when theirs resolves it hands your original spell back to you with new choices.
 *    · Option 2 — let theirs resolve (they take the spell and re-aim it), then Mystic Reversal that spell to take it
 *      back, again with new choices.
 * Rules: 340 (LIFO / priority), 751–755 (gain control + new choices), 753.1 (candidates re-read for the new chooser).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MYSTIC_REVERSAL = "ogn-080-298";

/** P1's [1] spell with one target — the object both Mystic Reversals are fighting over. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt",
} as const;

/** P1's turn. Both players hold a Mystic Reversal and plenty of [calm]; one big unit each so a re-aim is meaningful. */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { calm: 6 } })
    .resources(P2, { energy: 9, power: { calm: 6 } })
    .unit(P1, "base", { might: 9, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 9, name: "Theirs" }, "theirs")
    .hand(P1, BOLT, "bolt")
    .hand(P1, MYSTIC_REVERSAL, "mr1")
    .hand(P2, MYSTIC_REVERSAL, "mr2");
}

/** P1 Bolts their unit; P2 answers with Mystic Reversal on the Bolt. Chain: bolt, mr2. */
async function theirReversalOnMyBolt(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bolt", { targets: "theirs" });
  await game.p1.passPriority();
  await game.p2.cast("mr2", { targets: "bolt" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["bolt", "mr2"]);
  return game;
}

describe("Ruling f7a53a17f98868cb — two ways to answer a Mystic Reversal that stole your spell", () => {
  test("premise: P1's own Mystic Reversal may choose EITHER the Bolt or the opposing Mystic Reversal", async () => {
    const game = await theirReversalOnMyBolt();
    await game.p2.passPriority();
    const field = game.p1.option("cast", "mr1")?.fields.find((f) => f.arg === "targets");
    const offered = new Set((field?.options ?? []).flat() as string[]);
    expect(offered).toEqual(new Set(["bolt", "mr2"]));
  });

  test("option 1 — Mystic Reversal the opposing Mystic Reversal: P1 owns it before it ever resolves", async () => {
    const game = await theirReversalOnMyBolt();
    await game.p2.passPriority();
    await game.p1.cast("mr1", { targets: "mr2" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bolt", "mr2", "mr1"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // mr1 resolves
    expect(game.chain().find((c) => c.cardId === "mr2")?.controller).toBe(P1);
  });

  test("option 1 continued — the captured Mystic Reversal then hands the Bolt back to P1 with new choices", async () => {
    const game = await theirReversalOnMyBolt();
    await game.p2.passPriority();
    await game.p1.cast("mr1", { targets: "mr2" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // mr1 resolves — P1 now controls mr2
    await game.p1.passPriority();
    await game.p2.passPriority(); // mr2 resolves under P1
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { pendingChoiceType: "new-choices" } });
    expect(game.chain().find((c) => c.cardId === "bolt")?.controller).toBe(P1);
    await game.p1.pick("mine"); // P1 may re-aim; it is P1's choice again
    await game.settle();
    expect(game.state("mine").damage).toBe(3);
    expect(game.state("theirs").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("option 2 — let theirs resolve first: P2 takes the Bolt and re-aims it at P1's unit", async () => {
    const game = await theirReversalOnMyBolt();
    await game.p2.passPriority();
    await game.p1.passPriority(); // mr2 resolves
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, source: { pendingChoiceType: "new-choices" } });
    await game.p2.pick("mine");
    expect(game.chain().find((c) => c.cardId === "bolt")?.controller).toBe(P2);
    expect(game.chain().find((c) => c.cardId === "bolt")?.targets).toEqual(["mine"]);
  });

  test("option 2 continued — P1 answers the now-enemy Bolt with Mystic Reversal, takes it back and re-aims it", async () => {
    const game = await theirReversalOnMyBolt();
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.pick("mine");
    if (game.actingSeat() === P2) await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "mr1")).toBe(true);
    await game.p1.cast("mr1", { targets: "bolt" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // mr1 resolves
    expect(game.chain().find((c) => c.cardId === "bolt")?.controller).toBe(P1);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { pendingChoiceType: "new-choices" } });
    await game.p1.pick("theirs"); // aimed back where it started
    await game.settle();
    expect(game.state("theirs").damage).toBe(3);
    expect(game.state("mine").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
