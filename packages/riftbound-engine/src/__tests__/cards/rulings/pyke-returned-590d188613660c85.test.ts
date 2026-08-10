/**
 * Ruling 590d188613660c85 — Pyke, Returned (UNL-145 → unl-145-219) · Champion Unit · Chaos · 3 · 3 Might
 *     "[Hidden] [Backline] Once each turn, when an enemy unit dies while I'm at a battlefield, play a Gold gear token exhausted."
 *   × Rockfall Path (SFD-216 → sfd-216-221) Battlefield: "Units can't be played here."
 *
 * Q: If Pyke, Returned is hidden at Rockfall Path and later "played" from there, does he go to base instead?
 * A: No. A hidden permanent must be played to THAT battlefield (811.1.b / 811.1.d.1); Rockfall's "can't" beats the
 *    Hidden "can" — the attempt is illegal and rewound. Pyke stays facedown there (not moved to base) and is trashed
 *    when control of the battlefield is lost (hidden-card cleanup).
 * Rules: 811.1.b, 811.1.d.1 (+ .a gear-only override), 107.3.d / 323.7 (hidden card removed when control lost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PYKE_RETURNED = "unl-145-219";
const ROCKFALL_PATH = "sfd-216-221";

/**
 * Turn 3, P1 active. bf "rock" = live Rockfall Path held by P1's 2-Might Holder, with Pyke already facedown there
 * (hidden on an earlier turn). A plain bf "plain" for the contrast. P2 has an 8-Might Crusher to take Rockfall later.
 */
function board(at: "rock" | "plain" = "rock") {
  return scenario()
    .turn(3)
    .active(P1)
    .resources(P1, { energy: 3 })
    .battlefield("rock", { controller: P1, def: ROCKFALL_PATH, inert: false })
    .battlefield("plain", { controller: P1 })
    .unit(P1, "rock", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "plain", { might: 2, name: "Keeper" }, "keeper")
    .unit(P2, "base", { might: 8, name: "Crusher" }, "crusher")
    .facedown(P1, at, PYKE_RETURNED, "pyke");
}

async function built(at: "rock" | "plain" = "rock"): Promise<Game> {
  const game = await board(at).build();
  expect(game.zoneOf("pyke")).toBe(`facedown-${at}`);
  expect(game.state("pyke").isHidden).toBe(true);
  return game;
}

describe("Ruling 590d188613660c85 — hidden Pyke, Returned at Rockfall Path can't be played and does NOT go to base", () => {
  test("playing Pyke from facedown at Rockfall Path is not a legal action; a forced attempt is rejected and rewound — he stays hidden there, not in base", async () => {
    const game = await built("rock");
    expect(game.p1.can("reveal", "pyke")).toBe(false);
    expect(game.p1.can("playFrom", "pyke")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("pyke"));
    expect(r.ok).toBe(false);
    // Rewound: nothing changed.
    expect(game.zoneOf("pyke")).toBe("facedown-rock");
    expect(game.state("pyke").isHidden).toBe(true);
    expect(game.p1.base()).not.toContain("pyke");
    expect(game.p1.units("base")).toEqual([]);
    expect(game.p1.units("rock")).toEqual(["holder"]);
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(3);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("contrast: the same hidden Pyke at an ordinary battlefield IS playable from facedown for [0] and enters THAT battlefield (never base)", async () => {
    const game = await built("plain");
    expect(game.p1.can("reveal", "pyke")).toBe(true);
    await game.p1.reveal("pyke");
    await game.settle();
    expect(game.zoneOf("pyke")).toBe("battlefield-plain");
    expect(game.p1.base()).not.toContain("pyke");
    expect(game.p1.energy()).toBe(3); // played ignoring cost (811.1.d)
  });

  test("consequence: the stuck Pyke is trashed when P1 loses control of Rockfall Path (P2's Crusher conquers it)", async () => {
    const game = await built("rock");
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("pyke")).toBe("facedown-rock");
    await game.p2.move("crusher", "rock");
    await game.settle(); // showdown → combat 8 vs 2: Holder dies, P2 conquers
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.rock?.controller).toBe(P2);
    expect(game.zoneOf("pyke")).toBe("trash");
    expect(game.p1.trash()).toContain("pyke");
    expect(game.p1.facedown("rock")).toEqual([]);
    expect(game.p1.base()).not.toContain("pyke");
    expect(game.violations()).toEqual([]);
  });
});
