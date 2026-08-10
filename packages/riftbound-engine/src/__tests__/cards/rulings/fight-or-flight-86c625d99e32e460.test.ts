/**
 * Ruling 86c625d99e32e460 — Fight or Flight (OGN-168 → ogn-168-298) · Spell [2] chaos · [Hidden] [Action]
 *   "Move a unit from a battlefield to its base."
 *   × Discipline (OGN-058 → ogn-058-298, Reaction: "Give a unit +2 [Might] this turn. Draw 1.")
 *   (Cull the Weak ogn-209-298 / Cull sfd-134-221 cited only as examples of spells that do NOT target.)
 *
 * Q: When flipping Fight or Flight (from hidden) as a reaction, is its target chosen before or after the opponent
 *    can react?
 * A: Before. Targets are declared as the spell is finalized (goes on the chain); only then does the opponent get
 *    priority to react (e.g. with Discipline). If nobody adds anything, FoF resolves on the declared target.
 * Rules: 351–355 (finalize: choose targets as it goes on the chain), 355.5 / 811.1.d.2 (from Hidden), 336 (reactions).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const DISCIPLINE = "ogn-058-298";

/** P2's turn (turn 3). P1 holds bf1 with Guard (3) and has FoF facedown there; P2's Raider (4) attacks; P2 holds Discipline + [2]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "fof")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, DISCIPLINE, "disc");
}

/** Raider attacks bf1; P2 passes Focus; P1 flips FoF naming Raider. */
async function flipOnRaider(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "fof")).toBe(true);
  await game.p1.reveal("fof", { answers: ["raider"] });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("raider");
  }
  return game;
}

describe("Ruling 86c625d99e32e460 — Fight or Flight's target is declared at finalization, before the opponent may react", () => {
  test("finalize: the flip asks P1 for the target FIRST (units at bf1 only) and the chain item carries it — P2 has not had priority yet", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.reveal("fof");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "fof" }, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["guard", "raider"]);
    await game.p1.pick("raider");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", controller: P1, targets: ["raider"] })]);
    expect(game.p1.energy()).toBe(0); // from hidden: [0]
    // only NOW does anyone get priority — first the controller, then the opponent
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("the opponent's reaction window comes AFTER the target is locked: P2 may respond with Discipline (on Raider) while FoF[raider] sits below it", async () => {
    const game = await flipOnRaider();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", targets: ["raider"] })]);
    expect(game.p2.can("cast", "disc")).toBe(true);
    await game.p2.cast("disc", { targets: "raider" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fof", "disc"]);
    // Discipline resolves first (LIFO), then FoF still moves its declared target.
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("raider")).toBe("base");
    expect(game.state("raider").mightModifier).toBe(2); // Discipline landed on it before it left
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("if no one plays anything else, FoF simply resolves and enacts its effect on the declared target (Raider → P2's base, combat over, P1 keeps bf1)", async () => {
    const game = await flipOnRaider();
    await game.settle();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("raider")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
