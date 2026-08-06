/**
 * Ruling eebe0a6ee791f8a1 — Temporal Breach (ven-066-166) · Spell · Mind · 2 + [mind]
 *   "[Hidden] Banish a unit, then its owner plays it to the same location, ignoring its cost."
 *   × Sprite token (ogn-274-298) · 3-Might unit token · "[Temporary]"
 *
 * Q: What happens if Temporal Breach banishes a TOKEN unit?
 * A: The token stops existing the moment it is banished, so there is nothing to replay. Banishment is a
 *    non-board zone (056.1); tokens exist only on the board or the chain and cease to exist immediately on
 *    entering any other zone (186, 186.1). By the time "then its owner plays it" would apply the token is
 *    gone, so that part does nothing (055).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TEMPORAL_BREACH = "ven-066-166";
const SPRITE_TOKEN = "ogn-274-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn with exactly Breach's cost. P2 has a Sprite token and a damaged real unit at bf1. */
function board() {
  return (
    scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      // Engine convention: token instances carry a "token-" id prefix.
      .unit(P2, "bf1", SPRITE_TOKEN, "token-sprite")
      .unit(P2, "bf1", { might: 4, name: "Veteran" }, "veteran", { damage: 2 })
      .hand(P1, TEMPORAL_BREACH, "breach")
  );
}

const BOARD_OR_BANISH = (z: string) => z === "base" || z.startsWith("battlefield-") || z === "banishment" || z === "chain";

/** Where (if anywhere meaningful) the Sprite token still is. */
function spriteWhereabouts(game: Game): string[] {
  return game.findAll({ defId: SPRITE_TOKEN }).map((id) => game.zoneOf(id)).filter(BOARD_OR_BANISH);
}

describe("Ruling eebe0a6ee791f8a1 — Temporal Breach on a token: it ceases to exist, nothing is replayed", () => {
  test.failing("BUG: ruling eebe0a6ee791f8a1 — Breach the Sprite token: it is banished, immediately ceases to exist (not on board, not lingering in banishment), its owner is asked nothing and nothing is replayed; engine has no implementation (no target, no-op)", async () => {
    // Expected: token gone for good; P2 gets no prompt; play returns to P1's main phase. Actual: Temporal
    // Breach offers no targets and resolves doing nothing — the Sprite is still at bf1.
    const game = await board().build();
    expect(game.state("token-sprite").isToken).toBe(true);
    await game.p1.cast("breach", { targets: "token-sprite" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    // No "where do you play it" (or any) question for the token's owner.
    const d = game.decision();
    expect(d?.seat === P2 && d.kind !== "action").toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // The token is nowhere that matters: not at bf1/base, not on the chain, not sitting in banishment (186.1).
    expect(spriteWhereabouts(game)).toEqual([]);
    expect(game.p2.units("bf1")).toEqual(["veteran"]);
    expect(game.p2.units("base")).toEqual([]);
    expect(game.zoneOf("breach")).toBe("trash");
  });

  test.failing("BUG: ruling eebe0a6ee791f8a1 — contrast on a real (non-token) unit: it is banished and then its owner replays it to the SAME location as a fresh object (damage gone), no destination choice; engine no-ops", async () => {
    const game = await board().build();
    await game.p1.cast("breach", { targets: "veteran" });
    await game.settle({ policy: "first" }); // accept any forced/optional confirmation on P2's side
    expect(game.zoneOf("veteran")).toBe("battlefield-bf1");
    expect(game.state("veteran").owner).toBe(P2);
    expect(game.state("veteran").controller).toBe(P2);
    expect(game.state("veteran").damage).toBe(0); // new object after banish → replay
    expect(game.p2.banishment()).not.toContain("veteran");
    expect(spriteWhereabouts(game)).toEqual(["battlefield-bf1"]); // the token was not involved
    expect(game.zoneOf("breach")).toBe("trash");
  });
});
