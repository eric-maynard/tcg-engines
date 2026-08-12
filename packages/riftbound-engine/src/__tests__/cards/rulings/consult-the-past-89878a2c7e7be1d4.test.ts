/**
 * Ruling 89878a2c7e7be1d4 — Consult the Past (OGN-083 → ogn-083-298) · Spell · Mind · [4] · [Hidden] [Reaction]
 *   "Draw 2."
 *
 * Q: My opponent moves to conquer battlefield B. Can I flip a Hidden Consult the Past that is at battlefield A,
 *    or must the hidden card be at the battlefield being moved to?
 * A: You may flip ANY hidden card whenever you could legally react — the battlefield it sits at is irrelevant.
 *    Moving on its own gives nobody a window; moving into a battlefield you do not control opens a Showdown, and
 *    that is the window. (The "target things at your own battlefield" limit only bites on cards that target;
 *    Consult the Past targets nothing.)
 * Rules: 344 (Contested ⇒ showdown ⇒ priority), 347 ([Reaction] speed), 811.1.d.2 (hidden targeting restriction
 *        applies to targets, and this card has none).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CONSULT_THE_PAST = "ogn-083-298";

/** P2's turn. P1 holds bfA (Sentry + the hidden card); bfB is either uncontrolled or already P2's. */
function board(bfBController: string | null) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: bfBController })
    .unit(P1, "bfA", { might: 3, name: "Sentry" }, "sentry")
    .facedown(P1, "bfA", CONSULT_THE_PAST, "consult")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
  // Durable control of bfB needs a body there (323.6); an uncontrolled bfB stays empty.
  return bfBController === P2 ? b.unit(P2, "bfB", { might: 2, name: "Squatter" }, "squatter") : b;
}

/** P2 moves into the UNCONTROLLED bfB, which stages a showdown and hands P1 a window. */
async function movedIntoShowdown(): Promise<Game> {
  const game = await board(null).build();
  await game.p2.move("raider", "bfB");
  expect(game.decision()).toMatchObject({ context: "showdown" });
  await game.p2.passFocus();
  return game;
}

describe("Ruling 89878a2c7e7be1d4 — a Hidden card flips from ANY battlefield, whenever you may react", () => {
  test("moving to conquer an uncontrolled battlefield opens a Showdown — that is the reaction window", async () => {
    const game = await movedIntoShowdown();
    expect(game.locationOf("raider")).toBe("bfB");
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
  });

  test("the hidden card at the OTHER battlefield (bfA) is flippable although the showdown is at bfB", async () => {
    const game = await movedIntoShowdown();
    expect(game.zoneOf("consult")).toBe("facedown-bfA");
    expect(game.p1.can("reveal", "consult")).toBe(true);
  });

  test("flipping it resolves normally: P1 draws 2 and the spell goes to the trash", async () => {
    const game = await movedIntoShowdown();
    const handBefore = game.p1.hand().length;
    await game.p1.reveal("consult");
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.p1.hand().length).toBe(handBefore + 2);
    expect(game.zoneOf("consult")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a move that starts no showdown gives no window: P2 keeps acting and P1 cannot flip", async () => {
    const game = await board(P2).build();
    await game.p2.move("raider", "bfB"); // bfB is already P2's, nothing is contested
    expect(game.decision()).toMatchObject({ context: "main", seat: P2 });
    expect(game.p1.can("reveal", "consult")).toBe(false);
    expect(game.zoneOf("consult")).toBe("facedown-bfA");
  });
});
