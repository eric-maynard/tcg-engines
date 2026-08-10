/**
 * Ruling 0558aba09eb2dde1 — Irresistible Faefolk (UNL-112 → unl-112-219) · Unit · Body · [2] · 1 Might
 *   "When I move to a battlefield, you may move an enemy unit to that battlefield."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction spell · [1] "Return a unit at a battlefield with 3 [Might]
 *     or less to its owner's hand."
 *
 * Q: Faefolk moves to a battlefield and its trigger chooses an enemy unit in base; the opponent reacts
 *    with Gust on Faefolk. Does the enemy unit still move to the battlefield?
 * A: Yes. Gust removes Faefolk, but the trigger is already on the chain and "that battlefield" was locked
 *    in when the trigger condition was met (359.3.f.3). It only needs its target (the enemy unit in base),
 *    which Gust does not touch — so it resolves and moves that unit.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IRRESISTIBLE_FAEFOLK = "unl-112-219";
const GUST = "ogn-169-298";

/** P1's turn. bf1 open and empty. P1: Faefolk in base. P2: Homebody (2) in base, Gust in hand + [1]. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", IRRESISTIBLE_FAEFOLK, "faefolk")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "homebody")
    .hand(P2, GUST, "gust")
    .resources(P2, { energy: 1 });
}

/** Faefolk moves to bf1; P1 opts in and chooses Homebody. Stops at the first priority window with the trigger still on the chain. */
async function faefolkTargetsHomebody(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("faefolk", "bf1");
  let chose = false;
  for (let i = 0; i < 8; i++) {
    const d: Decision | null = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    expect(d.seat).toBe(P1); // Faefolk's controller makes the "you may … an enemy unit" choices
    if (d.kind === "yes-no") {
      await game.p1.yes();
    } else if (d.kind === "pick") {
      const opt = d.options.find((o) => (o.card ?? o.key) === "homebody");
      expect(opt).toBeDefined();
      await game.p1.answer({ keys: [opt!.key], kind: "pick" });
      chose = true;
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(chose).toBe(true);
  return game;
}

describe("Ruling 0558aba09eb2dde1 — Gust on Faefolk in response does not stop its trigger moving the enemy unit", () => {
  test("Faefolk's trigger is on the chain targeting Homebody, and P2 gets priority to react before it resolves", async () => {
    const game = await faefolkTargetsHomebody();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "faefolk", controller: P1, triggered: true })]);
    expect(game.locationOf("homebody")).toBe("base"); // not moved yet
    // P1 (controller) holds priority first; after passing, P2 may react with Gust on Faefolk (1 Might, at a battlefield).
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "gust")).toBe(true);
    const field = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toContain("faefolk");
  });

  test("Gust resolves first (LIFO): Faefolk returns to P1's hand while its trigger is still on the chain", async () => {
    const game = await faefolkTargetsHomebody();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("gust", { targets: "faefolk" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["faefolk", "gust"]);
    // Both pass → Gust resolves.
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("faefolk")).toBe("hand");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "faefolk", triggered: true })]);
    expect(game.locationOf("homebody")).toBe("base");
  });

  test("the trigger then resolves WITHOUT Faefolk on the board: Homebody moves to bf1 — 'that battlefield' was locked at trigger time (359.3.f.3)", async () => {
    const game = await faefolkTargetsHomebody();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("gust", { targets: "faefolk" });
    await game.settle();
    expect(game.zoneOf("faefolk")).toBe("hand");
    expect(game.locationOf("homebody")).toBe("bf1");
    expect(game.chain()).toEqual([]);
    // No P1 unit is at bf1 any more, so no combat: Homebody simply stands at bf1.
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual(["homebody"]);
    expect(game.violations()).toEqual([]);
  });
});
