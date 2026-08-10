/**
 * Ruling 73a830e39f4e36a4 — Reaver's Row (OGN-285 → ogn-285-298, Battlefield) "When you defend here, you may move a friendly unit
 *     here to base."
 *   × Warwick, Hunter (OGN-159 → ogn-159-298) 5 Might "I enter ready. When I attack, kill all damaged enemy units here."
 *
 * Q: Warwick attacks my Reaver's Row where I have a damaged unit. Can I use the Row to pull that unit to base before Warwick's
 *    attack trigger kills it?
 * A: Yes. The attacker's trigger (Warwick) goes on the chain first, the defender's (Reaver's Row) second; LIFO means the Row
 *    resolves first and moves the unit to base. When Warwick's trigger resolves the unit is no longer "here" and survives.
 * Rules: 383.4.e–f (attack triggers before defend triggers on the initial chain), 383 (LIFO), 359.3.f ("here" read on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const WARWICK = "ogn-159-298";

/** P2's turn. P1 holds Reaver's Row (live text) with a damaged Wounded (3, 1 dmg) and a healthy Guard (4). P2's ready Warwick in base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 3, name: "Wounded" }, "wounded", { damage: 1 })
    .unit(P1, "row", { might: 4, name: "Guard" }, "guard")
    .unit(P2, "base", WARWICK, "ww");
}

const ids = (game: Game) => game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`);

/** Warwick attacks the Row; P1 opts into the Row trigger targeting Wounded. Returns with both triggers on the chain. */
async function attackAndOptIn(): Promise<Game> {
  const game = await board().build();
  expect(game.state("wounded").damage).toBe(1);
  await game.p2.move("ww", "row");
  // The defender's "you may" trigger asks P1 at finalization (opt-in, then target).
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" } });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "row" } });
  await game.p1.pick("wounded");
  return game;
}

describe("Ruling 73a830e39f4e36a4 — Reaver's Row (defender trigger) resolves before Warwick's attack trigger and rescues the damaged unit", () => {
  test("chain order: Warwick's attack trigger is item 1 (bottom), Reaver's Row's defend trigger is item 2 (top)", async () => {
    const game = await attackAndOptIn();
    expect(ids(game)).toEqual(["ww*", "row*"]);
    expect(game.chain()[0]).toMatchObject({ cardId: "ww", controller: P2, triggered: true });
    expect(game.chain()[1]).toMatchObject({ cardId: "row", controller: P1, targets: ["wounded"], triggered: true });
    expect(game.locationOf("wounded")).toBe("row"); // nothing has resolved yet
  });

  test("LIFO: the Row resolves first — Wounded moves to P1's base while Warwick's trigger is still waiting", async () => {
    const game = await attackAndOptIn();
    for (let i = 0; i < 4 && game.chain().length > 1; i++) {
      await game.acting().passPriority();
    }
    expect(ids(game)).toEqual(["ww*"]);
    expect(game.locationOf("wounded")).toBe("base");
    expect(game.state("wounded").damage).toBe(1); // still damaged — just not "here" any more
  });

  test("then Warwick's trigger resolves: Wounded is not 'here' → NOT killed; the undamaged Guard is untouched; combat proceeds Warwick (5) vs Guard (4)", async () => {
    const game = await attackAndOptIn();
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("wounded")).toBe("base");
    expect(game.zoneOf("guard")).toBe("battlefield-row");
    await game.settle();
    expect(game.zoneOf("wounded")).toBe("base"); // survived the whole combat
    expect(game.p1.trash()).not.toContain("wounded");
    expect(game.zoneOf("guard")).toBe("trash"); // 5 into 4
    expect(game.zoneOf("ww")).toBe("battlefield-row"); // 4 into 5 — survives and conquers
    expect(game.gameState.battlefields.row?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("control: if P1 declines the Row trigger, Warwick's trigger kills the damaged Wounded before combat damage", async () => {
    const game = await board().build();
    await game.p2.move("ww", "row");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    expect(ids(game)).toEqual(["ww*"]);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("wounded")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-row");
  });
});
