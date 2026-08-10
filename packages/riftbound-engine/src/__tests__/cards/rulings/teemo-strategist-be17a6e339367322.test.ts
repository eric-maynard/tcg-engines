/**
 * Ruling be17a6e339367322 — Teemo, Strategist (OGN-121 → ogn-121-298) × Hwei, Brooding Painter (UNL-080, 5 Might) × Flash (OGS-011 → ogs-011-024)
 *   Teemo (2): "[Hidden] When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to that unit for
 *   each card with [Hidden] revealed this way, then recycle the revealed cards."   Flash (Reaction): "Move up to 2 friendly units to base."
 *
 * Q: Teemo (defending) deals 3 to Hwei and it resolves; the opponent then Flashes Hwei back to base — is Hwei "at 2 health or 5"?
 * A: Units have Might, not health, and damage doesn't reduce Might: Hwei is still a 5-Might unit with 3 damage marked, and moving him
 *    to base changes neither. The damage persists (until healed / combat cleanup), so 2 more damage (total 5 ≥ Might) would kill him.
 *    (Note: Teemo's ability is a "When I defend" trigger.)
 * Rules: 143.3 / 143.3.a (damage is marked, Might unchanged), 143.3.b (when damage is healed), 140.3 (lethal = damage ≥ Might).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO = "ogn-121-298";
const FLASH = "ogs-011-024";
// P1's top 5: exactly three [Hidden] cards → Teemo deals 3
const FIGHT_OR_FLIGHT = "ogn-168-298"; // Hidden
const HIDDEN_BLADE = "ogn-213-298"; // Hidden
const TIDETURNER = "ogn-199-298"; // Hidden
const SKULKER = "ogn-175-298"; // not Hidden
/** A plain 2-damage Reaction for the "another 2 would kill him" clause. */
const ZAP = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Zap",
  rulesText: "[Reaction] Deal 2 to a unit.",
  timing: "reaction",
} as const;

/**
 * P2's turn. P1 holds bf1 with Teemo (in play, so he DEFENDS). P2 attacks with a vanilla 5-Might "Hwei" plus a 2-Might Escort
 * (so the combat continues after Hwei leaves) and holds Flash + exactly 2 energy. P1 has Test Zap + 1 energy.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2 })
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TEEMO, "teemo")
    .unit(P2, "base", { might: 5, name: "Hwei, Brooding Painter" }, "hwei")
    .unit(P2, "base", { might: 2, name: "Escort" }, "escort")
    .deck(P1, [FIGHT_OR_FLIGHT, SKULKER, HIDDEN_BLADE, TIDETURNER, SKULKER, SKULKER], ["d1", "d2", "d3", "d4", "d5", "d6"])
    .hand(P2, FLASH, "flash")
    .hand(P1, ZAP, "zap");
}

/** Attack; Teemo's defend trigger targets Hwei and resolves (3 Hidden revealed → 3 damage). Stops in the showdown, P2 with focus. */
async function teemoHitsHwei(): Promise<Game> {
  const game = await board().build();
  await game.p2.move(["hwei", "escort"], "bf1");
  expect(game.state("teemo").combatRole).toBe("defender");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "teemo" } });
  await game.p1.pick("hwei");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", targets: ["hwei"], triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling be17a6e339367322 — Teemo's 3 damage stays marked on 5-Might Hwei after Flash moves him to base", () => {
  test("Teemo's defend trigger resolves: Hwei has 3 DAMAGE marked but is still a 5-MIGHT unit (damage does not reduce Might); the 5 revealed cards were recycled", async () => {
    const game = await teemoHitsHwei();
    expect(game.state("hwei")).toMatchObject({ baseMight: 5, damage: 3, location: "bf1", might: 5 });
    expect(game.p1.deck()[0]).toBe("d6"); // d1–d5 went to the bottom
    expect(game.p1.deck().slice(-5).sort()).toEqual(["d1", "d2", "d3", "d4", "d5"]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("P2 Flashes Hwei to base: he arrives in base STILL 5 Might and STILL carrying the 3 damage — neither '2 health' nor healed", async () => {
    const game = await teemoHitsHwei();
    await game.p2.cast("flash", { targets: ["hwei"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.locationOf("hwei")).toBe("base");
    expect(game.state("hwei")).toMatchObject({ baseMight: 5, damage: 3, might: 5 });
    expect(game.zoneOf("hwei")).toBe("base"); // alive
    // the combat at bf1 goes on without him
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("because the damage persists, another 2 (total 5 ≥ his Might 5) kills him: P1's 2-damage Reaction on Hwei in base sends him to the trash", async () => {
    const game = await teemoHitsHwei();
    await game.p2.cast("flash", { targets: ["hwei"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("zap", { targets: "hwei" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("hwei")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("left alone instead, the marked damage is eventually healed (combat cleanup / end of turn) — Hwei is back to 0 damage, 5 Might by P1's turn", async () => {
    const game = await teemoHitsHwei();
    await game.p2.cast("flash", { targets: ["hwei"] });
    await game.settle(); // Flash, then the rest of the combat (Escort vs Teemo)
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("hwei")).toBe("base");
    expect(game.state("hwei")).toMatchObject({ damage: 0, might: 5 });
  });
});
