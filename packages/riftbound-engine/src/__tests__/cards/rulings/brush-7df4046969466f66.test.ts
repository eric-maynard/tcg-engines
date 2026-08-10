/**
 * Ruling 7df4046969466f66 — Brush (UNL-T03 → unl-t03, battlefield token)
 *     "Bird, Cat, Dog, Poro, and Ivern units here have +1 [Might]. When you score here, you may replace this with
 *      the battlefield it replaced."
 *   × Green Father (UNL-195 → unl-195-219, legend) "When you conquer or hold, you may exhaust me to replace that
 *     battlefield with a Brush battlefield token."
 *
 * Q: What happens if you Brush a Brush?
 * A: The old Brush token ceases to exist and a Brush occupies that slot (never two battlefields in one slot). The
 *    replacement inherits the link to the ORIGINAL battlefield, so when you later score there and choose to swap
 *    back, the original printed battlefield returns to that slot.
 * Rules: 438.1 (Replace), 438.5 (replaced card waits in banishment), 438.7.b (replacer inherits the relationship),
 *        186.1 (a token leaving play ceases to exist).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GREEN_FATHER = "unl-195-219";
const STALWART_PORO = "ogn-052-298"; // 2-Might Poro — reads Brush's +1
const ORIGINAL_NAME = "Overgrown Shrine"; // the printed battlefield's name (inline, rules-inert)

/** The card currently occupying the Poro's battlefield slot. */
const slotCard = (game: Game) => game.locationOf("poro") as string;
const namesIn = (game: Game, zone: string) => game.cardsAt(zone).map((c) => game.state(c).name);

/** Turn 3: P1 (Green Father) conquers the Shrine with the Poro and Brushes it. */
async function conquerIntoBrush(): Promise<Game> {
  const game = await scenario()
    .turn(3)
    .legend(P1, GREEN_FATHER, "gf")
    .battlefield("bf1", { controller: P2, def: { cardType: "battlefield", name: ORIGINAL_NAME } })
    .unit(P1, "base", STALWART_PORO, "poro")
    .unit(P2, "bf1", { might: 1, name: "Speedbump" }, "def")
    .build();
  expect(game.state("bf1").name).toBe(ORIGINAL_NAME);
  await game.p1.move("poro", "bf1");
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "gf" } });
  await game.p1.yes();
  await game.settle();
  expect(game.state(slotCard(game)).name).toBe("Brush");
  expect(namesIn(game, "banishment")).toEqual([ORIGINAL_NAME]); // 438.5
  expect(game.p1.points()).toBe(1);
  return game;
}

/**
 * Pass the turn around to P1's next Beginning Phase (P1 holds the slot) and answer the two optional hold
 * triggers: Green Father ("Brush it") and Brush's own swap-back. Both must be surfaced as P1 yes/no prompts.
 */
async function holdAndAnswer(game: Game, answers: { greenFather: boolean; swapBack: boolean }): Promise<void> {
  await game.p1.endTurn();
  await game.settle();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  let sawGreenFather = false;
  let sawSwapBack = false;
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "yes-no") {
      break;
    }
    expect(d.seat).toBe(P1);
    if (d.source?.cardId === "gf") {
      sawGreenFather = true;
      await (answers.greenFather ? game.p1.yes() : game.p1.no());
    } else {
      // Brush's "When you score here, you may replace this with the battlefield it replaced."
      expect(game.state(d.source?.cardId as string).name).toBe("Brush");
      sawSwapBack = true;
      await (answers.swapBack ? game.p1.yes() : game.p1.no());
    }
  }
  expect(sawGreenFather).toBe(true);
  expect(sawSwapBack).toBe(true);
  expect(game.phase()).toBe("main");
}

describe("Ruling 7df4046969466f66 — Brushing a Brush leaves one Brush; swapping back later restores the ORIGINAL battlefield", () => {
  test("Brush the Brush on the hold: the slot is still exactly ONE Brush battlefield (P1's, Poro at +1), and banishment holds only the original Shrine — no Brush token lingers anywhere", async () => {
    const game = await conquerIntoBrush();
    await holdAndAnswer(game, { greenFather: true, swapBack: false });
    expect(game.p1.points()).toBe(2); // conquer (t3) + hold (t5)
    expect(game.battlefields()).toHaveLength(1);
    expect(namesIn(game, "battlefieldRow")).toEqual(["Brush"]);
    expect(game.state(slotCard(game)).name).toBe("Brush");
    expect(game.gameState.battlefields[slotCard(game)]?.controller).toBe(P1);
    expect(game.state("poro").might).toBe(3); // one Brush aura, not two
    expect(namesIn(game, "banishment")).toEqual([ORIGINAL_NAME]); // a replaced token ceases to exist (186.1), it is not banished
    expect(game.state("gf").isExhausted).toBe(true); // the exhaust cost was paid
  });

  test("control — without re-Brushing, accepting Brush's swap-back on the hold restores the original Shrine to the slot (438.7)", async () => {
    const game = await conquerIntoBrush();
    await holdAndAnswer(game, { greenFather: false, swapBack: true });
    expect(game.p1.points()).toBe(2);
    expect(namesIn(game, "battlefieldRow")).toEqual([ORIGINAL_NAME]);
    expect(game.state(slotCard(game)).name).toBe(ORIGINAL_NAME);
    expect(game.gameState.battlefields[slotCard(game)]?.controller).toBe(P1);
    expect(namesIn(game, "banishment")).toEqual([]);
    expect(game.state("poro").might).toBe(2);
  });

  // 438.7.b — the Brush that replaced a Brush inherits the relationship with the ORIGINAL battlefield.
  test("on the NEXT hold, accepting Brush's swap-back returns the ORIGINAL Shrine (from banishment) to that slot — no Brush remains, the Poro stands there under P1's control and loses the +1", async () => {
    const game = await conquerIntoBrush();
    await holdAndAnswer(game, { greenFather: true, swapBack: false }); // turn 5: Brush the Brush
    await holdAndAnswer(game, { greenFather: false, swapBack: true }); // turn 7: swap back
    expect(game.p1.points()).toBe(3);
    expect(game.battlefields()).toHaveLength(1);
    expect(namesIn(game, "battlefieldRow")).toEqual([ORIGINAL_NAME]);
    expect(game.state(slotCard(game)).name).toBe(ORIGINAL_NAME);
    expect(game.gameState.battlefields[slotCard(game)]?.controller).toBe(P1);
    expect(namesIn(game, "banishment")).toEqual([]);
    expect(game.state("poro").might).toBe(2);
  });
});
