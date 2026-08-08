/**
 * Fox-Fire — ogn-256-298 · Spell · Calm/Mind · 3 energy · Action
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Action] (Play on your turn or in showdowns.)
 *   Kill any number of units at a battlefield with total Might 4 or less.
 *
 * Rules: 355.13 ("any number" may be zero), 355.11.b (this very card: the chosen units must sit
 * at ONE battlefield and total ≤ 4 Might), 811 (Hidden: hide for [rainbow] at a battlefield you
 * control; from the next turn play it for 0 with choices restricted to that battlefield).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-256-298";

function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "A1" }, "a1")
    .unit(P2, "bf1", { might: 3, name: "A3" }, "a3")
    .unit(P2, "bf1", { might: 4, name: "A4" }, "a4")
    .unit(P2, "bf2", { might: 2, name: "B2" }, "b2")
    .unit(P2, "base", { might: 1, name: "Home" }, "home")
    .hand(P1, CARD, "ff");
}

describe("Fox-Fire (ogn-256-298)", () => {
  test("costs 3 energy: kills several units at one battlefield totalling ≤ 4 Might (1 + 3); goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("ff", { targets: ["a1", "a3"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ff", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("a1")).toBe("trash");
    expect(game.zoneOf("a3")).toBe("trash");
    expect(game.zoneOf("a4")).toBe("battlefield-bf1");
    expect(game.zoneOf("b2")).toBe("battlefield-bf2");
    expect(game.zoneOf("ff")).toBe("trash");
    const poor = await board().resources(P1, { energy: 2 }).build();
    expect(poor.p1.can("cast", "ff")).toBe(false);
  });

  test("legal target sets: only units AT A BATTLEFIELD, all at the same one, total Might ≤ 4 (zero targets allowed, 355.13)", async () => {
    const game = await board().build();
    const sets = game.p1.option("cast", "ff")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    const norm = sets.map((s) => [...s].sort().join("+")).sort();
    expect(norm).toEqual(["", "a1", "a1+a3", "a3", "a4", "b2"]); // no "home" (in a base), no a1+a4 (5), no a1+b2 (two battlefields)
    const over = await game.p1.try((p) => p.cast("ff", { targets: ["a1", "a4"] }));
    expect(!over.ok && over.error.code).toBe("ILLEGAL_ARGS");
    const split = await game.p1.try((p) => p.cast("ff", { targets: ["a1", "b2"] }));
    expect(!split.ok && split.error.code).toBe("ILLEGAL_ARGS");
  });

  test("a single 4-Might unit is exactly at the limit and dies", async () => {
    const game = await board().build();
    await game.p1.cast("ff", { targets: ["a4"] });
    await game.settle();
    expect(game.zoneOf("a4")).toBe("trash");
    expect(game.zoneOf("a1")).toBe("battlefield-bf1");
  });

  test("[Action]: not castable on the opponent's turn in an open state", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "ff")).toBe(false);
  });

  test("Hidden: hide for [rainbow] at a battlefield you control — no chain opens; not at an enemy battlefield", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "holder")
      .hand(P1, CARD, "ff")
      .build();
    await game.p1.hide("ff", "bf1");
    expect(game.zoneOf("ff")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]);
    const enemyBf = await scenario().resources(P1, { power: { rainbow: 1 } }).battlefield("bf1", { controller: P2 }).hand(P1, CARD, "ff").build();
    expect(enemyBf.p1.can("hide", "ff")).toBe(false);
  });

  test("from facedown on a later turn: played for 0 energy and may only kill units at THAT battlefield (811.1.d.2)", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 5, name: "Holder" }, "holder")
      .unit(P2, "bf1", { might: 2, name: "Near" }, "near")
      .unit(P2, "bf2", { might: 1, name: "Far" }, "far")
      .hand(P1, CARD, "ff")
      .build();
    await game.p1.hide("ff", "bf1");
    expect(game.p1.can("reveal", "ff")).toBe(false); // not on the turn it was hidden
    await game.advanceTurn(); // P2's turn
    // rule 316.5.b: Reaction (811.6) only adds Closed States — in P2's Neutral
    // Open State P1 holds no Priority and still may not play it.
    expect(game.p1.can("reveal", "ff")).toBe(false);
    await game.advanceTurn(); // back to P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    const sets = game.p1.option("reveal", "ff")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect(sets.some((s) => s.includes("far"))).toBe(false); // bf2 is off-limits from facedown at bf1
    // rule 355.5 / 355.13 — "any number of …" is chosen as the card is played;
    // a bare reveal() would name none.
    await game.p1.reveal("ff", { targets: ["near"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ff", controller: P1, triggered: false })]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("near");
      await game.settle();
    }
    expect(game.zoneOf("near")).toBe("trash");
    expect(game.zoneOf("far")).toBe("battlefield-bf2");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1"); // 5 Might is over the limit
    expect(game.zoneOf("ff")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
  });
});
