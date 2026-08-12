/**
 * Ruling 3e11deb803990adf — Mystic Reversal (OGN-080 → ogn-080-298) · [Reaction] · [4][calm]×3
 *     "Gain control of a spell. You may make new choices for it."
 *   × Frigid Touch (SFD-066 → sfd-066-221) · [Reaction] · [2] · "[Repeat] [2] — Give a unit -2 [Might] this turn."
 *
 * Q: If I steal a Repeat-paid spell with Mystic Reversal, do I get both instances my opponent paid for?
 * A: Yes. The Repeat cost was paid when the spell was finalized, and repeats are not separate chain items —
 *    they are appended to the one spell. Gaining control does not unwind the payment, so you get ONE spell
 *    that performs its effect once per paid execution (twice for one Repeat), now under your control and
 *    aimed wherever your new choices point it.
 * Rules: 820 / 746.1.d ([Repeat] = an additional cost on the same chain item, not a copy), 751–755
 *        (gaining control + new choices; the finalized costs stay paid, 755 charges nothing new).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MYSTIC_REVERSAL = "ogn-080-298";
const FRIGID_TOUCH = "sfd-066-221";

/**
 * P2's turn. bf1 holds P1's Mine (7) and P2's Theirs (7). P2 has exactly Frigid Touch + one Repeat ([4]);
 * P1 has exactly Mystic Reversal's [4] + three calm.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 7, name: "Mine" }, "mine")
    .unit(P2, "bf1", { might: 7, name: "Theirs" }, "theirs")
    .resources(P2, { energy: 4 })
    .resources(P1, { energy: 4, power: { calm: 3 } })
    .hand(P2, FRIGID_TOUCH, "frigid")
    .hand(P1, MYSTIC_REVERSAL, "reversal");
}

/** P2 casts a Repeat-paid Frigid Touch at Mine; P1 reverses it and the Reversal resolves. */
async function reversed(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("frigid", { repeat: 1, targets: ["mine"] });
  expect(game.p2.energy()).toBe(0); // [2] base AND [2] Repeat paid up front
  expect(game.chain()).toHaveLength(1); // ONE item, not two
  await game.p2.passPriority();
  await game.p1.cast("reversal", { targets: "frigid" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["frigid", "reversal"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Mystic Reversal resolves
  return game;
}

describe("Ruling 3e11deb803990adf — stealing a Repeat-paid spell keeps every paid execution", () => {
  test("control: unreversed, the Repeat-paid Frigid Touch executes twice — Mine goes 7 → 3 (-2 and -2)", async () => {
    const game = await board().build();
    await game.p2.cast("frigid", { repeat: 1, targets: ["mine"] });
    await game.settle();
    expect(game.state("mine")).toMatchObject({ might: 3, mightModifier: -4 });
    expect(game.state("theirs").might).toBe(7);
  });

  test("the Reversal hands P1 the SAME single chain item, Repeat still paid on it and nothing refunded to P2", async () => {
    const game = await reversed();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "frigid", controller: P1 })]);
    expect(game.chain()).toHaveLength(1);
    expect(game.p2.energy()).toBe(0);
  });

  test("the new-choices dialog offers ONE target slot for the whole (repeated) spell — the repeats are appended text, not extra items", async () => {
    const game = await reversed();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "frigid" } });
    expect(d?.kind === "pick" ? d.newChoices?.slots.map((s) => s.key) : []).toEqual(["target:0"]);
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["mine", "theirs"]);
  });

  test("ruling: keeping the existing choice, BOTH executions still happen — Mine still ends at 3 (-4)", async () => {
    const game = await reversed();
    await game.settle(); // a passive settle keeps the current choices
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("frigid")).toBe("trash");
    expect(game.state("mine")).toMatchObject({ might: 3, mightModifier: -4 });
    expect(game.violations()).toEqual([]);
  });

  test("…and both executions are P1's to aim: re-choosing onto P2's own unit puts the whole -4 on Theirs", async () => {
    const game = await reversed();
    await game.p1.pick("theirs");
    await game.settle();
    expect(game.zoneOf("frigid")).toBe("trash");
    expect(game.state("theirs")).toMatchObject({ might: 3, mightModifier: -4 });
    expect(game.state("mine")).toMatchObject({ might: 7, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });
});
