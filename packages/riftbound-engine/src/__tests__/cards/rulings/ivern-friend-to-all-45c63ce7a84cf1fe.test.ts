/**
 * Ruling 45c63ce7a84cf1fe — Ivern, Friend to All (UNL-177 → unl-177-219) · Unit · Order · 6 · 6 Might
 *   "As you play me, choose Bird, Cat, Dog, or Poro. I gain that tag. When I conquer or hold, score 1 point if
 *    your units have all of the following tags among them — Bird, Cat, Dog, and Poro."
 *   × Bird token (unl-t02) · 1 Might · [Deflect] · Bird.
 *
 * Q: For Ivern's bonus point, must the Bird, Cat, Dog and Poro units all be at the same battlefield?
 * A: No. "Among them" checks all your units everywhere you have them (base and every battlefield); one of each
 *    tag anywhere in play under your control satisfies it.
 * Rules: 740.1.a ("your" units = units you control, wherever they are), 383.4.d / 442 (Hold), 441 (Conquer).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const IVERN = "unl-177-219";
const BIRD_TOKEN = "unl-t02";

/**
 * P2 is finishing turn 2. P1 controls bf1 (Ivern + Bird token) and bf2 (a lone Cat); the Dog and (optionally)
 * the Poro sit in P1's BASE — the four tags are spread over three different locations.
 */
function spreadBoard(withPoro: boolean) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", IVERN, "ivern")
    .unit(P1, "bf1", BIRD_TOKEN, "bird")
    .unit(P1, "bf2", { might: 2, name: "Test Cat", tags: ["Cat"] }, "cat")
    .unit(P1, "base", { might: 3, name: "Test Dog", tags: ["Dog"] }, "dog");
  return withPoro ? b.unit(P1, "base", { might: 1, name: "Test Poro", tags: ["Poro"] }, "poro") : b;
}

describe("Ruling 45c63ce7a84cf1fe — Ivern's Bird/Cat/Dog/Poro check spans every location you control", () => {
  test("hold: Bird with Ivern at bf1, Cat alone at bf2, Dog + Poro in base → P1 scores hold bf1 (1) + hold bf2 (1) + Ivern's bonus (1) = 3", async () => {
    const game = await spreadBoard(true).build();
    expect(game.p1.points()).toBe(0);
    expect(game.locationOf("ivern")).toBe("bf1");
    expect(game.locationOf("bird")).toBe("bf1");
    expect(game.locationOf("cat")).toBe("bf2");
    expect(game.locationOf("dog")).toBe("base");
    expect(game.locationOf("poro")).toBe("base");
    await game.advanceTurn(); // P2 ends → P1's Beginning Phase holds bf1 and bf2
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(3);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — same spread but no Poro anywhere: the condition fails and only the two hold points are scored (2)", async () => {
    const game = await spreadBoard(false).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });

  test("conquer: Ivern walks alone onto empty bfX while Bird, Cat, Dog and Poro all wait in BASE → conquer (1) + Ivern's bonus (1) = 2", async () => {
    const game = await scenario()
      .battlefield("bfX", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", IVERN, "ivern")
      .unit(P1, "base", BIRD_TOKEN, "bird")
      .unit(P1, "base", { might: 2, name: "Test Cat", tags: ["Cat"] }, "cat")
      .unit(P1, "base", { might: 3, name: "Test Dog", tags: ["Dog"] }, "dog")
      .unit(P1, "base", { might: 1, name: "Test Poro", tags: ["Poro"] }, "poro")
      .build();
    expect(game.p1.points()).toBe(0);
    await game.p1.move("ivern", "bfX");
    await game.settle();
    expect(game.gameState.battlefields.bfX?.controller).toBe(P1);
    expect(game.p1.units("bfX")).toEqual(["ivern"]); // none of the tagged units came along
    expect(game.p1.points()).toBe(2);
  });
});
