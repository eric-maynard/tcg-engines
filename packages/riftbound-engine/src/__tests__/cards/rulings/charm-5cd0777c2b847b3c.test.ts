/**
 * Ruling 5cd0777c2b847b3c — Charm (OGN-043 → ogn-043-298) · Calm spell · [1][calm] "Move an enemy unit."
 *   × Gust (OGN-169 → ogn-169-298) · Chaos Reaction · [1] "Return a unit at a battlefield with 3 [Might] or less to its
 *     owner's hand."
 *
 * Q: Charm is moving an opponent's unit to a battlefield; in response Gust removes the (sole) unit of the player who
 *    controls that battlefield. When Charm resolves into the now-empty battlefield, does the moved unit conquer/score?
 * A: Yes. Gust resolves first — the battlefield loses its controller. Charm then moves the enemy unit into the empty
 *    battlefield; its controller conquers it and scores a point.
 * Rules: 340 (LIFO), 181.4 (control of a battlefield follows unit presence), 444/445 (conquer → score 1),
 *        movement by effect still establishes control.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const GUST = "ogn-169-298";

/**
 * P1's turn. P1 controls bf1 with a lone 2-Might Sentinel; P2's 4-Might Wanderer idles in P2's base (bf2 is P2's,
 * empty). P1: Charm + exactly [1][calm]. P2: Gust + exactly [1]. Scores 0–0.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Sentinel" }, "sentinel")
    .unit(P2, "base", { might: 4, name: "Wanderer" }, "wanderer")
    .hand(P1, CHARM, "charm")
    .hand(P2, GUST, "gust");
}

/** P1 Charms the Wanderer toward bf1 and passes; P2 Gusts the Sentinel; chain = [charm, gust]. */
async function charmThenGust(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("charm", { targets: "wanderer" });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("battlefield-bf1");
  await game.p1.pick("battlefield-bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", controller: P1, targets: ["wanderer"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "gust")).toBe(true);
  await game.p2.cast("gust", { targets: "sentinel" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm", "gust"]);
  return game;
}

describe("Ruling 5cd0777c2b847b3c — Gust empties the battlefield, then the Charmed unit walks in and conquers", () => {
  test("Gust resolves first (LIFO): the Sentinel returns to P1's hand — P1 has no unit left at bf1; Charm is still pending and the Wanderer hasn't moved", async () => {
    const game = await charmThenGust();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("sentinel")).toBe("hand");
    expect(game.p1.hand()).toContain("sentinel");
    expect(game.p1.units("bf1")).toEqual([]);
    // (323.6: control of an unoccupied battlefield is formally dropped at the first OPEN-state cleanup — i.e. as soon as
    //  the chain empties — so the engine may still list P1 here while Charm is pending; it is gone before the move matters.)
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
    expect(game.locationOf("wanderer")).toBe("base");
    expect(game.p2.points()).toBe(0);
  });

  test("Charm resolves: the Wanderer moves (ready — not a Standard Move) into bf1; P1 has LOST control (no units), bf1 is contested by P2 and a non-combat showdown opens there (nobody to fight)", async () => {
    const game = await charmThenGust();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("wanderer")).toBe("bf1");
    expect(game.state("wanderer")).toMatchObject({ controller: P2, isReady: true });
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.p2.points()).toBe(0); // not yet — the showdown must close first
  });

  test("ruling: both pass through the showdown → P2 CONQUERS bf1 and scores 1 (on P1's turn); P1 is back in an open main phase", async () => {
    const game = await charmThenGust();
    const first = await game.settle();
    if (first.reason !== "open" || game.decision()?.kind !== "action" || (game.decision() as { context?: string }).context !== "main") {
      await game.settle(); // the auto-begun showdown is handed back once; settle on through it
    }
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.locationOf("wanderer")).toBe("bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no Gust: the Wanderer is Charmed into P1's DEFENDED bf1 instead; that is a fight, not a free conquer — P2 scores nothing on arrival", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "wanderer" });
    await game.p1.pick("battlefield-bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Charm resolves
    expect(game.locationOf("wanderer")).toBe("bf1");
    expect(game.zoneOf("sentinel")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });
});
