/**
 * Ruling eb0a9d631f28f46f — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Can you react with a Zhonya's hidden at one battlefield to save a unit at a DIFFERENT battlefield?
 * A: Yes. Played from hidden the gear goes straight to base (gear is never played to a battlefield); its effect
 *    does not target, so the "here" restriction on hidden plays does not apply — it saves a friendly unit wherever
 *    it would die. Only targeting choices / units carry the played-from-hidden battlefield restriction.
 * Rules: 811.1.d (from-hidden restrictions apply to targets / permanents' location), 518 (gear recalled to base),
 *        372–373 (die replacement, no targeting).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

/** P1's turn. P2 holds bf1 (Keeper 3 + Zhonya's facedown there since an earlier turn) and bf2 (Yak 4). P1's Brute (8) in base. */
function board() {
  return scenario()
    .turn(5)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Keeper" }, "keeper")
    .facedown(P2, "bf1", ZHONYAS, "zh")
    .unit(P2, "bf2", { might: 4, name: "Yak" }, "yak")
    .unit(P1, "base", { might: 8, name: "Brute" }, "brute");
}

/** Brute attacks bf2; P1 passes Focus; P2 (with Focus) flips the Hourglass that is hidden at bf1. */
async function attackBf2AndFlipAtBf1(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("brute", "bf2");
  expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ battlefieldId: "bf2", isCombatShowdown: true });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "zh")).toBe(true);
  await game.p2.reveal("zh");
  return game;
}

describe("Ruling eb0a9d631f28f46f — a Zhonya's flipped at bf1 saves a unit dying at bf2", () => {
  test("the reaction is legal even though the fight is at bf2: played from hidden for [0], the GEAR lands in P2's base (not at bf1, not at bf2), face up", async () => {
    const game = await attackBf2AndFlipAtBf1();
    expect(game.state("zh")).toMatchObject({ isHidden: false, zone: "base" });
    expect(game.p2.gear()).toEqual(["zh"]);
    expect(game.p2.facedown("bf1")).toEqual([]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });

  test("combat at bf2: Brute's 8 would kill Yak → the Hourglass (hidden at bf1 a moment ago) dies instead; Yak is healed, exhausted and recalled to base — no 'here' restriction on a non-targeting effect", async () => {
    const game = await attackBf2AndFlipAtBf1();
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("yak")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("keeper")).toBe("battlefield-bf1"); // the bf1 unit was never involved
    expect(game.state("brute")).toMatchObject({ damage: 0, zone: "battlefield-bf2" }); // took 4, healed
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("control: left facedown, the Hourglass does nothing — Yak simply dies at bf2", async () => {
    const game = await board().build();
    await game.p1.move("brute", "bf2");
    await game.settle();
    expect(game.zoneOf("yak")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });
});
