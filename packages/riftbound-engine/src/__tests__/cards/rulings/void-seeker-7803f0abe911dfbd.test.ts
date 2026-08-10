/**
 * Ruling 7803f0abe911dfbd — Void Seeker (OGN-024 → ogn-024-298) · Action · [3]+[fury] · "Deal 4 to a unit at a battlefield. Draw 1."
 *   × a hidden card at the battlefield (Ride the Wind OGN-173 is the card the ruling names as the exploit; here the facedown card is
 *     Hidden Blade ogn-213-298 "[Hidden] … Kill a unit at a battlefield. Its controller draws 2." so the flip is observable with no
 *     friendly unit left).
 *
 * Q: A player controls a battlefield with a hidden card there; all their units there are removed DURING COMBAT (e.g. Void Seeker).
 *    Do they lose control at once, or can they still use the hidden card?
 * A: During a combat they keep control until the combat fully resolves, so the hidden card stays and can still be flipped. Only
 *    after combat ends do they lose control for having no units. Outside combat, losing the last unit loses control in the very
 *    next cleanup and the hidden card is put in the trash.
 * Rules: 190.4.c / 323.6 (no control loss while a Showdown/Combat is ongoing there), 323.7 (hidden cards at battlefields you no
 *        longer control → trash), 811 (Hidden / play from facedown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const HIDDEN_BLADE = "ogn-213-298";

/** P2 holds bf1 with a lone 3-Might Defender and a facedown Hidden Blade. P1: a 5-Might Attacker in base, Void Seeker + [3]+fury. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Defender" }, "defender")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
    .unit(P1, "base", { might: 5, name: "Attacker" }, "attacker")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4"])
    .hand(P1, VOID_SEEKER, "vs");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;
const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1 attacks bf1 and, holding Focus, Void Seekers the Defender; both pass so it resolves. Combat is still open. */
async function defenderSeekeredMidCombat(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("attacker", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("vs", { targets: "defender" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Void Seeker resolves: 4 ≥ 3
  expect(game.zoneOf("vs")).toBe("trash");
  expect(game.zoneOf("defender")).toBe("trash");
  expect(game.p1.hand()).toEqual(["d1"]); // "Draw 1"
  return game;
}

describe("Ruling 7803f0abe911dfbd — control (and the hidden card) survive losing your last unit mid-combat; not so outside combat", () => {
  test("mid-combat: with the Defender gone P2 has NO units at bf1, yet still controls it, the combat is still ongoing, and the facedown Hidden Blade is still there", async () => {
    const game = await defenderSeekeredMidCombat();
    expect(game.p2.units("bf1")).toEqual([]);
    expect(bf1(game)?.controller).toBe(P2);
    expect(showdown(game)?.active).toBe(true);
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.p2.facedown("bf1")).toEqual(["blade"]);
  });

  test("… so P2 can still flip it: Hidden Blade is revealed for [0] at the Attacker (a unit at THAT battlefield), resolves, kills it, and P1 (its controller) draws 2", async () => {
    const game = await defenderSeekeredMidCombat();
    // Walk to P2's window inside the showdown.
    for (let i = 0; i < 4 && !(game.actingSeat() === P2 && game.p2.can("reveal", "blade")); i++) {
      await game.acting().pass();
    }
    expect(game.p2.can("reveal", "blade")).toBe(true);
    await game.p2.reveal("blade", { answers: ["attacker"] });
    expect(game.p2.energy()).toBe(0); // played from hidden ignoring its cost
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P2 })]);
    await game.settle();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("attacker")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1", "d2", "d3"]); // Void Seeker's 1 + Hidden Blade's 2
    expect(game.p1.points()).toBe(0); // nobody conquered
    expect(game.violations()).toEqual([]);
  });

  test("only once the combat has fully resolved does empty-handed P2 lose bf1 (nobody controls it: the Attacker died too)", async () => {
    const game = await defenderSeekeredMidCombat();
    for (let i = 0; i < 4 && !(game.actingSeat() === P2 && game.p2.can("reveal", "blade")); i++) {
      await game.acting().pass();
    }
    await game.p2.reveal("blade", { answers: ["attacker"] });
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(bf1(game)?.controller ?? null).toBeNull();
  });

  test("if P2 does NOT flip it: the Attacker conquers after combat, P2 loses control, and the now-foreign hidden card is trashed (323.7)", async () => {
    const game = await defenderSeekeredMidCombat();
    await game.settle();
    expect(bf1(game)?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.facedown("bf1")).toEqual([]);
  });

  test("contrast — OUTSIDE combat: Void Seeker kills P2's lone Defender from afar; in the very next cleanup P2 loses bf1 and the hidden Hidden Blade goes to P2's trash unplayed", async () => {
    const game = await board().build();
    await game.p1.cast("vs", { targets: "defender" }); // main phase, no showdown
    await game.settle();
    expect(game.zoneOf("defender")).toBe("trash");
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(bf1(game)?.controller ?? null).toBeNull();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.trash()).toContain("blade");
    expect(game.p2.facedown("bf1")).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1"]); // only Void Seeker's draw — the Blade was never played
    expect(game.violations()).toEqual([]);
  });
});
