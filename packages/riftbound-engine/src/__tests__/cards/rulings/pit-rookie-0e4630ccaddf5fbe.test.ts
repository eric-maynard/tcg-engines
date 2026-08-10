/**
 * Ruling 0e4630ccaddf5fbe — Pit Rookie (OGN-136 → ogn-136-298) · 2 · 2 Might · "When you play me, buff another
 *   friendly unit."  × Cithria of Cloudfield (ogn-139-298) · 1 Might · "When you play another unit, buff me."
 *   × Call to Glory (ogn-207-298) · Reaction · 3 · "As you play this, you may spend a buff as an additional
 *   cost. If you do, ignore this spell's cost. Give a unit +3 [Might] this turn."
 *
 * Q: Playing Pit Rookie with Cithria on board — can Call to Glory consume one buff while Cithria keeps the
 *    other buff plus the +3?
 * A: Yes. Both triggers go on the chain; resolve one (Cithria buffed), then — with priority back before the
 *    second resolves — play Call to Glory spending that buff (+3 this turn), then the second trigger buffs
 *    her again. Result: one buff and +3 this turn. The stacking order of the two triggers doesn't matter.
 * Rules: 383.3.d (controller orders simultaneous triggers), 332/336 (priority returns after each item
 *        resolves), 702.2 (buff: max one, spending removes it), 356 (additional costs).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PIT_ROOKIE = "ogn-136-298";
const CITHRIA = "ogn-139-298";
const CALL_TO_GLORY = "ogn-207-298";

/** P1: exactly 2 energy (Pit Rookie) — Call to Glory can only be cast by spending a buff. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .unit(P1, "base", CITHRIA, "cithria")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .hand(P1, PIT_ROOKIE, "rookie")
    .hand(P1, CALL_TO_GLORY, "ctg");
}

/** Both players pass priority once each (resolving the top chain item). */
async function resolveTop(game: Game): Promise<void> {
  const top = game.chain().at(-1)?.id;
  for (let i = 0; i < 4 && top !== undefined && game.chain().some((c) => c.id === top); i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Ruling 0e4630ccaddf5fbe — Pit Rookie + Cithria: resolve one buff trigger, spend it on Call to Glory, then take the second buff", () => {
  test("ruling 0e4630ccaddf5fbe — full line: two triggers on the chain → first resolves (Cithria buffed, 2) → P1 has priority and casts Call to Glory by SPENDING that buff (0 energy; 1 → 4) → second trigger re-buffs her → 5 Might, buffed, +3 this turn", async () => {
    const game = await board().build();
    expect(game.state("cithria")).toMatchObject({ isBuffed: false, might: 1 });
    await game.p1.play("rookie");
    expect(game.p1.energy()).toBe(0);
    await game.acceptTriggerOrder(); // take the listed order if one is offered (order is irrelevant per the ruling)
    // Both triggers are on the chain at once.
    expect(game.chain().map((c) => [c.cardId, c.triggered])).toEqual(
      expect.arrayContaining([
        ["rookie", true],
        ["cithria", true],
      ]),
    );
    expect(game.chain()).toHaveLength(2);
    const first = game.chain().at(-1)?.cardId as string;
    const second = game.chain().at(0)?.cardId as string;

    // Resolve the top trigger only → Cithria gets a buff; the other trigger is still waiting.
    await resolveTop(game);
    expect(game.chain().map((c) => c.cardId)).toEqual([second]);
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
    // Priority is back with P1 BEFORE the second trigger resolves — Call to Glory (Reaction) is legal now,
    // and only via the spend-a-buff cost (P1 has 0 energy).
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "ctg")).toBe(true);
    await game.p1.cast("ctg", { payOptional: true, targets: "cithria" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("cithria").isBuffed).toBe(false); // the buff was spent as the cost
    expect(game.chain().map((c) => c.cardId)).toEqual([second, "ctg"]);
    await resolveTop(game); // Call to Glory resolves: +3 this turn
    expect(game.state("cithria")).toMatchObject({ isBuffed: false, might: 4 });
    // Now the second trigger resolves and buffs her again.
    await resolveTop(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.zoneOf("ctg")).toBe("trash");
    expect(game.zoneOf("rookie")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect([first, second].sort()).toEqual(["cithria", "rookie"]);
    // The +3 is "this turn"; the buff is permanent.
    await game.advanceTurn();
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
  });

  test("contrast — letting BOTH triggers resolve first wastes one: a unit holds at most one buff, so Cithria ends at 2 (buffed once) and Call to Glory can then only make her 1 + 3 = 4", async () => {
    const game = await board().build();
    await game.p1.play("rookie");
    await game.settle();
    expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 2 });
    await game.p1.cast("ctg", { payOptional: true, targets: "cithria" });
    await game.settle();
    expect(game.state("cithria")).toMatchObject({ isBuffed: false, might: 4 });
  });

  // Expected (383.3.d, and the ruling's "the order you stack the two triggers doesn't matter"): Pit Rookie's
  // and Cithria's triggers are simultaneous and both controlled by P1, so P1 is offered to ORDER them.
  // Actual: the engine stacks them itself (Rookie bottom, Cithria top) and goes straight to priority — no
  // `order` decision is ever surfaced for this pair (it is for e.g. two "When I attack" triggers).
  test("ruling 0e4630ccaddf5fbe — P1 should be offered the order of the two simultaneous play triggers; engine auto-stacks them", async () => {
    const game = await board().build();
    await game.p1.play("rookie");
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
  });
});
