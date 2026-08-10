/**
 * Ruling 68f7eac6912c6a20 — Star-Crossed (UNL-128 → unl-128-219) · Chaos Reaction · [3][chaos]
 *     "Return a friendly unit and an enemy unit to their owners' hands."
 *   × Thrill of the Hunt (UNL-184 → unl-184-219) · Fury/Body Reaction · [2][rainbow] "Banish a friendly unit, then its owner
 *     plays it to any battlefield, ignoring its cost."
 *
 * Q: I play Star-Crossed; my opponent answers with Thrill of the Hunt on the enemy unit I chose. Does Star-Crossed resolve?
 * A: Yes, partially. Thrill resolves first: the unit is banished (a non-board zone) and re-played — a NEW object, so my
 *    targeting of it is severed. Star-Crossed then returns MY unit to hand and ignores the instruction on the enemy unit.
 * Rules: 340 (LIFO), 359.3.e.4/.5/.8 (zone change → new object → illegal target unaffected; the rest still resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";
const THRILL = "unl-184-219";

/**
 * P1's turn with exactly [3][chaos]; P1's 2-Might Pawn in base. P2's 4-Might Hunter in P2's base, P2 holds bf1 with a Guard
 * and has Thrill of the Hunt + exactly [2][rainbow]. bf2 is empty.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .resources(P2, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 2, name: "Pawn" }, "pawn")
    .unit(P2, "base", { might: 4, name: "Hunter" }, "hunter")
    .hand(P1, STAR_CROSSED, "sc")
    .hand(P2, THRILL, "thrill");
}

/** Star-Crossed [Pawn, Hunter]; P1 passes; P2 Thrills the Hunter; both pass → Thrill resolves and P2 replays the Hunter to bf1. */
async function starCrossedThenThrill(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("sc", { targets: ["pawn", "hunter"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", controller: P1, targets: ["pawn", "hunter"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "thrill")).toBe(true);
  await game.p2.cast("thrill", { targets: "hunter" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["sc", "thrill"]);
  for (let i = 0; i < 6; i++) {
    const d: Decision | null = game.decision();
    if (d?.kind === "action" && d.context === "chain" && game.zoneOf("thrill") === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P2 }); // "its owner plays it to any battlefield" — P2 chooses
  const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
  expect(keys).toContain("battlefield-bf1");
  expect(keys).not.toContain("base"); // "to any battlefield"
  await game.p2.pick("battlefield-bf1");
  return game;
}

describe("Ruling 68f7eac6912c6a20 — Thrill of the Hunt severs Star-Crossed's hold on the enemy unit; my unit still bounces", () => {
  test("Thrill resolves first: the Hunter passed through banishment and is now (re-played) at bf1; Star-Crossed still waits below with its ORIGINAL targets", async () => {
    const game = await starCrossedThenThrill();
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.zoneOf("hunter")).toBe("battlefield-bf1");
    expect(game.state("hunter").controller).toBe(P2);
    expect(game.chain()[0]).toMatchObject({ cardId: "sc", targets: ["pawn", "hunter"] });
    expect(game.zoneOf("pawn")).toBe("base");
  });

  test("ruling: Star-Crossed then resolves — MY Pawn returns to my hand; the re-played Hunter (a new object) is NOT returned and stays at bf1; nobody is asked to re-choose", async () => {
    const game = await starCrossedThenThrill();
    let reasked = false;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick" && d.source?.cardId === "sc") {
        reasked = true;
        break;
      } else {
        break;
      }
    }
    expect(reasked).toBe(false);
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("hand");
    expect(game.p1.hand()).toContain("pawn");
    expect(game.zoneOf("hunter")).toBe("battlefield-bf1");
    expect(game.p2.hand()).not.toContain("hunter");
    await game.settle();
    expect(game.zoneOf("hunter")).toBe("battlefield-bf1");
    expect(game.zoneOf("pawn")).toBe("hand");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control — unanswered, Star-Crossed bounces BOTH: Pawn to P1's hand and Hunter to P2's hand", async () => {
    const game = await board().build();
    await game.p1.cast("sc", { targets: ["pawn", "hunter"] });
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("hand");
    expect(game.zoneOf("hunter")).toBe("hand");
    expect(game.p2.hand()).toContain("hunter");
  });
});
