/**
 * Ruling 3c7701ebe5b9db8f — Swift Scout (OGN-263 → ogn-263-298) · Legend · Teemo
 *   "[1], [Exhaust]: Put a Teemo unit you own into your hand from your Champion Zone or the board."
 *   × Teemo, Scout (OGN-197 → ogn-197-298) · Teemo champion unit · 1 Might.
 *
 * Q: Can Swift Scout's ability pull a Teemo champion unit out of your TRASH into your hand?
 * A: No. The ability names exactly two places — your Champion Zone and the board. The trash is
 *    neither: it is a non-board zone, so a Teemo lying there is not a legal choice.
 * Rules: 111 (the board = bases + battlefields; the trash is not part of it), 106 (zones),
 *        355.9 (a chosen object must sit in a zone the descriptor names).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const SWIFT_SCOUT = "ogn-263-298";
const TEEMO = "ogn-197-298";
const SCOUT_ABILITY = 1; // #0 is the [Hidden]-cost static

/** P1's turn, [1] banked: one Teemo in the trash, one on the board (base), one in the Champion Zone. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .legend(P1, SWIFT_SCOUT, "scout")
    .trash(P1, TEEMO, "deadTeemo")
    .unit(P1, "base", TEEMO, "boardTeemo")
    .champion(P1, TEEMO, "czTeemo");
}

/** What Swift Scout's activated ability is willing to take, straight off the offered move. */
function offered(game: Game): string[] {
  const option = game.p1.legal().find((o) => o.moveId === "activateAbility" && o.card === "scout");
  const field = option?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flat().map(String))];
}

describe("Ruling 3c7701ebe5b9db8f — Swift Scout cannot reach a Teemo in the trash", () => {
  test("premise: the three Teemos sit in three different zones", async () => {
    const game = await board().build();
    expect(game.zoneOf("deadTeemo")).toBe("trash");
    expect(game.zoneOf("boardTeemo")).toBe("base");
    expect(game.zoneOf("czTeemo")).toBe("championZone");
  });

  test("ruling 3c7701ebe5b9db8f — the choices are the board Teemo and the Champion-Zone Teemo; the trashed one is not offered", async () => {
    const game = await board().build();
    const options = offered(game);
    expect(options.toSorted()).toEqual(["boardTeemo", "czTeemo"]);
    expect(options).not.toContain("deadTeemo");
    expect((await game.p1.try((p) => p.activate("scout", SCOUT_ABILITY, { targets: "deadTeemo" }))).ok).toBe(false);
    expect(game.zoneOf("deadTeemo")).toBe("trash");
  });

  test("with the trash Teemo the ONLY Teemo anywhere, the ability has no legal choice and nothing comes back", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).legend(P1, SWIFT_SCOUT, "scout").trash(P1, TEEMO, "deadTeemo").build();
    await game.settle();
    expect(offered(game)).toEqual([]);
    expect((await game.p1.try((p) => p.activate("scout", SCOUT_ABILITY, { targets: "deadTeemo" }))).ok).toBe(false);
    await game.settle();
    expect(game.zoneOf("deadTeemo")).toBe("trash");
    expect(game.state("scout").isReady).toBe(true);
    expect(game.p1.hand()).not.toContain("deadTeemo");
  });

  test("choosing the board Teemo does work — it goes to hand, [1] and the exhaust are paid, and the trashed Teemo is untouched", async () => {
    const game = await board().build();
    await game.p1.activate("scout", SCOUT_ABILITY, { targets: "boardTeemo" });
    await game.settle();
    expect(game.zoneOf("boardTeemo")).toBe("hand");
    expect(game.zoneOf("deadTeemo")).toBe("trash");
    expect(game.zoneOf("czTeemo")).toBe("championZone");
    expect(game.state("scout").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
