/**
 * Ruling f8a9f97f82e0fc14 — Mystic Reversal (OGN-080 → ogn-080-298) · [Reaction] spell · [4][calm][calm][calm]
 *   "Gain control of a spell. You may make new choices for it."
 *   × Feral Strength (SFD-034 → sfd-034-221) · [Reaction] · [2] · "[Repeat] [2] … Give a unit +2 [Might] this turn."
 *
 * Q: If I steal a spell whose [Repeat] cost was paid, do I get all the repetitions?
 * A: Yes. The Repeat cost was paid when the spell was finalized; gaining control does not unwind that, so you receive
 *    one spell that performs its effect as many times as was paid for — and you pay nothing extra. New choices (new
 *    targets) are yours to make, and rule 755 charges nothing for them. The spell still counts as played once.
 * Rules: 751–755 (gaining control; making new choices; no cost for them), 356.5 ([Repeat] is paid at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MYSTIC_REVERSAL = "ogn-080-298";
const FERAL_STRENGTH = "sfd-034-221";

/** P1's turn. P1 casts Feral Strength with one Repeat paid; P2 holds Mystic Reversal. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
    .hand(P1, FERAL_STRENGTH, "feral")
    .hand(P2, MYSTIC_REVERSAL, "reversal")
    .resources(P1, { energy: 4 }) // [2] + the [2] Repeat
    .resources(P2, { energy: 4, power: { calm: 3 } });
}

/** P1 pays the Repeat; P2 steals the spell and the new-choices dialog opens. */
async function stolen(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("feral", { repeat: 1, targets: "mine" });
  expect(game.p1.energy()).toBe(0); // [2] base + [2] Repeat, both paid up front
  await game.p1.passPriority();
  await game.p2.cast("reversal", { targets: "feral" });
  await game.acting().passPriority();
  await game.acting().passPriority(); // Mystic Reversal resolves
  return game;
}

describe("Ruling f8a9f97f82e0fc14 — stealing a repeated spell hands over every repetition, free of charge", () => {
  test("the paid Repeat rides on the finalized spell — P1 spent [4] for it before it was ever contested", async () => {
    const game = await board().build();
    await game.p1.cast("feral", { repeat: 1, targets: "mine" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "feral", controller: P1, targets: ["mine"] })]);
    expect(game.p1.energy()).toBe(0);
  });

  test("after Mystic Reversal resolves the spell is P2's and P2 is offered NEW CHOICES for it", async () => {
    const game = await stolen();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "feral", controller: P2 })]);
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d.newChoices?.slots).toEqual([expect.objectContaining({ current: ["mine"], kind: "target" })]);
    expect(d.options.map((o) => o.key).sort()).toEqual(["mine", "theirs"]);
  });

  test("re-aiming it costs nothing — P2 has spent only Mystic Reversal's own price", async () => {
    const game = await stolen();
    await game.p2.pick("theirs");
    expect(game.p2.energy()).toBe(0); // 4 − 4 for Mystic Reversal; no Repeat cost was ever charged again
    expect(game.p2.power("calm")).toBe(0);
  });

  test("BOTH executions happen for the new controller: the re-aimed unit gets +2 twice (2 → 6)", async () => {
    const game = await stolen();
    await game.p2.pick("theirs");
    await game.settle();
    expect(game.state("theirs").might).toBe(6);
    expect(game.state("mine").might).toBe(2); // the original target gets nothing
    expect(game.violations()).toEqual([]);
  });

  test("keeping the original choice also keeps both executions — the theft is what changed, not the spell", async () => {
    const game = await stolen();
    await game.p2.pick("mine");
    await game.settle();
    expect(game.state("mine").might).toBe(6);
    expect(game.state("theirs").might).toBe(2);
  });

  test("the spell was played once: one card, and it lands in its OWNER's trash when it finishes", async () => {
    const game = await stolen();
    await game.p2.pick("theirs");
    await game.settle();
    expect(game.zoneOf("feral")).toBe("trash");
    expect(game.p1.trash()).toContain("feral");
    expect(game.zoneOf("reversal")).toBe("trash");
  });
});
