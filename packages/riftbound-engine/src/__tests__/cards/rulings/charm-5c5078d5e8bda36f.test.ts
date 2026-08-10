/**
 * Ruling 5c5078d5e8bda36f — Charm (OGN-043 → ogn-043-298) · Action · [1][calm] "Move an enemy unit."
 *   × Fortified Position (OGN-279 → ogn-279-298, Battlefield) "When you defend here, choose a unit. It gains [Shield 2] this
 *     combat."  × Bullet Time (OGN-268 → ogn-268-298, Action) "Pay any amount of [rainbow] to deal that much damage to all
 *     enemy units at a battlefield."  × Nocturne, Horrifying (OGN-194 → ogn-194-298, 4 Might) as the Charmed enemy.
 *
 * Q: Charm drags Nocturne into my Fortified Position (Ahri defends). Does the "When you defend here" Shield 2 resolve before
 *    the opponent can Bullet Time?
 * A: Yes. Charm's move starts the combat; Fortified Position's defend trigger goes on the chain and resolves (Ahri → 5 Might)
 *    and the chain clears BEFORE the opponent may play an Action like Bullet Time — only Reactions can answer a pending
 *    trigger. Ahri is a 5 when Bullet Time resolves.
 * Rules: 383.4.f (Defend trigger), 464.2 (combat chain at showdown start), 343.1.a (Closed state: Reactions only),
 *        806 (Action timing needs an empty chain + Focus), 814 (Shield X = +X Might while defending).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const FORTIFIED_POSITION = "ogn-279-298";
const BULLET_TIME = "ogn-268-298";
const NOCTURNE = "ogn-194-298";

/**
 * P1's turn. P1 controls the LIVE Fortified Position with a 3-Might "Ahri" defender. P2's Nocturne (4) sits at P2's bf2.
 * P1: Charm + [1][calm]. P2: Bullet Time + [1] and 4 rainbow Power to pour into it.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .resources(P2, { energy: 1, power: { rainbow: 4 } })
    .battlefield("fp", { controller: P1, def: FORTIFIED_POSITION, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "fp", { might: 3, name: "Ahri" }, "ahri")
    .unit(P2, "bf2", NOCTURNE, "nocturne")
    .hand(P1, CHARM, "charm")
    .hand(P2, BULLET_TIME, "bt");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1 Charms Nocturne into Fortified Position; Charm resolves; the combat opens with the Defend trigger pending. */
async function charmNocturneIn(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("charm", { targets: "nocturne" });
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("battlefield-fp");
  }
  await game.p1.passPriority();
  await game.p2.passPriority(); // Charm resolves → Nocturne arrives → combat at fp
  if (game.decision()?.kind === "pick" && game.zoneOf("charm") !== "trash") {
    await game.p1.pick("battlefield-fp");
  }
  expect(game.zoneOf("charm")).toBe("trash");
  expect(game.locationOf("nocturne")).toBe("fp");
  return game;
}

describe("Ruling 5c5078d5e8bda36f — Fortified Position's Shield 2 resolves before the Charmed-in attacker's side can Bullet Time", () => {
  test("Charm moving Nocturne in initiates a combat: Nocturne is the ATTACKER, Ahri the DEFENDER, and Fortified Position's 'When you defend here' trigger (P1's) is on the chain asking P1 to choose a unit", async () => {
    const game = await charmNocturneIn();
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "fp", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("nocturne").combatRole).toBe("attacker");
    expect(game.state("ahri").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fp", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "fp" } });
  });

  test("while that trigger is pending / on the chain, P2 can NOT play Bullet Time (an Action) — only Reactions could be added", async () => {
    const game = await charmNocturneIn();
    await game.p1.pick("ahri");
    expect(game.chain().map((c) => c.cardId)).toEqual(["fp"]);
    // Whoever holds priority now, Bullet Time is not among P2's legal plays.
    expect(game.p2.can("cast", "bt")).toBe(false);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
      expect(game.chain().map((c) => c.cardId)).toEqual(["fp"]);
      expect(game.p2.can("cast", "bt")).toBe(false); // still an Action facing a non-empty chain
    }
  });

  test("the trigger resolves and the chain clears: Ahri has Shield 2 for this combat and reads 5 Might; NOW P2 (attacker, Focus) may play Bullet Time", async () => {
    const game = await charmNocturneIn();
    await game.p1.pick("ahri");
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("ahri").grantedKeywords).toEqual([{ duration: "combat", keyword: "Shield", value: 2 }]);
    expect(game.state("ahri").might).toBe(5);
    // Attacker gets Focus first in the showdown.
    for (let i = 0; i < 2 && game.actingSeat() !== P2; i++) {
      await game.acting().passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "bt")).toBe(true);
  });

  test("Bullet Time for 4 then resolves against a FIVE-Might Ahri: she takes 4 < 5 and survives (without the Shield a 3-Might Ahri would have died)", async () => {
    const game = await charmNocturneIn();
    await game.p1.pick("ahri");
    await game.acting().passPriority();
    await game.acting().passPriority();
    for (let i = 0; i < 2 && game.actingSeat() !== P2; i++) {
      await game.acting().passFocus();
    }
    await game.p2.cast("bt", { targets: "fp", x: 4 });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Bullet Time resolves
    if (game.decision()?.kind === "integer") {
      await game.p2.chooseX(4);
    }
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.p2.power()).toBe(0); // 4 rainbow paid
    expect(game.state("ahri").might).toBe(5);
    expect(game.state("ahri").damage).toBe(4);
    expect(game.zoneOf("ahri")).toBe("battlefield-fp"); // alive
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "fp" });
    expect(game.violations()).toEqual([]);
  });
});
