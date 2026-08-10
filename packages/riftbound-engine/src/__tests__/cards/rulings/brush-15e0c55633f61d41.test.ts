/**
 * Ruling 15e0c55633f61d41 — Brush (UNL-T03 → unl-t03, battlefield token)
 *   × Green Father (UNL-195 → unl-195-219, Ivern legend)
 *   Green Father: "When you conquer or hold, you may exhaust me to replace that battlefield with a
 *   Brush battlefield token." Brush: "Bird, Cat, Dog, Poro, and Ivern units here have +1 [Might]. …"
 *
 * Q: Can Ivern put two Brushes on the same spot (conquer → Brush, then hold the Brush → Brush again)?
 * A: No. A Brush token IS the battlefield occupying that slot; once the slot is a Brush there is no
 *    original battlefield left to "replace", and two battlefields cannot share one slot. A second
 *    Replace on the same spot has nothing to act on.
 * Rules: 438.1 (Replace = create a token in the place of another card/token), 438.5, 187.8.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GREEN_FATHER = "unl-195-219";
const STALWART_PORO = "ogn-052-298"; // 2 Might Poro — reads Brush's +1

/** P1 (Green Father) conquers bf1 with a Poro and turns it into Brush. */
async function conquerIntoBrush(): Promise<Game> {
  const game = await scenario()
    .turn(3)
    .legend(P1, GREEN_FATHER, "gf")
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", STALWART_PORO, "poro")
    .unit(P2, "bf1", { might: 1, name: "Speedbump" }, "def")
    .build();
  await game.p1.move("poro", "bf1");
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "gf" } });
  await game.p1.yes();
  await game.settle();
  return game;
}

describe("Ruling 15e0c55633f61d41 — Green Father cannot stack a second Brush on a slot that is already Brush", () => {
  test("setup: the first conquer replaces bf1 with ONE Brush — the printed battlefield goes to banishment, the Poro on it reads +1", async () => {
    const game = await conquerIntoBrush();
    expect(game.battlefields()).toHaveLength(1);
    const slot = game.locationOf("poro") as string;
    expect(game.state(slot).name).toBe("Brush");
    expect(game.gameState.battlefields[slot]?.controller).toBe(P1);
    expect(game.cardsAt("banishment")).toHaveLength(1);
    expect(game.state(game.cardsAt("banishment")[0] as string).name).toBe("bf1");
    expect(game.state("poro").might).toBe(3);
    expect(game.state("gf").isExhausted).toBe(true);
  });

  test("holding the Brush next turn: Green Father asks again, but accepting does NOT create a second Brush — still one battlefield (the same Brush), banishment still holds only the original bf1", async () => {
    const game = await conquerIntoBrush();
    // P1 ends turn 3, P2 takes turn 4, P1's turn 5 begins: P1 holds the Brush.
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.state("gf").isReady).toBe(true); // readied in Awaken

    // Two P1 triggers on the hold: Green Father ("conquer or hold") and Brush's own swap-back ("when you score here").
    let sawGreenFather = false;
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || d?.kind !== "yes-no") {
        break;
      }
      expect(d.seat).toBe(P1);
      if (d.source?.cardId === "gf") {
        sawGreenFather = true;
        await game.p1.yes(); // try to Brush the Brush
      } else {
        await game.p1.no(); // decline Brush's optional swap-back — keep the slot a Brush
      }
    }
    expect(sawGreenFather).toBe(true);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(2); // conquer + hold both scored

    // The slot is still exactly one Brush; no second token, no Brush in banishment.
    expect(game.battlefields()).toHaveLength(1);
    expect(game.cardsAt("battlefieldRow")).toHaveLength(1);
    const slot = game.locationOf("poro") as string;
    expect(game.state(slot).name).toBe("Brush");
    expect(game.gameState.battlefields[slot]?.controller).toBe(P1);
    const banished = game.cardsAt("banishment");
    expect(banished).toHaveLength(1);
    expect(game.state(banished[0] as string).name).toBe("bf1");
    expect(banished.map((c) => game.state(c).name)).not.toContain("Brush");
    // Only ONE Brush aura applies: the Poro is 2 + 1, not 2 + 2.
    expect(game.state("poro").might).toBe(3);
  });
});
