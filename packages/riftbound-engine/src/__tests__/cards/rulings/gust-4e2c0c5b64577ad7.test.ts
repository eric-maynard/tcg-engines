/**
 * Ruling 4e2c0c5b64577ad7 — Gust (OGN-169 → ogn-169-298) · [Reaction] · 1 "Return a unit at a battlefield with 3 [Might]
 *   or less to its owner's hand."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield "When you defend here, you may move a friendly unit here to base."
 *   × Pouty Poro (OGN-013 → ogn-013-298) · 2 Might · [Deflect]
 *
 * Q: Can Gust be played in reaction to the Reaver's Row trigger, before the Poro is actually sent home?
 * A: Yes. The Row trigger goes on the showdown's Initial Chain like any trigger; its target (the Poro) is chosen as it
 *    triggers; both players may then play Reactions (Gust) before it resolves and the move happens.
 *    (The ruling words the "whether to return" choice as made on resolution; under current CR 383.3.a a leading
 *    "you may" is decided at finalization — either way the MOVE itself only happens on resolution, after reactions.)
 * Rules: 383.3 / 383.3.a (trigger on the chain; opt-in + target at finalization), 336 (Reactions on a chain),
 *        359.3.e.5 (target gone → nothing happens), 464.2 (initial chain of a combat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const REAVERS_ROW = "ogn-285-298";
const POUTY_PORO = "ogn-013-298";

/** P2's turn. P1 holds a LIVE Reaver's Row with Pouty Poro (2, Deflect) and Big (4). P2: Raider (5) in base, Gust in hand,
 *  2 energy + 1 power (the Poro's Deflect tax for choosing it). */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { rainbow: 1 } })
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", POUTY_PORO, "poro")
    .unit(P1, "row", { might: 4, name: "Big" }, "big")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P2, GUST, "gust");
}

/** Raider attacks; P1 opts into the Row trigger choosing the Poro; P1 passes → P2 holds priority with the trigger pending. */
async function rowTriggerTargetsPoro(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "row");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" }, timing: "FIN" });
  await game.p1.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "row" }, timing: "FIN" });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["big", "poro"]);
  await game.p1.pick("poro");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, targets: ["poro"], triggered: true })]);
  expect(game.locationOf("poro")).toBe("row"); // chosen, but NOT moved yet
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 4e2c0c5b64577ad7 — Gust may answer the Reaver's Row trigger before the Poro goes home", () => {
  test("the Row trigger sits on the initial chain with the Poro as its declared target, and P2 — holding priority — CAN cast Gust on the Poro on top of it", async () => {
    const game = await rowTriggerTargetsPoro();
    expect(game.p2.can("cast", "gust")).toBe(true);
    const offered = new Set((game.p2.option("cast", "gust")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat() as string[]);
    expect(offered).toContain("poro");
    expect(offered).not.toContain("big"); // 4 Might > 3
    await game.p2.cast("gust", { targets: "poro" });
    expect(game.p2.resources()).toEqual({ energy: 1, power: { rainbow: 0 } }); // 1 + the Deflect [rainbow]
    expect(game.chain().map((c) => c.cardId)).toEqual(["row", "gust"]);
    expect(game.locationOf("poro")).toBe("row"); // still nothing has moved
  });

  test("Gust resolves first (Poro → P1's hand); the Row trigger then resolves with its target gone and moves nothing — Big stays and defends", async () => {
    const game = await rowTriggerTargetsPoro();
    await game.p2.cast("gust", { targets: "poro" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("poro")).toBe("hand");
    expect(game.p1.hand()).toContain("poro");
    expect(game.chain().map((c) => c.cardId)).toEqual(["row"]);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      const d = game.decision();
      expect(d?.kind === "pick" && d.seat === P1).toBe(false); // no re-pick onto Big
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("big")).toBe("row");
    expect(game.p1.units("base")).toEqual([]);
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.active).toBe(true); // combat still to be fought
  });

  test("contrast — nobody reacts: the trigger resolves and only THEN is the Poro moved to base", async () => {
    const game = await rowTriggerTargetsPoro();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("poro")).toBe("base");
    expect(game.locationOf("big")).toBe("row");
    expect(game.violations()).toEqual([]);
  });
});
