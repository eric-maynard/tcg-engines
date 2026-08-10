/**
 * Ruling 8a4d6b7ec257d79b — Hallowed Tomb (OGN-281 → ogn-281-298) · Battlefield
 *     "When you hold here, you may return your Chosen Champion from your trash to your Champion Zone if it is empty."
 *   (exercised with Daughter of the Void ogn-247-298 · Kai'Sa Legend and two copies of Kai'Sa, Survivor ogn-039-298)
 *
 * Q: Can the Tomb return a copy of my chosen champion from the trash to the Champion Zone while ANOTHER copy of that
 *    champion is currently in my base or at a battlefield?
 * A: Yes. Your Chosen Champion is defined by the card NAME that started in the Champion Zone, not one physical card — a
 *    copy in the trash qualifies regardless of another copy being on the board (the zone just has to be empty).
 * Rules: 103.2.a.3 (Chosen Champion identity), 108.3 (Champion Zone), 469.2 / 383.4.d (Hold triggers), 419.1.a.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HALLOWED_TOMB = "ogn-281-298";
const DAUGHTER_OF_THE_VOID = "ogn-247-298"; // Legend · Kai'Sa
const KAISA_SURVIVOR = "ogn-039-298"; // Champion unit · Kai'Sa · 4 Might

/**
 * End of P2's turn 2. P1 (Kai'Sa legend, Champion Zone EMPTY) controls the live Hallowed Tomb with copy A of Kai'Sa,
 * Survivor standing ON it (`onBoard: "tomb"`) or sitting in base (`onBoard: "base"`, a Gravekeeper holds the Tomb);
 * copy B of Kai'Sa, Survivor is in P1's trash.
 */
function board(onBoard: "tomb" | "base") {
  const b = scenario()
    .turn(2)
    .active(P2)
    .legend(P1, DAUGHTER_OF_THE_VOID, "legend")
    .battlefield("tomb", { controller: P1, def: HALLOWED_TOMB, inert: false })
    .trash(P1, KAISA_SURVIVOR, "kaisaB");
  return onBoard === "tomb" ? b.unit(P1, "tomb", KAISA_SURVIVOR, "kaisaA") : b.unit(P1, "tomb", { might: 2, name: "Gravekeeper" }, "keeper").unit(P1, "base", KAISA_SURVIVOR, "kaisaA");
}

/** P2 ends the turn → P1's Beginning Phase: the hold scores and the Tomb's opt-in is pending. */
async function intoHold(game: Game): Promise<void> {
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.p1.points()).toBe(1);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tomb", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tomb" } });
}

describe("Ruling 8a4d6b7ec257d79b — a copy of the Chosen Champion on the board doesn't stop the Tomb returning the trash copy", () => {
  test("copy A AT A BATTLEFIELD (holding the Tomb itself), copy B in trash, Champion Zone empty: the hold trigger is offered and accepting returns B to the CHAMPION ZONE; A stays on the Tomb, the Legend stays put", async () => {
    const game = await board("tomb").build();
    expect(game.p1.champion()).toBeUndefined();
    await intoHold(game);
    await game.p1.yes();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("kaisaB")).toBe("championZone");
    expect(game.p1.champion()).toBe("kaisaB");
    expect(game.p1.trash()).not.toContain("kaisaB");
    expect(game.zoneOf("kaisaA")).toBe("battlefield-tomb");
    expect(game.zoneOf("legend")).toBe("legendZone");
    expect(game.violations()).toEqual([]);
  });

  test("copy A IN BASE, copy B in trash: same answer — B goes back to the Champion Zone, A untouched in base", async () => {
    const game = await board("base").build();
    await intoHold(game);
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("kaisaB")).toBe("championZone");
    expect(game.p1.champion()).toBe("kaisaB");
    expect(game.zoneOf("kaisaA")).toBe("base");
    expect(game.cardsAt("championZone", P1)).toEqual(["kaisaB"]);
  });

  test("…and the returned copy is a real Chosen Champion again: with her cost on the table she can be played from the Champion Zone (419.1.a) while copy A is still on the board", async () => {
    const game = await board("base").runes(P1, "fury", 4).build();
    await intoHold(game);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.champion()).toBe("kaisaB");
    for (let i = 0; i < 4; i++) {
      await game.p1.tapRune();
    }
    expect(game.p1.can("playChampion")).toBe(true);
    await game.p1.playChampion("base");
    await game.settle();
    expect(game.zoneOf("kaisaB")).toBe("base");
    expect(game.zoneOf("kaisaA")).toBe("base");
    expect(game.p1.champion()).toBeUndefined();
  });

  test("contrast — 'if it is empty' still governs: with an unplayed Kai'Sa already IN the Champion Zone (and A on board, B in trash) nothing is returned", async () => {
    const game = await board("base").champion(P1, KAISA_SURVIVOR, "kaisaZ").build();
    await game.p2.endTurn();
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("kaisaB")).toBe("trash");
    expect(game.cardsAt("championZone", P1)).toEqual(["kaisaZ"]);
    expect(game.zoneOf("kaisaA")).toBe("base");
  });
});
