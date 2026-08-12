/**
 * Ruling 3999026cbf5f4ad1 — (no specific card) where does a killed Chosen Champion go?
 *   Exercised with Ahri, Alluring (OGN-066 → ogn-066-298) as the Chosen Champion and Vengeance
 *   (OGN-229 → ogn-229-298) · "Kill a unit." as the removal.
 *
 * Q: When your Chosen Champion is killed, does it return to the Champion Zone or go to trash?
 * A: To the trash. Riftbound champions are not MTG commanders — nothing sends them home on death.
 * Rules: 108.3 / 112 (the Champion Zone holds the card until it is played), 419.1.a (it is played FROM
 *        that zone), 187 (a killed unit is put into its owner's trash), 281 Hallowed Tomb is the kind of
 *        effect that must be used to get it back out of the trash.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const AHRI = "ogn-066-298"; // Champion unit · [5][calm] · 4 Might · "When I hold, you score 1 point."
const VENGEANCE = "ogn-229-298"; // Spell · [4][order][order] · "Kill a unit."

describe("Ruling 3999026cbf5f4ad1 — a killed Chosen Champion goes to the trash, not back to the Champion Zone", () => {
  test("played from the Champion Zone, then killed by a spell: it lands in the trash and the Champion Zone stays empty", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { calm: 1, order: 2 } })
      .champion(P1, AHRI, "ahri")
      .hand(P1, VENGEANCE, "vengeance")
      .build();
    expect(game.p1.champion()).toBe("ahri");
    expect(game.zoneOf("ahri")).toBe("championZone");

    await game.p1.playChampion("base");
    expect(game.zoneOf("ahri")).toBe("base");
    expect(game.p1.champion()).toBeUndefined(); // the zone is empty while she is on the board

    // "Kill a unit." names no controller — P1 may aim it at their own Champion.
    await game.p1.cast("vengeance", { targets: "ahri" });
    await game.settle();

    expect(game.zoneOf("ahri")).toBe("trash");
    expect(game.p1.trash()).toContain("ahri");
    expect(game.p1.champion()).toBeUndefined(); // NOT returned to the Champion Zone
    expect(game.violations()).toEqual([]);
  });

  test("dying in combat is the same story — the trash, and she is not replayable from the Champion Zone afterwards", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", AHRI, "ahri")
      .unit(P2, "base", { might: 7, name: "Ogre" }, "ogre")
      .build();
    await game.p2.move("ogre", "bf1");
    await game.settle();
    expect(game.zoneOf("ahri")).toBe("trash");
    expect(game.p1.champion()).toBeUndefined();
    expect(game.p1.trash()).toContain("ahri");
  });
});
