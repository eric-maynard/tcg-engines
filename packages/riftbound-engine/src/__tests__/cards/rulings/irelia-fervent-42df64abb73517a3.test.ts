/**
 * Ruling 42df64abb73517a3 — Irelia, Fervent (sfd-057-221) · Champion Unit · Calm · 5 · 4 Might
 *   "[Deflect] … When you choose or ready me, give me +1 [Might] this turn."
 *   × Feral Strength (sfd-034-221) · Reaction · 2 · "[Repeat] [2] … Give a unit +2 [Might] this turn."
 *
 * Q: Does a Repeat spell that chooses Irelia for both executions give her +1 Might twice?
 * A: Yes. Repeat = execute the instructions an additional time (820.1.d); choices for both executions are
 *    made while playing the card (820.2), and choosing her for each is a separate targeting event, so her
 *    targeting trigger is added to the chain once per event after the spell finalizes (383.4.b.2/.3).
 *    Example: Feral Strength repeated on Irelia ⇒ +1 +1 from her triggers, then +2 +2 from the spell = +6.
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const IRELIA = "sfd-057-221";
const FERAL_STRENGTH = "sfd-034-221";

function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .unit(P1, "base", IRELIA, "irelia")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "other")
    .hand(P1, FERAL_STRENGTH, "feral");
}

describe("Ruling 42df64abb73517a3 — Repeat spell choosing Irelia twice triggers her twice", () => {
  test("baseline (no Repeat): choosing Irelia puts ONE targeting trigger on the chain above the spell; it resolves first (+1 → 5), then the spell (+2 → 7); all of it wears off at end of turn", async () => {
    const game = await board().build();
    expect(game.state("irelia").might).toBe(4);
    await game.p1.cast("feral", { targets: "irelia" });
    expect(game.p1.energy()).toBe(2); // base cost only; P1 controls Irelia so no Deflect surcharge
    // 383.4.b.2: the targeting trigger is added after the spell is finalized, on top of it.
    expect(game.chain().map((c) => c.cardId)).toEqual(["feral", "irelia"]);
    expect(game.chain()[1]?.triggered).toBe(true);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["feral"]);
    expect(game.state("irelia").might).toBe(5);
    await game.settle();
    expect(game.state("irelia").might).toBe(7);
    expect(game.state("other").might).toBe(2);
    expect(game.zoneOf("feral")).toBe("trash");
    await game.advanceTurn();
    expect(game.state("irelia").might).toBe(4);
  });

  test.failing("BUG: ruling 42df64abb73517a3 — Repeat paid and Irelia chosen for both executions: TWO targeting triggers hit the chain (+1 +1 → 6), then the spell gives +2 +2 → 10 (+6 total); engine fires her trigger only once (ends at 9)", async () => {
    // Expected: chain = [feral, irelia, irelia] right after the cast; Irelia 6 after both triggers, 10 after
    // the spell. Actual: a single trigger — chain [feral, irelia], Irelia ends the chain at 9.
    const game = await board().build();
    await game.p1.cast("feral", { repeat: 1, targets: "irelia" });
    expect(game.p1.energy()).toBe(0); // 2 + Repeat [2]
    expect(game.chain().map((c) => c.cardId)).toEqual(["feral", "irelia", "irelia"]);
    // Resolve the two triggers (LIFO), checking the intermediate +1s the ruling spells out.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("irelia").might).toBe(5);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("irelia").might).toBe(6);
    expect(game.chain().map((c) => c.cardId)).toEqual(["feral"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("irelia").might).toBe(10);
    expect(game.state("other").might).toBe(2);
  });

  test.failing("BUG: ruling 42df64abb73517a3 — bottom line only: repeated Feral Strength on Irelia leaves her at 4 + 6 = 10 Might this turn; engine gives 9", async () => {
    const game = await board().build();
    await game.p1.cast("feral", { repeat: 1, targets: "irelia" });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("irelia").might).toBe(10);
  });
});
