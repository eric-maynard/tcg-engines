/**
 * Ruling b5aabc5c96fea7ca — En Garde (OGN-046 → ogn-046-298) · Reaction · 1 · "Give a friendly unit +1 [Might] this turn, then an
 *     additional +1 [Might] this turn if it is the only unit you control there."
 *   × Blastcone Fae (OGN-097 → ogn-097-298) · 2 Might · "[Hidden] When you play me, give a unit -2 [Might] this turn, to a minimum
 *     of 1." (Blast Cone unl-133-219 / Wielder of Water ogn-055-298 are cited only as contrasts.)
 *
 * Q: I En Garde my LONE unit at a battlefield (+2); later, on a subsequent chain, I play Blastcone Fae there (a second unit).
 *    Do I keep the +2?
 * A: Yes. En Garde checks "only unit you control there" once, when it RESOLVES; adding a unit afterwards does not undo it.
 *    Sequence in a showdown: attacker passes Focus → defender En Gardes (alone: +2) → both pass, it resolves → attacker gets
 *    Focus again and passes → defender now plays the Fae → the unit still has +2. Contrast: Fae first and En Garde on the same
 *    chain → two units are there when En Garde resolves → only +1.
 * Rules: 359 (effects evaluate their conditions on resolution), 341–344 (Focus passes; one chain at a time), 811 (Hidden).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EN_GARDE = "ogn-046-298";
const BLASTCONE_FAE = "ogn-097-298";

/**
 * P1's turn. P2 controls bf1 with a lone Defender (2) and has Blastcone Fae face-down there (hidden on an earlier turn);
 * P2 holds En Garde with exactly 1 energy. P1's Attacker (3) is ready in base.
 */
function board() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
    .facedown(P2, "bf1", BLASTCONE_FAE, "fae")
    .unit(P1, "base", { might: 3, name: "Attacker" }, "atk")
    .hand(P2, EN_GARDE, "eg");
}

/** Attacker moves in (combat showdown, P1 has Focus) and passes Focus to P2. */
async function showdownP2Focus(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("atk", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

/** Reveal the Fae at bf1 and aim its -2 at the Attacker; pass until its trigger has resolved. */
async function revealFae(game: Game): Promise<void> {
  await game.p2.reveal("fae", { answers: ["atk"] });
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick("atk");
    } else {
      break;
    }
  }
  expect(game.zoneOf("fae")).toBe("battlefield-bf1");
}

describe("Ruling b5aabc5c96fea7ca — En Garde's 'alone' bonus is checked once on resolution; a later Blastcone Fae doesn't remove it", () => {
  test("P2 (defender, with Focus) En Gardes the lone Defender; both pass and it resolves: +1 and the additional +1 → Defender 4", async () => {
    const game = await showdownP2Focus();
    expect(game.p2.units("bf1")).toEqual(["def"]); // alone (the face-down Fae is not a unit on the board)
    await game.p2.cast("eg", { targets: "def" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["eg"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("def")).toMatchObject({ might: 4, mightModifier: 2 });
  });

  test("after that chain the ATTACKER holds Focus again; P2 cannot start the Fae play until P1 passes — then P2 reveals Blastcone Fae at bf1 (a second unit there) and the Defender STILL has +2 (4 Might)", async () => {
    const game = await showdownP2Focus();
    await game.p2.cast("eg", { targets: "def" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // Focus back with the attacker
    expect(game.p2.can("reveal", "fae")).toBe(false); // no chain to react to, no Focus
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "fae")).toBe(true);
    await revealFae(game);
    // Let the Fae's trigger resolve.
    for (let i = 0; i < 4 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
      await game.acting().passPriority();
    }
    expect(game.p2.units("bf1").toSorted()).toEqual(["def", "fae"]); // no longer alone …
    expect(game.state("def")).toMatchObject({ might: 4, mightModifier: 2 }); // … but the +2 stays
    expect(game.state("atk").might).toBe(1); // Fae's -2 (min 1) landed on the Attacker
    // Combat: 4 + 2 vs 1 → Attacker dies, P2 keeps bf1.
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: Fae FIRST (it enters bf1 at once), then En Garde on the same chain — when En Garde resolves the Defender is not alone, so it gets only +1 (3 Might)", async () => {
    const game = await showdownP2Focus();
    await revealFae(game);
    expect(game.p2.units("bf1").toSorted()).toEqual(["def", "fae"]);
    // Fae's trigger is on the chain; P2 answers with En Garde on the same chain.
    expect(game.chain().map((c) => c.cardId)).toEqual(["fae"]);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("eg", { targets: "def" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fae", "eg"]);
    await game.settle();
    expect(game.state("def")).toMatchObject({ mightModifier: 1 });
    expect(game.zoneOf("eg")).toBe("trash");
  });
});
