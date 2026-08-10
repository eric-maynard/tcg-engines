/**
 * Ruling af90b993b46fe64b — Sprite token (OGN-274 → ogn-274-298) · 3 Might · "[Temporary] (Kill me at the start of your
 *     Beginning Phase, before scoring.)"
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · "If a friendly unit would die, kill this instead. Heal that unit,
 *     exhaust it, and recall it."
 *
 * Q: If a Temporary Sprite is saved from its Temporary death by Zhonya's replacement, does it stay on the board?
 * A: Yes — the Hourglass is killed instead and the Sprite is recalled to base and stays. It keeps [Temporary], so it is
 *    killed again at the start of its controller's NEXT Beginning Phase.
 * Rules: 369–372 (replacement: "kill this instead"), Temporary keyword, 186.1 (a token that does leave the board ceases
 *        to exist).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const ZHONYAS = "ogn-077-298";

/** P2's turn. P1 holds bf1 with a Sprite token and a Holder (2); a face-up Zhonya's Hourglass sits in P1's base. */
function board(withZhonyas = true) {
  const b = scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SPRITE, "sprite")
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker");
  return withZhonyas ? b.gear(P1, ZHONYAS, "zh") : b;
}

/** P2 ends the turn → P1's Beginning Phase runs (Temporary fires) → P1's open main phase. */
async function intoP1Turn(withZhonyas = true): Promise<Game> {
  const game = await board(withZhonyas).build();
  expect(game.state("sprite")).toMatchObject({ isToken: true, keywords: ["Temporary"], location: "bf1" });
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  return game;
}

describe("Ruling af90b993b46fe64b — Zhonya's saves a Temporary Sprite; it stays (in base) and dies to Temporary next time", () => {
  test("control (no Hourglass): at the start of P1's Beginning Phase [Temporary] kills the Sprite — the token ceases to exist", async () => {
    const game = await intoP1Turn(false);
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.has("sprite")).toBe(false);
    expect(game.p1.units("bf1")).toEqual(["holder"]);
  });

  test("with Zhonya's: the Temporary death is REPLACED — the Hourglass is killed instead (P1's trash) and the Sprite REMAINS on the board: healed, recalled to P1's base", async () => {
    const game = await intoP1Turn();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.has("sprite")).toBe(true);
    expect(game.zoneOf("sprite")).toBe("base");
    expect(game.state("sprite")).toMatchObject({ controller: P1, damage: 0, isToken: true, location: "base", might: 3 });
    expect(game.p1.units("base")).toEqual(["sprite"]);
    expect(game.p1.units("bf1")).toEqual(["holder"]);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: the saved token still has [Temporary] …", async () => {
    const game = await intoP1Turn();
    expect(game.state("sprite").keywords).toContain("Temporary");
  });

  test("… so at the start of P1's NEXT Beginning Phase (no Hourglass left) it is killed for good and ceases to exist", async () => {
    const game = await intoP1Turn();
    await game.advanceTurn(); // → P2
    expect(game.zoneOf("sprite")).toBe("base"); // nothing happens on the opponent's turn
    await game.advanceTurn(); // → P1: Temporary again
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.has("sprite")).toBe(false);
    expect(game.p1.units("base")).toEqual([]);
  });
});
