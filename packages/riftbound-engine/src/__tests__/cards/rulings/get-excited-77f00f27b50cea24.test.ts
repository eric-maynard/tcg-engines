/**
 * Ruling 77f00f27b50cea24 — Get Excited! (OGN-008 → ogn-008-298) · Action · 2 + [fury] · "Discard 1. Deal its Energy cost as
 *   damage to a unit at a battlefield."   × Warwick, Hunter (OGN-159 → ogn-159-298) · 5 Might · "I enter ready. When I attack,
 *   kill all damaged enemy units here."   (Bullet Time ogn-268-298 is only how Warwick got there in the asker's game.)
 *
 * Q: Can Get Excited (an Action) be used to kill Warwick in response to his "When I attack" trigger?
 * A: No. The attack trigger goes straight onto the chain, so the state is Closed before the defender can act; Actions need an
 *    Open state (no chain). Only after the trigger has resolved, in the showdown's Open state, may an Action be played —
 *    and non-Action/non-Reaction cards not even then (they need a neutral Open state outside showdowns).
 * Rules: 336–337 (Closed state: Reactions only), 341–343 (Actions in showdowns start chains), 383.4.e (attack triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GET_EXCITED = "ogn-008-298";
const WARWICK = "ogn-159-298";
/** A 5-cost card for P2 to discard: 5 damage would kill the 5-Might Warwick. */
const HEAVY = { cardType: "unit", energyCost: 5, might: 5, name: "Heavy" } as const;
const GRUNT = { cardType: "unit", energyCost: 0, might: 1, name: "Grunt" } as const;

/** P1's turn 3. P2 holds bf1 with a DAMAGED Wounded (4, 1 dmg). Warwick ready in P1's base. P2: Get Excited + Heavy + Grunt, 2 + [fury]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Wounded" }, "wounded", { damage: 1 })
    .unit(P2, "bf1", { might: 2, name: "Healthy" }, "healthy")
    .unit(P1, "base", WARWICK, "ww")
    .hand(P2, GET_EXCITED, "ge")
    .hand(P2, HEAVY, "heavy")
    .hand(P2, GRUNT, "grunt");
}

async function warwickAttacks(game: Game): Promise<void> {
  await game.p1.move("ww", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", controller: P1, triggered: true })]);
  expect(game.zoneOf("wounded")).toBe("battlefield-bf1");
}

describe("Ruling 77f00f27b50cea24 — no Action window before Warwick's attack trigger resolves", () => {
  test("the moment Warwick attacks his trigger is already on the chain (Closed state); when P2 gets priority Get Excited is NOT legal and the attempt is refused", async () => {
    const game = await board().build();
    await warwickAttacks(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ge")).toBe(false);
    const r = await game.p2.try((p) => p.cast("ge", { targets: "ww" }));
    expect(r.ok).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ww"]);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { fury: 1 } });
  });

  test("both pass → the trigger resolves with Warwick alive: the damaged Wounded is killed (the undamaged Healthy is not)", async () => {
    const game = await board().build();
    await warwickAttacks(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("wounded")).toBe("trash");
    expect(game.zoneOf("healthy")).toBe("battlefield-bf1");
    expect(game.locationOf("ww")).toBe("bf1");
  });

  test("nuance: afterwards, in the showdown's Open state with Focus, P2 MAY cast Get Excited (an Action starts a new chain) — but a plain unit (neither Action nor Reaction) is still not playable there", async () => {
    const game = await board().build();
    await warwickAttacks(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    for (let i = 0; i < 4 && game.actingSeat() !== P2; i++) {
      await game.acting().pass();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([]);
    expect(game.p2.can("play", "grunt")).toBe(false); // non-Action permanent: neutral Open state only
    expect(game.p2.can("cast", "ge")).toBe(true);
    await game.p2.cast("ge", { targets: "ww" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ge"]);
    // Resolve it discarding Heavy (5) → 5 damage kills Warwick — legal now, just too late for the Wounded.
    for (let i = 0; i < 8 && game.zoneOf("ge") !== "trash"; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick("heavy");
      } else if (d?.kind === "action") {
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("heavy");
    }
    expect(game.zoneOf("heavy")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.zoneOf("wounded")).toBe("trash"); // it stayed dead
    expect(game.violations()).toEqual([]);
  });
});
