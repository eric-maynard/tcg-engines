/**
 * Ruling ab14aa9a7273fbb5 — Elder Dragon (UNL-118 → unl-118-219) · [12]+body×4 · 10 Might · "Any amount of your damage is enough to
 *     kill enemy units. When you play me, choose up to one enemy unit at each location. Deal 1 to them."
 *   × Star-Crossed (UNL-128 → unl-128-219) · Reaction · [3][chaos] · "Return a friendly unit and an enemy unit to their owners' hands."
 *   (prior damage source: Bellows Breath sfd-080-221 "Deal 1 to up to three units at the same location.")
 *
 * Q: My units carry damage from the opponent's Bellows Breath. They play Elder Dragon; I Star-Cross in reaction to its trigger.
 *    Do my damaged units die before Star-Crossed resolves?
 * A: Yes. Elder Dragon's passive is live the instant it enters: units with any of that player's damage are lethal and are
 *    cleaned up before the "When you play me" trigger is even finalized — before you ever get priority. Star-Crossed can no
 *    longer name them. The play trigger still resolves and deals its 1 afterwards.
 * Rules: 334 (outstanding cleanups before finalizing the trigger), 320–323 (cleanup kills lethal units), 383, 336–340.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const STAR_CROSSED = "unl-128-219";
const BELLOWS_BREATH = "sfd-080-221";

/**
 * P2's turn with [13] + mind + body×4 (Bellows, then Elder Dragon). P1: V1 (3) and V2 (3) at P1's bf1, an undamaged Healthy (3) in
 * base, Star-Crossed in hand with [3][chaos].
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 13, power: { body: 4, mind: 1 } })
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "V1" }, "v1")
    .unit(P1, "bf1", { might: 3, name: "V2" }, "v2")
    .unit(P1, "base", { might: 3, name: "Healthy" }, "healthy")
    .hand(P2, BELLOWS_BREATH, "bellows")
    .hand(P2, ELDER_DRAGON, "elder")
    .hand(P1, STAR_CROSSED, "sc");
}

/** Bellows Breath marks 1 (of P2's) damage on V1 and V2; then P2 plays Elder Dragon to base. Stops at the very next decision. */
async function bellowsThenElder(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("bellows", { targets: ["v1", "v2"] });
  await game.settle();
  expect(game.state("v1")).toMatchObject({ damage: 1, zone: "battlefield-bf1" }); // damaged but alive (1 < 3)
  expect(game.state("v2")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
  await game.p2.play("elder");
  expect(game.zoneOf("elder")).toBe("base");
  expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0, mind: 0 } });
  return game;
}

describe("Ruling ab14aa9a7273fbb5 — Elder Dragon's entry kills already-damaged enemies before anyone can Star-Cross them", () => {
  test("the instant Elder Dragon is on the board — while P2 is still FINALIZING its play trigger (choosing targets), before any priority — V1 and V2 are already in the trash; only Healthy remains to be chosen", async () => {
    const game = await bellowsThenElder();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "elder" }, timing: "FIN" });
    expect(game.zoneOf("v1")).toBe("trash");
    expect(game.zoneOf("v2")).toBe("trash");
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["healthy"]); // no unit left at bf1 to choose
    expect(game.p1.units("bf1")).toEqual([]);
  });

  test("when P1 finally gets priority (trigger on the chain → Healthy), Star-Crossed can only name a LIVING friendly unit: its sole legal pair is [Healthy, Elder Dragon] — V1/V2 cannot be returned", async () => {
    const game = await bellowsThenElder();
    await game.p2.pick("healthy");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "elder", controller: P2, targets: ["healthy"], triggered: true })]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    const pairs = game.p1.option("cast", "sc")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(pairs).toEqual([["healthy", "elder"]]);
    expect((await game.p1.try((p) => p.cast("sc", { targets: ["v1", "elder"] }))).ok).toBe(false);
    expect(game.zoneOf("v1")).toBe("trash");
    expect(game.zoneOf("v2")).toBe("trash");
  });

  test("P1 Star-Crosses [Healthy, Elder Dragon] instead: both bounce (LIFO), the play trigger still resolves afterwards (its target is gone, so no damage lands) — and V1/V2 stay dead", async () => {
    const game = await bellowsThenElder();
    await game.p2.pick("healthy");
    await game.p2.passPriority();
    await game.p1.cast("sc", { targets: ["healthy", "elder"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["elder", "sc"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("elder")).toBe("hand");
    expect(game.zoneOf("healthy")).toBe("hand");
    expect(game.p1.trash().sort()).toEqual(["sc", "v1", "v2"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("no response: the trigger resolves and deals its 1 to Healthy — with the Dragon in play that 1 is lethal too", async () => {
    const game = await bellowsThenElder();
    await game.p2.pick("healthy");
    await game.settle();
    expect(game.zoneOf("healthy")).toBe("trash");
    expect(game.p1.units()).toEqual([]);
    expect(game.zoneOf("elder")).toBe("base");
  });
});
