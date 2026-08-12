/**
 * Ruling 42325362ba1afeee — (no specific card) what does "your Chosen Champion" refer to?
 *   Exercised with Hallowed Tomb (OGN-281 → ogn-281-298) "When you hold here, you may return your Chosen
 *   Champion from your trash to your Champion Zone if it is empty.", legend Nine-Tailed Fox (ogn-255-298)
 *   and Ahri, Alluring (ogn-066-298).
 *
 * Q: Does "Chosen Champion" mean only the one card separated at the start of the game, or every copy of
 *    that card played during the game?
 * A: Every card with the same NAME as your chosen champion — whether it came from the Champion Zone or
 *    from another zone such as your deck.
 * Rules: 103.2.a.3 ("a player's Chosen Champion is both the specific card chosen … and also any Champion
 *        Unit with the same name as that card"), 355.9.a.5, 419.1.a (playable from the Champion Zone).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FOX = "ogn-255-298"; // Legend · championTag "Ahri"
const AHRI_ALLURING = "ogn-066-298"; // Chosen Champion · "When I hold, you score 1 point."
const AHRI_INQUISITIVE = "ogn-119-298"; // a DIFFERENT champion card that shares the Ahri tag
const TOMB = "ogn-281-298";

/** P2's turn is about to end; P1 holds Hallowed Tomb with the champion card that started in the Champion Zone. */
function board(trashed: string, trashAlias: string) {
  return scenario()
    .active(P2)
    .legend(P1, FOX, "fox")
    .battlefield("bf1", { controller: P1, def: TOMB, inert: false })
    .unit(P1, "bf1", AHRI_ALLURING, "ahriBoard") // the original card — so the Champion Zone is empty
    .trash(P1, trashed, trashAlias);
}

describe("Ruling 42325362ba1afeee — 'your Chosen Champion' is any card of that name, not only the card set aside at setup", () => {
  test("a SECOND copy of Ahri, Alluring that reached the trash from elsewhere is returned by Hallowed Tomb, even though the set-aside card is on the board", async () => {
    const game = await board(AHRI_ALLURING, "ahriCopy").build();
    expect(game.p1.champion()).toBeUndefined(); // the set-aside card was played and is at bf1
    expect(game.p1.trash()).toEqual(["ahriCopy"]);

    await game.p2.endTurn(); // → P1's Beginning Phase: hold triggers at Hallowed Tomb
    await game.settle();
    if (game.decision()?.seat === P1 && game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }

    expect(game.zoneOf("ahriCopy")).toBe("championZone");
    expect(game.p1.champion()).toBe("ahriCopy");
    expect(game.p1.trash()).toEqual([]);
    expect(game.locationOf("ahriBoard")).toBe("bf1"); // untouched
    expect(game.violations()).toEqual([]);
  });

  test("…and it is then playable from the Champion Zone like the original (419.1.a)", async () => {
    const game = await board(AHRI_ALLURING, "ahriCopy").runes(P1, "calm", 6).build();
    await game.p2.endTurn();
    await game.settle();
    if (game.decision()?.seat === P1 && game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(game.zoneOf("ahriCopy")).toBe("championZone");
    expect(game.phase()).toBe("main");
    await game.p1.tapRunes(5); // [5]…
    await game.p1.recycleRune({ domain: "calm" }); // …plus [calm]
    await game.p1.playChampion("base");
    expect(game.zoneOf("ahriCopy")).toBe("base");
  });

  test("ruling 42325362ba1afeee — a champion with a DIFFERENT name (Ahri, Inquisitive) is not 'your Chosen Champion', but the engine matches on the legend's champion tag and returns it anyway", async () => {
    // 103.2.a.3 keys on the NAME of the card selected at deck building; the engine's
    // return-to-champion-zone handler keys on the legend's `championTag`, which every Ahri shares.
    const game = await board(AHRI_INQUISITIVE, "otherAhri").build();
    await game.p2.endTurn();
    await game.settle();
    if (game.decision()?.seat === P1 && game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(game.zoneOf("otherAhri")).toBe("trash");
    expect(game.p1.champion()).toBeUndefined();
  });
});
