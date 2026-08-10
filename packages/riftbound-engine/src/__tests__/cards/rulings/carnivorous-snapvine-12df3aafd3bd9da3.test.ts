/**
 * Ruling 12df3aafd3bd9da3 — Carnivorous Snapvine (OGN-149 → ogn-149-298) × En Garde (OGN-046 → ogn-046-298)
 *                           × Discipline (OGN-058 → ogn-058-298)
 *   Snapvine: 5 + [body][body], 6 Might — "When you play me, choose an enemy unit at a battlefield. We deal damage
 *   equal to our Mights to each other."
 *   En Garde: 1 [Reaction] "Give a friendly unit +1 [Might] this turn, then an additional +1 [Might] this turn if it
 *   is the only unit you control there."
 *   Discipline: 2 [Reaction] "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: Can I play Snapvine on my turn and respond to its own trigger with En Garde and Discipline to boost it?
 * A: Yes: play Snapvine → its trigger goes on the chain → hold priority and cast En Garde → hold priority and cast
 *    Discipline. (They resolve first, so the trigger then uses the boosted Might.)
 * Rules: 340.4 (the player who added the newest item gets priority first — "holding priority"), 340.1 (LIFO),
 *        Might read at resolution.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SNAPVINE = "ogn-149-298";
const EN_GARDE = "ogn-046-298";
const DISCIPLINE = "ogn-058-298";

/** P1's turn, empty base (so Snapvine will be "the only unit you control there"). P2's 9-Might Behemoth at bf1. Exact 8 energy / 2 body. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { body: 2 } }) // 5+[body][body] + 1 + 2
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Behemoth" }, "behemoth")
    .deck(P1, ["ogn-175-298"], ["topcard"])
    .hand(P1, SNAPVINE, "snap")
    .hand(P1, EN_GARDE, "engarde")
    .hand(P1, DISCIPLINE, "disc");
}

async function playSnapvine(game: Game): Promise<void> {
  await game.p1.play("snap");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("behemoth");
  }
}

describe("Ruling 12df3aafd3bd9da3 — respond to your own Snapvine trigger with En Garde + Discipline", () => {
  test("play Snapvine: it lands in base and its trigger (→ Behemoth) is on the chain with P1 — who added it — holding priority (340.4)", async () => {
    const game = await board().build();
    await playSnapvine(game);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 0 } });
    expect(game.zoneOf("snap")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snap", controller: P1, targets: ["behemoth"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "engarde")).toBe(true);
    expect(game.p1.can("cast", "disc")).toBe(true);
  });

  test("holding priority: En Garde on Snapvine, then — still P1's priority — Discipline on Snapvine; chain = [trigger, En Garde, Discipline]", async () => {
    const game = await board().build();
    await playSnapvine(game);
    await game.p1.cast("engarde", { targets: "snap" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["snap", "engarde"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // priority returns to the adder
    await game.p1.cast("disc", { targets: "snap" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["snap", "engarde", "disc"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("resolution (LIFO): Discipline +2 & draw, En Garde +1 +1 (alone in base) → Snapvine is 10 when its trigger resolves: Behemoth (9) takes 10 and dies; Snapvine takes 9 and survives", async () => {
    const game = await board().build();
    await playSnapvine(game);
    await game.p1.cast("engarde", { targets: "snap" });
    await game.p1.cast("disc", { targets: "snap" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("snap")).toMatchObject({ baseMight: 6, damage: 9, might: 10, zone: "base" });
    expect(game.zoneOf("behemoth")).toBe("trash");
    expect(game.p1.hand()).toEqual(["topcard"]); // Discipline's draw
    expect(game.zoneOf("engarde")).toBe("trash");
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: without the boosts the 6-Might Snapvine trades 6 into the 9-Might Behemoth (survives with 6) and takes 9 itself — Snapvine dies", async () => {
    const game = await board().build();
    await playSnapvine(game);
    await game.settle();
    expect(game.state("behemoth")).toMatchObject({ damage: 6, zone: "battlefield-bf1" });
    expect(game.zoneOf("snap")).toBe("trash");
  });
});
