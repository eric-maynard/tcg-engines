/**
 * Ruling 47fb6a722e379a9f — Falling Star (OGN-029 → ogn-029-298) · Spell · [2][fury][fury]
 *   "Deal 3 to a unit. Deal 3 to a unit."
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) · Champion Unit · 6 Might — sitting in the Champion Zone.
 *
 * Q: Can champion units sitting in the Chosen Champion Zone be chosen by spells and abilities
 *    (e.g. Falling Star aimed at Yasuo)?
 * A: No. The Champion Zone is not part of the board; spells and abilities cannot reach cards there
 *    unless they say so explicitly (Swift Scout's "from your Champion Zone or the board" does).
 *    Once the champion is actually played onto the board it is a normal unit and can be chosen.
 * Rules: 106.3 (Champion Zone — the card may only be played from there), 111 (the board = bases +
 *        battlefields), 355.9 (a chosen object must be in a zone the descriptor can reach).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const YASUO = "ogn-076-298"; // champion unit, 6 Might
const SWIFT_SCOUT = "ogn-263-298"; // the counter-example named by the ruling
const TEEMO_SCOUT = "ogn-197-298"; // Teemo champion unit, 1 Might

/** P2's turn. P1's Yasuo waits in the Champion Zone; a 4-Might Sentry of P1's stands in base. P2 holds Falling Star. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .champion(P1, YASUO, "yasuo")
    .unit(P1, "base", { might: 4, name: "Sentry" }, "sentry")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, FALLING_STAR, "star");
}

/** Every unit Falling Star is willing to be aimed at right now. */
function starTargets(game: Game): string[] {
  const field = game.p2.option("cast", "star")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flat().map(String))];
}

describe("Ruling 47fb6a722e379a9f — a champion in the Champion Zone is out of reach of Falling Star", () => {
  test("premise: Yasuo is in the Champion Zone, not on the board", async () => {
    const game = await board().build();
    expect(game.zoneOf("yasuo")).toBe("championZone");
    expect(game.locationOf("yasuo")).toBeUndefined();
    expect(game.p2.can("cast", "star")).toBe(true);
    expect(game.p1.units()).toEqual(["sentry"]);
  });

  test("ruling 47fb6a722e379a9f — Falling Star's choices are the board units only; Yasuo is not among them and naming him is refused", async () => {
    const game = await board().build();
    expect(starTargets(game).toSorted()).toEqual(["raider", "sentry"]);
    expect(starTargets(game)).not.toContain("yasuo");
    const r = await game.p2.try((p) => p.cast("star", { targets: ["yasuo", "sentry"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("star")).toBe("hand");
    expect(game.zoneOf("yasuo")).toBe("championZone");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { fury: 2 } });
  });

  test("the spell works fine against board units — 3 + 3 onto the 4-Might Sentry kills it", async () => {
    const game = await board().build();
    await game.p2.cast("star", { targets: ["sentry", "sentry"] });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the very same champion card, once it is on the BOARD, is an ordinary unit and a legal choice (6 Might survives one 3, dies to both)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 2 } })
      .unit(P1, "base", YASUO, "yasuo")
      .hand(P2, FALLING_STAR, "star")
      .build();
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(starTargets(game)).toContain("yasuo");
    await game.p2.cast("star", { targets: ["yasuo", "yasuo"] });
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("trash"); // 3 + 3 ≥ 6
  });

  test("the exception the ruling names: Swift Scout's ability DOES say 'from your Champion Zone or the board', and it can take the Teemo there", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .legend(P1, SWIFT_SCOUT, "scout")
      .champion(P1, TEEMO_SCOUT, "teemo")
      .build();
    expect(game.zoneOf("teemo")).toBe("championZone");
    await game.p1.activate("scout", 1);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("teemo");
      await game.settle();
    }
    expect(game.zoneOf("teemo")).toBe("hand");
  });
});
