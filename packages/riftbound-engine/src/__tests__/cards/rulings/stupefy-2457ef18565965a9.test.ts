/**
 * Ruling 2457ef18565965a9 — Stupefy (OGN-095 → ogn-095-298, Reaction, 1) "Give a unit -1 [Might] this turn, to a minimum
 *   of 1 [Might]. Draw 1."
 *   × Counter Strike (SFD-194 → sfd-194-221, Reaction, 2 + 1 power) "Choose a unit. The next time that unit would be dealt
 *     damage this turn, prevent it. Draw 1."
 *
 * Q: My 3-Might Stellacorn attacks his 3-Might Ezreal. He Stupefies my Stellacorn (→ 2); I Counter Strike it. I have
 *    less Might so I "lose" and go back to base — do I draw, and is that a recall?
 * A: LIFO: Counter Strike resolves first (prevention shield on Stellacorn, I draw 1), then Stupefy (-1 this turn, he
 *    draws 1). Combat: Ezreal's 3 damage to Stellacorn is prevented; Stellacorn's 2 doesn't kill Ezreal. Both remain, so
 *    the attacker is RECALLED to base — not a move; it stays exhausted and keeps the -1 until end of turn.
 * Rules: 340 (LIFO), 437.4 / 437.5.b (prevented damage is not dealt), 465 (combat damage), 466.1.a.2 + 453/454
 *        (attackers recalled when defenders remain; a recall is not a move and changes no other state).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const COUNTER_STRIKE = "sfd-194-221";

/**
 * P1's turn. P2 holds bf1 with a 3-Might "Ezreal"; P1's 3-Might "Stellacorn" is ready in base. P1: Counter Strike with
 * exactly 2 + [calm]; P2: Stupefy with exactly 1. Known deck tops so the draws are visible.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Ezreal" }, "ezreal")
    .unit(P1, "base", { might: 3, name: "Stellacorn" }, "stella")
    .hand(P1, COUNTER_STRIKE, "cs")
    .hand(P2, STUPEFY, "stupefy")
    .deck(P1, ["ogn-175-298"], ["p1top"])
    .deck(P2, ["ogn-175-298"], ["p2top"]);
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Stellacorn attacks; P1 passes Focus; P2 Stupefies Stellacorn; P1 answers with Counter Strike on Stellacorn. */
async function stupefyThenCounterStrike(game: Game): Promise<void> {
  await game.p1.move("stella", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
  expect(game.state("stella").isExhausted).toBe(true); // exhausted by its move
  await game.p1.passFocus();
  expect(game.p2.can("cast", "stupefy")).toBe(true);
  await game.p2.cast("stupefy", { targets: "stella" });
  expect(game.p2.energy()).toBe(0);
  await game.p2.passPriority();
  expect(game.p1.can("cast", "cs")).toBe(true);
  await game.p1.cast("cs", { targets: "stella" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["stupefy", "cs"]);
}

describe("Ruling 2457ef18565965a9 — Stupefy vs Counter Strike on the attacker: draw yes, damage prevented, attacker recalled", () => {
  test("LIFO: Counter Strike resolves FIRST — P1 draws 1 and Stellacorn is still 3; then Stupefy — Stellacorn is 2 this turn and P2 draws 1", async () => {
    const game = await board().build();
    await stupefyThenCounterStrike(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Counter Strike resolves
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.p1.hand()).toEqual(["p1top"]);
    expect(game.state("stella").might).toBe(3);
    expect(game.chain().map((c) => c.cardId)).toEqual(["stupefy"]);
    expect(game.p2.hand()).toEqual([]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Stupefy resolves
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("stella")).toMatchObject({ might: 2, mightModifier: -1 });
    expect(game.p2.hand()).toEqual(["p2top"]);
    expect(game.chain()).toEqual([]);
    expect(showdown(game)?.active).toBe(true); // combat not yet resolved
  });

  test("combat: Ezreal's 3 to Stellacorn is PREVENTED (no damage marked, it survives), Stellacorn's 2 doesn't kill Ezreal → both remain → the attacker is RECALLED: Stellacorn in base, still exhausted, still -1 (2 Might) this turn; Ezreal keeps bf1; P1 kept its drawn card", async () => {
    const game = await board().build();
    await stupefyThenCounterStrike(game);
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    // Stellacorn: alive, home, unchanged state apart from location.
    expect(game.zoneOf("stella")).toBe("base");
    expect(game.p1.trash()).not.toContain("stella");
    expect(game.state("stella")).toMatchObject({ damage: 0, isExhausted: true, location: "base", might: 2, mightModifier: -1 });
    // Ezreal: alive at bf1 (took 2, healed in cleanup), P2 keeps the battlefield, nobody scores off this combat.
    expect(game.zoneOf("ezreal")).toBe("battlefield-bf1");
    expect(game.state("ezreal").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    // The draws stood.
    expect(game.p1.hand()).toEqual(["p1top"]);
    expect(game.p2.hand()).toEqual(["p2top"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the -1 is 'this turn' only: after the turn passes Stellacorn is back to 3", async () => {
    const game = await board().build();
    await stupefyThenCounterStrike(game);
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("stella")).toMatchObject({ might: 3, mightModifier: 0 });
  });
});
