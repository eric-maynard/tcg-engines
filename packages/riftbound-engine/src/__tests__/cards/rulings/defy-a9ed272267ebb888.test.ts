/**
 * Ruling a9ed272267ebb888 — Defy (OGN-045 → ogn-045-298) · [Reaction] "Counter a spell that costs no more
 *   than [4] and no more than [rainbow]."
 *   × Downstage Dramatics (unl-061-219) [Reaction] [2][mind], "[Repeat] [2] … Draw 1."
 *
 * Q: If the opponent Defys a spell with [Repeat], can I still pay the Repeat cost to cast it again?
 * A: No. [Repeat] is an additional cost decided and paid BEFORE the spell is finalized onto the chain; once
 *    it sits on the chain (and certainly once it has been Defied) there is no window to pay it. A repeated
 *    spell is still ONE spell with a bigger effect box, so one Defy counters the whole thing.
 * Rules: 355.1.a/356.2 (additional costs are paid during Finalization), 820.2 ([Repeat]), 425.1 (Counter).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const DOWNSTAGE = "unl-061-219";

/** P1's turn. P1 can afford Downstage Dramatics twice over ([2][mind] + [Repeat] [2]); P2 holds Defy. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .hand(P1, DOWNSTAGE, "dramatics")
    .hand(P2, DEFY, "defy");
}

describe("Ruling a9ed272267ebb888 — [Repeat] is paid at Finalization, so a Defied spell can never be repeated afterwards", () => {
  test("the Repeat cost is charged the moment the spell is played, before anyone can respond", async () => {
    const game = await board().build();
    const before = game.p1.energy();
    await game.p1.cast("dramatics", { repeat: 1 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dramatics"]);
    // base [2] + Repeat [2] = 4 energy gone at once.
    expect(game.p1.energy()).toBe(before - 4);
  });

  test("ruling: once the spell is on the chain there is no Repeat decision left — and none appears after Defy answers it", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("dramatics"); // played WITHOUT paying Repeat
    expect(game.p1.energy()).toBe(4); // only the base [2] was paid
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "dramatics" });

    // P2 keeps priority after adding Defy (340.1); hand it back so P1 is the one looking for a Repeat.
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();

    // P1 still has the energy for a Repeat, but nothing on the menu offers to pay it now.
    expect(game.p1.energy()).toBe(4);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("repeat");
    for (const opt of game.p1.legal()) {
      expect(opt.card === "dramatics").toBe(false);
    }

    await game.settle();
    expect(game.zoneOf("dramatics")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p1.hand().length).toBe(handBefore - 1); // Draw 1 never happened
  });

  test("nuance: a repeated spell is ONE spell — a single Defy counters both executions, and nothing is drawn", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("dramatics", { repeat: 1 });
    expect(game.p1.energy()).toBe(2);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "dramatics" });
    await game.settle();

    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("dramatics")).toBe("trash");
    // Two Draw 1 executions were bought and both were countered together.
    expect(game.p1.hand().length).toBe(handBefore - 1);
    expect(game.p1.energy()).toBe(2); // no refund for the Repeat cost (425.1.c)
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, the repeated spell draws twice", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("dramatics", { repeat: 1 });
    await game.settle();
    expect(game.p1.hand().length).toBe(handBefore - 1 + 2);
  });
});
