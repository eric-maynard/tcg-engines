/**
 * Ruling e5cd2d8b8694275b — Karthus, Eternal (OGN-236 → ogn-236-298) · 3 Might "Your [Deathknell] effects trigger an
 *     additional time." (PASSIVE)
 *   × Kog'Maw, Caustic (OGN-190 → ogn-190-298) · 1 Might "[Deathknell] — Deal 4 to all units at my battlefield."
 *   × Viktor, Leader (OGN-246 → ogn-246-298) · 4 Might "When another non-Recruit unit you control dies, play a 1 [Might]
 *     Recruit unit token into your base." (TRIGGERED — the contrast)
 *
 * Q: Karthus and Kog'Maw die at the same time — does Kog'Maw's Deathknell trigger twice?
 * A: Yes. Karthus's doubling is a passive that is still applying as both die together, so the Deathknell triggers twice.
 *    Contrast: Viktor, Leader's TRIGGERED "when another unit dies" does not fire if Viktor dies simultaneously (a leaving
 *    object can't evaluate its trigger condition for a simultaneous event).
 * Rules: 808.1.d.2 (Deathknell), 365 / 370.1.a.2 (passives apply while on board; look-back), 323.4–5 (one cleanup's
 *        deaths are simultaneous), 376.3.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KARTHUS = "ogn-236-298";
const KOGMAW = "ogn-190-298";
const VIKTOR = "ogn-246-298";
const FALLING_STAR = "ogn-029-298"; // [2][fury][fury] "Deal 3 to a unit. Deal 3 to a unit."

/**
 * P2's turn with exactly [2][fury][fury] + Falling Star. bf1 (P1's): Kog'Maw (1) + `partner`, and two P2 units standing
 * there as Deathknell witnesses: Brute (7) and Mid (5). One "Deal 4" kills neither; two kill both.
 */
function board(partner: string | { might: number; name: string }, partnerMeta?: { damage: number }) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", KOGMAW, "kog")
    .unit(P1, "bf1", partner, "partner", partnerMeta)
    .unit(P2, "bf1", { might: 7, name: "Brute" }, "brute")
    .unit(P2, "bf1", { might: 5, name: "Mid" }, "mid")
    .hand(P2, FALLING_STAR, "star");
}

/** Falling Star: 3 at the partner, 3 at Kog'Maw; both pass so it resolves and the same cleanup kills both. */
async function starBoth(game: Game): Promise<void> {
  await game.p2.cast("star", { targets: ["partner", "kog"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("star")).toBe("trash");
  expect(game.zoneOf("kog")).toBe("trash");
  expect(game.zoneOf("partner")).toBe("trash");
}

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1 });

describe("Ruling e5cd2d8b8694275b — Karthus dying alongside Kog'Maw still doubles Kog'Maw's Deathknell", () => {
  test("Karthus + Kog'Maw killed by one Falling Star: TWO Kog'Maw Deathknell items are queued; they deal 4 + 4 at bf1 — Brute (7) and Mid (5) both die", async () => {
    const game = await board(KARTHUS).build();
    await starBoth(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["kog", "kog"]);
    expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("mid")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("reference (vanilla 3-Might partner instead of Karthus): ONE Deathknell item — Brute and Mid take 4 each and survive", async () => {
    const game = await board({ might: 3, name: "Vanilla" }).build();
    await starBoth(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["kog"]);
    await game.settle();
    expect(game.state("brute")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.state("mid")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
  });

  test("contrast — Viktor, Leader (pre-damaged so the 3 is lethal) dying in the same cleanup as Kog'Maw: his TRIGGERED ability does not fire (no Recruit), and Kog'Maw's single Deathknell deals just 4", async () => {
    const game = await board(VIKTOR, { damage: 1 }).build();
    await starBoth(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["kog"]); // no Viktor item
    await game.settle();
    expect(recruits(game)).toEqual([]);
    expect(game.p1.units("base")).toEqual([]);
    expect(game.state("brute")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
  });
});
