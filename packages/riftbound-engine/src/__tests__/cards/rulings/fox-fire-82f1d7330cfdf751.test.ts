/**
 * Ruling 82f1d7330cfdf751 — Fox-Fire (OGN-256 → ogn-256-298) · [Hidden][Action] · 3
 *     "Kill any number of units at a battlefield with total Might 4 or less."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · [Hidden][Action] · 2 "Move a unit from a battlefield to its base."
 *
 * Q: Opponent Fox-Fires my 4-Might unit; can I react with a HIDDEN Fight or Flight to pull it home, and does Fox-Fire
 *    then get to retarget?
 * A: Yes you can (a facedown card plays as a Reaction for [0]); it resolves first and moves the unit. Fox-Fire does NOT
 *    retarget: on resolution its target is illegal (no longer at a battlefield) and nothing is killed. With several
 *    original targets, only the still-legal ones (total ≤ 4) can be killed.
 * Rules: 811 (play from Hidden = Reaction, cost 0), 340.1 (LIFO), 355.11 / 359.3.f.2 (targets re-checked on
 *        resolution; no new targets), 355.11.b (subset of the ORIGINAL targets).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FOX_FIRE = "ogn-256-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/**
 * Turn 3, P2 active with [3] and Fox-Fire in hand. P1 holds bf1 with Big (4), Small (2) and Other (2), and hid Fight or
 * Flight there on an earlier turn.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Big" }, "big")
    .unit(P1, "bf1", { might: 2, name: "Small" }, "small")
    .unit(P1, "bf1", { might: 2, name: "Other" }, "other")
    .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "fof")
    .hand(P2, FOX_FIRE, "fox");
}

/** P2 casts Fox-Fire on `targets` and passes; P1 flips the hidden Fight or Flight choosing `pull` (→ base). */
async function foxThenFlight(targets: string[], pull: string): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("fox", { targets });
  expect(game.p2.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fox", controller: P2 })]);
  expect([...(game.chain()[0]?.targets ?? [])].sort()).toEqual([...targets].sort());
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "fof")).toBe(true);
  expect(game.p1.energy()).toBe(0); // played from hidden for [0]
  await game.p1.reveal("fof", { answers: [pull] });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick(pull);
  }
  expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([
    ["fox", expect.anything()],
    ["fof", [pull]],
  ]);
  return game;
}

describe("Ruling 82f1d7330cfdf751 — hidden Fight or Flight dodges Fox-Fire; Fox-Fire never retargets", () => {
  test("Fox-Fire on Big (4): P1 reacts with the facedown Fight or Flight for [0]; it resolves FIRST and Big is home in base while Fox-Fire still waits", async () => {
    const game = await foxThenFlight(["big"], "big");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("big")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fox", targets: ["big"] })]);
  });

  test("Fox-Fire then resolves on an illegal target (Big is not at a battlefield): nothing dies, and P2 is NOT offered a new target — Small/Other at bf1 are untouched", async () => {
    const game = await foxThenFlight(["big"], "big");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Fight or Flight
    await game.p2.passPriority();
    await game.p1.passPriority(); // Fox-Fire
    // No retarget prompt for P2 at any point:
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fox")).toBe("trash");
    expect(game.state("big")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
    expect(game.zoneOf("other")).toBe("battlefield-bf1");
    expect(game.p1.units().sort()).toEqual(["big", "other", "small"]);
    expect(game.violations()).toEqual([]);
  });

  test("multi-target nuance: Fox-Fire on Small + Other (2 + 2); Fight or Flight pulls Small home → on resolution only the still-legal ORIGINAL target Other dies; Small lives, Big never at risk", async () => {
    const game = await foxThenFlight(["small", "other"], "small");
    // Drain: FoF resolves, then Fox-Fire; if P2 is asked for a subset of its original targets, only Other is legal.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else if (d.kind === "pick") {
        expect(d.seat).toBe(P2);
        expect(d.options.map((o) => o.card ?? o.key)).not.toContain("big");
        expect(d.options.map((o) => o.card ?? o.key)).not.toContain("small");
        await game.p2.pick("other");
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("small")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.zoneOf("other")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
  });

  test("control: with no reaction Fox-Fire simply kills Big (4 ≤ 4)", async () => {
    const game = await board().build();
    await game.p2.cast("fox", { targets: ["big"] });
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.state("fof")).toMatchObject({ isHidden: true, zone: "facedown-bf1" });
  });
});
