/**
 * Ruling ade1034fce10ffc1 — Existential Dread (UNL-134 → unl-134-219) · Spell · Chaos · [1][chaos] · Action · [Repeat][2]
 *     "[Stun] an attacking enemy unit. If it's already stunned, return it to its owner's hand instead."
 *   × Shadow (UNL-194 → unl-194-219) · Unit · 3 · "[Action] [1][rainbow], [Exhaust]: [Stun] an enemy unit attacking here."
 *   (caveat helper: Rengar, Trophy Hunter UNL-120 → unl-120-219 — a unit that can be Reaction-played onto that battlefield.)
 *
 * Q: If I move into an OPEN battlefield, is my unit "an attacking unit" for spells like Existential Dread?
 * A: No. Moving onto an empty battlefield opens a Non-Combat Showdown; Attacker/Defender designations only exist in Combat, so
 *    Existential Dread (or Shadow's ability) has nothing to target. Caveat: if the opponent Reaction-plays a unit there (Ambush),
 *    the showdown becomes a Combat Showdown, you become the Attacker (you applied Contested), and from then on those stuns can
 *    hit your unit.
 * Rules: 437 / 442.1 (designations are a combat thing), 344 (non-combat showdown), 459.2 / 323.14 (becomes combat when a
 *        combat is staged there), 355.8 (no legal target → can't be played).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EXISTENTIAL_DREAD = "unl-134-219";
const SHADOW = "unl-194-219";
const RENGAR = "unl-120-219";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const dreadTargets = (game: Game) => (game.p2.option("cast", "dread")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();

/**
 * P1's turn. bf1 open and uncontrolled. P1: Rover (3) in base. P2: Existential Dread in hand with [1][chaos] (+ [5][body] and a
 * rainbow for the caveat's Rengar / Shadow), Shadow standing at P2's bf2, Rengar in hand.
 */
function board() {
  return scenario()
    .resources(P2, { energy: 7, power: { body: 1, chaos: 1, rainbow: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Rover" }, "rover")
    .unit(P2, "bf2", SHADOW, "shadow")
    .hand(P2, EXISTENTIAL_DREAD, "dread")
    .hand(P2, RENGAR, "rengar");
}

async function roverWalksIn(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("rover", "bf1");
  return game;
}

describe("Ruling ade1034fce10ffc1 — a unit that walked onto an open battlefield is not 'attacking' (until an Ambush makes it a combat)", () => {
  test("the move opens a NON-combat showdown at bf1: the Rover has NO attacker designation", async () => {
    const game = await roverWalksIn();
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.state("rover").combatRole).toBeNull();
    expect(game.state("rover").combatRole).not.toBe("attacker");
  });

  test("so when P2 gets Focus, Existential Dread ('an attacking enemy unit') has no legal target and cannot be cast at the Rover; Shadow's 'attacking here' ability is likewise unusable", async () => {
    const game = await roverWalksIn();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(dreadTargets(game)).toEqual([]);
    expect(game.p2.can("cast", "dread")).toBe(false);
    const r = await game.p2.try((p) => p.cast("dread", { targets: "rover" }));
    expect(r.ok).toBe(false);
    expect(game.state("rover")).toMatchObject({ isStunned: false, location: "bf1" });
    expect(game.p2.can("activate", "shadow")).toBe(false);
    const r2 = await game.p2.try((p) => p.activate("shadow"));
    expect(r2.ok).toBe(false);
  });

  test("left alone, the showdown just closes and P1 conquers bf1 with an un-stunned Rover", async () => {
    const game = await roverWalksIn();
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("rover")).toMatchObject({ isStunned: false, location: "bf1" });
    expect(game.p1.points()).toBe(1);
  });

  test("caveat: P2 Reaction-plays Rengar onto bf1 → it becomes a COMBAT showdown, the Rover (P1 applied Contested) is now the ATTACKER — and Existential Dread can target and stun it", async () => {
    const game = await roverWalksIn();
    await game.p1.passFocus();
    expect(game.p2.can("play", "rengar")).toBe(true);
    await game.p2.play("rengar", { to: "bf1" });
    for (let i = 0; i < 6 && game.zoneOf("rengar") !== "battlefield-bf1"; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("rover").combatRole).toBe("attacker");
    expect(game.state("rengar").combatRole).toBe("defender");
    // Get Focus to P2 with an empty chain, then Dread the Rover.
    for (let i = 0; i < 4 && !(game.decision()?.seat === P2 && game.decision()?.kind === "action" && game.chain().length === 0); i++) {
      await game.acting().pass();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(dreadTargets(game)).toEqual(["rover"]);
    await game.p2.cast("dread", { targets: "rover" });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("dread")).toBe("trash");
    expect(game.state("rover")).toMatchObject({ combatRole: "attacker", isStunned: true, location: "bf1" });
    // The stunned attacker deals nothing: Rengar (6) kills the Rover (3) and P2 ends up holding bf1.
    await game.settle();
    expect(game.zoneOf("rover")).toBe("trash");
    expect(game.state("rengar")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
