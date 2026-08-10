/**
 * Ruling 0845ddd42af1bd9e — (general Hidden-timing question) illustrated with Hidden Blade (ogn-213-298 · [Hidden][Action]
 *   "Kill a unit at a battlefield. Its controller draws 2.") facedown at the defended battlefield.
 *
 * Q: During a showdown I'm about to lose, what is the last moment I could play my hidden card if the opponent triggers nothing?
 * A: When YOU (the defender) hold Focus/priority in the showdown, before both players pass in succession — once both pass with
 *    nothing on the chain the showdown closes and combat damage is dealt. If a spell is on the chain that is never the last
 *    moment: you can still respond to it. (Hidden cards play at Reaction speed for [0] and act "here"; a hidden card left at a
 *    battlefield you lose goes to the trash.)
 * Rules: 811 (Hidden), 345–348 (Focus passes; all pass ⇒ showdown closes), 465/466 (combat damage; 466.5.c loser's facedown trashed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
/** P2's showdown-speed poke, to show "a chain is never the last moment". */
const POKE = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Poke",
  timing: "action",
} as const;

/** P2's turn 3. P1 holds bf1 with a lone Lookout (1) and Hidden Blade facedown there. P2's Raider (5) attacks; P2 has Poke + [1]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Lookout" }, "lookout")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P2, POKE, "poke")
    .deck(P2, ["ogn-175-298", "ogn-175-298"], ["e1", "e2"]);
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

async function raiderAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, defendingPlayer: P1, focusPlayer: P2 });
  return game;
}

describe("Ruling 0845ddd42af1bd9e — the defender's own Focus (before the double pass) is the last window for a hidden card", () => {
  test("the attacker acts first: while P2 holds Focus, P1 cannot flip anything yet", async () => {
    const game = await raiderAttacks();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("reveal", "blade")).toBe(false);
  });

  test("P2 passes → P1 holds Focus: THIS is the last moment — the hidden Hidden Blade is playable now (for [0], 'here' = the Raider), and using it kills the Raider so the Lookout survives and P1 keeps bf1", async () => {
    const game = await raiderAttacks();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade", { answers: ["raider"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["raider"] })]);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.p2.hand().sort()).toEqual(["e1", "e2", "poke"]); // "its controller draws 2"
    expect(game.zoneOf("lookout")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("miss it and it's gone: if P1 also passes, both consecutive passes close the showdown at once — combat damage kills the Lookout, P2 conquers bf1 and the never-played facedown Hidden Blade is trashed", async () => {
    const game = await raiderAttacks();
    await game.p2.passFocus();
    await game.p1.passFocus();
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.zoneOf("lookout")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.can("reveal", "blade")).toBe(false);
  });

  test("nuance — a chain is never the 'last moment': if P2 uses its Focus to cast Poke, P1 gets priority in response and can flip the hidden card there too", async () => {
    const game = await raiderAttacks();
    await game.p2.cast("poke", { targets: "lookout" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade", { answers: ["raider"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["poke", "blade"]);
  });
});
