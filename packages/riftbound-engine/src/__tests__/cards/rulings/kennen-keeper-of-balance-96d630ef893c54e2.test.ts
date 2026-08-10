/**
 * Ruling 96d630ef893c54e2 — Kennen, Keeper of Balance (VEN-135 → ven-135-166, 2 Might [Hidden]: "When you play me or
 *   attack, you may pay [2] to stun a unit. I have +2 [Might] while there is a stunned enemy unit here.")
 *   × Gust (OGN-169 → ogn-169-298, Reaction [1]: "Return a unit at a battlefield with 3 [Might] or less to its owner's hand.")
 *
 * Q: Kennen is played from hidden; can the opponent Gust her before her trigger resolves?
 * A: Yes — but it does not stop the stun. The [2] is paid and the stun target chosen at finalization (target must be at
 *    the battlefield she was hidden at); the trigger then resolves independently of Kennen. Only if the chosen target was
 *    Kennen herself does Gusting her make it fizzle.
 * Rules: 383.3.a–b / 383.4.a.2 (play effect finalized: cost + target, then on the chain), 811.1.d.2 (from Hidden: here),
 *        359 (resolves without its source), 359.3.e.5 (illegal target → nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KENNEN = "ven-135-166";
const GUST = "ogn-169-298";

/** P2's turn 3. P1 holds bf1 (Guard 3) with Kennen facedown there and [2] floating; P2's Raider (3) attacks; P2 has Far (1) at bf2, Gust + [1]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "bf2", { might: 1, name: "Far" }, "far")
    .facedown(P1, "bf1", KENNEN, "ken")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, GUST, "gust");
}

/** Raider attacks; P2 passes Focus; P1 flips Kennen, pays [2] and names `stunTarget`; P1 passes → P2 holds priority. */
async function flipKennenNaming(stunTarget: string): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  await game.p2.passFocus();
  await game.p1.reveal("ken");
  expect(game.zoneOf("ken")).toBe("battlefield-bf1"); // she is on the board already (finalized permanent)
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "ken", pendingChoiceType: "opt-in" } });
  await game.p1.yes();
  expect(game.p1.energy()).toBe(0); // [2] paid NOW, at finalization
  const pick = game.decision();
  expect(pick).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "ken" }, timing: "FIN" });
  // 811.1.d.2: only units at bf1 — Far (bf2) is not offered
  expect(pick?.kind === "pick" ? pick.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["guard", "ken", "raider"]);
  await game.p1.pick(stunTarget);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ken", controller: P1, targets: [stunTarget], triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 96d630ef893c54e2 — Gusting a just-flipped Kennen is legal but her already-finalized stun still resolves", () => {
  test("P2 may Gust Kennen (2 Might, at a battlefield) in response; Gust resolves first and she returns to hand — yet the trigger stays and stuns the chosen Raider", async () => {
    const game = await flipKennenNaming("raider");
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "ken" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ken", "gust"]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // Gust (LIFO)
    expect(game.zoneOf("ken")).toBe("hand");
    expect(game.p1.hand()).toContain("ken");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ken", countered: false, targets: ["raider"] })]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // Kennen's trigger
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").isStunned).toBe(true);
    expect(game.p1.energy()).toBe(0); // the [2] is not refunded
    expect(game.violations()).toEqual([]);
  });

  test("if the stun target was Kennen HERSELF, Gusting her makes the trigger fizzle: it leaves the chain with nobody stunned", async () => {
    const game = await flipKennenNaming("ken");
    await game.p2.cast("gust", { targets: "ken" });
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("ken")).toBe("hand");
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").isStunned).toBe(false);
    expect(game.state("guard").isStunned).toBe(false);
    expect(game.state("ken").isStunned).toBe(false);
  });

  test("control — un-Gusted, the same line stuns the Raider and Kennen (staying) gets her +2 for a stunned enemy here (2 → 4)", async () => {
    const game = await flipKennenNaming("raider");
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").isStunned).toBe(true);
    expect(game.locationOf("ken")).toBe("bf1");
    expect(game.state("ken").might).toBe(4);
  });
});
