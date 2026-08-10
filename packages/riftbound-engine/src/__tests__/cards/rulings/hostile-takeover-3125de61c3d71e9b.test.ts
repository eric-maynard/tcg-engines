/**
 * Ruling 3125de61c3d71e9b — Hostile Takeover (SFD-202 → sfd-202-221) · Spell · [5][rainbow][rainbow] · "Take control of an enemy
 *     unit at a battlefield. Ready it. … Lose control of that unit and recall it at end of turn."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · Action · [2][order] · "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: If I Hostile Takeover an enemy unit, can I Hidden Blade it and draw 2?
 * A: Yes. Until end of turn you are its controller; it is a unit at a battlefield, so a legal Blade target; when Blade
 *    resolves and kills it, "its controller" is you → you draw 2. (If the unit leaves the battlefield before Blade
 *    resolves, the target is illegal and nobody draws.)
 * Rules: 477.1.a (control-changing effect), 740.1 (friendly/enemy by controller), 359.3.e.14 (its controller = at that
 *        time), 359.3.f.2 (illegal target on resolution → no effect), 428.2 (killed → owner's trash).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const HIDDEN_BLADE = "ogn-213-298";
const GUST = "ogn-169-298"; // P2's Reaction: "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
const SKULKER = "ogn-175-298";

/**
 * P1's turn. P2 holds bf1 with a lone 3-Might Pawn. P1: Hostile Takeover + Hidden Blade and exactly [7] + 3 order (HT 5+2, Blade 2+1).
 * P2: Gust + [1]. Known deck tops on both sides.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { order: 3 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Pawn" }, "pawn")
    .hand(P1, HOSTILE_TAKEOVER, "ht")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, GUST, "gust")
    .deck(P1, [SKULKER, SKULKER, SKULKER], ["d1", "d2", "d3"])
    .deck(P2, [SKULKER, SKULKER, SKULKER], ["e1", "e2", "e3"]);
}

/** Cast Hostile Takeover on the Pawn and settle through the (unopposed) showdown → P1 conquers bf1 with it. */
async function takeover(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ht", { targets: "pawn" });
  expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1 } });
  for (let i = 0; i < 4; i++) {
    const r = await game.settle();
    if (r.reason === "open" && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "main") {
      break;
    }
  }
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 3125de61c3d71e9b — Hidden Blade on a unit taken with Hostile Takeover: I am its controller, so I draw 2", () => {
  test("1. control: after Hostile Takeover P1 controls the (P2-owned) Pawn at bf1, it is ready, and P1 conquered bf1 with it", async () => {
    const game = await takeover();
    expect(game.state("pawn")).toMatchObject({ controller: P1, isReady: true, owner: P2, zone: "battlefield-bf1" });
    expect(game.p1.units("bf1")).toEqual(["pawn"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("2. targeting: the stolen Pawn is a legal Hidden Blade target for P1 ('a unit at a battlefield')", async () => {
    const game = await takeover();
    const targets = (game.p1.option("cast", "blade")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toEqual(["pawn"]);
    expect(game.p1.can("cast", "blade")).toBe(true);
  });

  test("3. resolution: Blade kills it (→ its OWNER's, P2's, trash) and 'its controller draws 2' pays P1 — d1, d2 — while P2 draws nothing", async () => {
    const game = await takeover();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "pawn" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.p2.trash()).toContain("pawn");
    expect(game.p1.trash()).not.toContain("pawn");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]); // ht + blade spent, 2 drawn
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p2.deck()[0]).toBe("e1");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("note: if the unit leaves the battlefield before Blade resolves (P2 Gusts it back to hand in response), the target is illegal — no kill, and NOBODY draws", async () => {
    const game = await takeover();
    const p2HandBefore = game.p2.hand().length; // gust + whatever
    await game.p1.cast("blade", { targets: "pawn" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.cast("gust", { targets: "pawn" });
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("hand"); // back in its owner's hand
    expect(game.p2.hand()).toContain("pawn");
    expect(game.p1.hand()).toEqual([]); // no draw for P1
    expect(game.p1.deck()[0]).toBe("d1");
    expect(game.p2.hand()).toHaveLength(p2HandBefore - 1 + 1); // spent Gust, got the Pawn back, drew nothing
    expect(game.p2.deck()[0]).toBe("e1");
    expect(game.zoneOf("blade")).toBe("trash");
  });
});
