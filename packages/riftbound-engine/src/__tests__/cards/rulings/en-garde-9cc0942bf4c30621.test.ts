/**
 * Ruling 9cc0942bf4c30621 — En Garde (OGN-046 → ogn-046-298) · Reaction · [1]
 *     "Give a friendly unit +1 [Might] this turn, then an additional +1 [Might] this turn if it is the only unit you control there."
 *   × Carnivorous Snapvine (OGN-149 → ogn-149-298) · 5+[body][body] · 6 Might
 *     "When you play me, choose an enemy unit at a battlefield. We deal damage equal to our Mights to each other."
 *   × Anivia, Primal (OGN-148 → ogn-148-298) · 8 Might
 *
 * Q: Can you react to your own "When you play me" trigger, and does En Garde give Snapvine +2 when it is alone in base?
 * A: Yes and yes. Play Snapvine → its trigger opens a chain → the active player has priority and may cast En Garde →
 *    En Garde resolves first: +1, and +1 more because Snapvine is the only unit you control "there" (base counts) → the
 *    trigger resolves with Snapvine at 8: Snapvine and Anivia deal 8 to each other and trade.
 * Rules: 340.4 (adder gets priority first), 340.1 (LIFO), 383 (own trigger is a chain item), "there" = its location.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EN_GARDE = "ogn-046-298";
const SNAPVINE = "ogn-149-298";
const ANIVIA = "ogn-148-298";

/** P1's turn: empty base, exactly [6] + body×2 (Snapvine + En Garde). P2's Anivia (8) holds bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { body: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", ANIVIA, "anivia")
    .hand(P1, SNAPVINE, "snap")
    .hand(P1, EN_GARDE, "engarde");
}

async function playSnapvine(game: Game): Promise<void> {
  await game.p1.play("snap");
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    expect(d.options.map((o) => o.card ?? o.key)).toEqual(["anivia"]);
    await game.p1.pick("anivia");
  }
}

describe("Ruling 9cc0942bf4c30621 — react to your own Snapvine trigger with En Garde; alone in base it is +2", () => {
  test("Snapvine's play trigger (→ Anivia) starts a chain and P1, the active player who added it, holds priority — En Garde is legal right now", async () => {
    const game = await board().build();
    await playSnapvine(game);
    expect(game.zoneOf("snap")).toBe("base");
    expect(game.p1.units("base")).toEqual(["snap"]); // the only unit P1 controls there
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snap", controller: P1, targets: ["anivia"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "engarde")).toBe(true);
  });

  test("En Garde on Snapvine goes on top and resolves first: +1, then +1 more (only unit P1 controls in its base) → Snapvine is 8 while its trigger is still pending", async () => {
    const game = await board().build();
    await playSnapvine(game);
    await game.p1.cast("engarde", { targets: "snap" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["snap", "engarde"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // En Garde resolves
    expect(game.zoneOf("engarde")).toBe("trash");
    expect(game.state("snap")).toMatchObject({ baseMight: 6, might: 8, mightModifier: 2 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["snap"]);
    expect(game.state("anivia").damage).toBe(0); // trigger not resolved yet
  });

  test("then the trigger resolves at 8 v 8: Snapvine and Anivia deal 8 to each other and both die", async () => {
    const game = await board().build();
    await playSnapvine(game);
    await game.p1.cast("engarde", { targets: "snap" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("anivia")).toBe("trash");
    expect(game.zoneOf("snap")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no En Garde: 6 into Anivia (survives with 6), 8 into Snapvine (dies)", async () => {
    const game = await board().build();
    await playSnapvine(game);
    await game.settle();
    expect(game.state("anivia")).toMatchObject({ damage: 6, zone: "battlefield-bf1" });
    expect(game.zoneOf("snap")).toBe("trash");
  });

  test("contrast — not alone: with another P1 unit already in base En Garde gives only +1 (Snapvine 7)", async () => {
    const game = await board().unit(P1, "base", { might: 1, name: "Roommate" }, "mate").build();
    await playSnapvine(game);
    await game.p1.cast("engarde", { targets: "snap" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("snap")).toMatchObject({ might: 7, mightModifier: 1 });
  });
});
