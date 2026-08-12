/**
 * Ruling c296d9b535511548 — Sett, Kingpin (OGN-240 → ogn-240-298) · Champion Unit · Order · [4][order] · 5 Might
 *     "[Tank] I get +1 [Might] for each buffed friendly unit at my battlefield."
 *
 * Q: Does Sett count HIMSELF among the buffed friendly units at his battlefield?
 * A: Yes. The line says "each buffed friendly unit at my battlefield" with no exclusion — a card that means to
 *    leave the source out says "other friendly units". A buffed Sett therefore counts himself plus every other
 *    buffed friendly unit standing with him.
 * Rules: 740.1.a / 740.2.a ("friendly" = shares my controller; exclusions are written "other"),
 *        105.2 (a buff is a +1 [Might] buff counter), 522 (the static recomputes continuously).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SETT = "ogn-240-298";

/** P1's turn 3. bf1 is P1's; bf2 is P2's. Sett's placement and buff state are set per test. */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 });
}

describe("Ruling c296d9b535511548 — Sett, Kingpin counts himself as a buffed friendly unit at his battlefield", () => {
  test("UNBUFFED Sett alone at his battlefield: nothing to count → plain 5 Might", async () => {
    const game = await board().unit(P1, "bf1", SETT, "sett").build();
    expect(game.state("sett")).toMatchObject({ baseMight: 5, isBuffed: false, might: 5 });
  });

  test("BUFFED Sett alone at his battlefield: 5 + 1 (the buff) + 1 (his own passive counting himself) = 7", async () => {
    const game = await board().unit(P1, "bf1", SETT, "sett", { buffed: true }).build();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 7 });
  });

  test("buffed Sett next to ONE other buffed friendly unit: he counts both → 5 + 1 buff + 2 = 8", async () => {
    const game = await board()
      .unit(P1, "bf1", SETT, "sett", { buffed: true })
      .unit(P1, "bf1", { might: 2, name: "Bruiser" }, "bruiser", { buffed: true })
      .build();
    expect(game.state("sett").might).toBe(8);
  });

  test("UNBUFFED Sett next to one buffed friendly unit counts only that one → 5 + 1 = 6 (the self-count is what the buff adds)", async () => {
    const game = await board()
      .unit(P1, "bf1", SETT, "sett")
      .unit(P1, "bf1", { might: 2, name: "Bruiser" }, "bruiser", { buffed: true })
      .build();
    expect(game.state("sett").might).toBe(6);
  });

  test("an UNbuffed friendly unit beside him adds nothing, and a buffed ENEMY unit at his battlefield is not friendly", async () => {
    const game = await board()
      .unit(P1, "bf1", SETT, "sett", { buffed: true })
      .unit(P1, "bf1", { might: 2, name: "Plain" }, "plain")
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe", { buffed: true })
      .build();
    expect(game.state("sett").might).toBe(7); // still only himself
  });

  test("a buffed friendly unit at a DIFFERENT battlefield is not 'at my battlefield' — Sett still counts only himself", async () => {
    const game = await board()
      .unit(P1, "bf1", SETT, "sett", { buffed: true })
      .unit(P1, "bf2", { might: 2, name: "Elsewhere" }, "elsewhere", { buffed: true })
      .build();
    expect(game.state("sett").might).toBe(7);
  });

  test("in BASE the clause has no battlefield to scope to, so even a buffed Sett gets no self-count: 5 + 1 buff = 6", async () => {
    const game = await board().unit(P1, "base", SETT, "sett", { buffed: true }).build();
    expect(game.state("sett").might).toBe(6);
    expect(game.violations()).toEqual([]);
  });
});
