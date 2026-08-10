/**
 * Ruling bcba8e236f1d751b — Cannon Barrage (OGN-127 → ogn-127-298) Reaction [2][body] "Deal 2 to all enemy units in combat."
 *   × Anivia, Primal (OGN-148 → ogn-148-298) "When I attack, deal 3 to all enemy units here."
 *   × Warwick, Hunter (OGN-159 → ogn-159-298) "When I attack, kill all damaged enemy units here."
 *
 * Q: Can the attacker order their "When I attack" triggers, and when are units "in combat" for Cannon Barrage as a reaction?
 * A: The controller orders simultaneous triggers (e.g. Warwick bottom, Anivia above). Units are in combat as soon as the showdown
 *    starts at the contested battlefield. With the triggers declared, the attacker gets priority and may play Cannon Barrage on
 *    top; the stack resolves Barrage → Anivia → Warwick; afterwards the attacker gets Focus for action-speed plays.
 * Rules: 383.3.d (order simultaneous triggers), 464 (initial combat chain; units designated attacker/defender), 340 (LIFO), 346 (Focus).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CANNON_BARRAGE = "ogn-127-298";
const ANIVIA = "ogn-148-298";
const WARWICK = "ogn-159-298";

const ids = (game: Game) => game.chain().map((c) => c.cardId);
const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn. P2 holds bf1 with two undamaged 9-Might Giants and has an Idler at bf2. P1: Warwick + Anivia in base, Cannon Barrage + [2][body]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Giant One" }, "g1")
    .unit(P2, "bf1", { might: 9, name: "Giant Two" }, "g2")
    .unit(P2, "bf2", { might: 2, name: "Idler" }, "idler")
    .unit(P1, "base", WARWICK, "ww")
    .unit(P1, "base", ANIVIA, "anivia")
    .hand(P1, CANNON_BARRAGE, "barrage");
}

function orderKey(game: Game, card: string): string {
  const d = game.decision();
  return (d?.kind === "order" ? d.items.find((i) => i.card === card)?.key : undefined) as string;
}

/** Attack with both; P1 orders Warwick bottom, Anivia on top. */
async function attackOrdered(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["ww", "anivia"], "bf1");
  expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
  await game.p1.order([orderKey(game, "ww"), orderKey(game, "anivia")]);
  expect(ids(game)).toEqual(["ww", "anivia"]);
  return game;
}

async function resolveTop(game: Game): Promise<void> {
  const before = game.chain().length;
  for (let i = 0; i < 4 && game.chain().length >= before; i++) {
    await game.acting().passPriority();
  }
}

describe("Ruling bcba8e236f1d751b — attacker orders Anivia/Warwick, units are 'in combat' at once, and Cannon Barrage fits on top as a Reaction", () => {
  test("moving onto the occupied bf1 starts the combat showdown immediately: all four units are designated in combat and P1 is asked to ORDER its two attack triggers", async () => {
    const game = await board().build();
    await game.p1.move(["ww", "anivia"], "bf1");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("ww").combatRole).toBe("attacker");
    expect(game.state("anivia").combatRole).toBe("attacker");
    expect(game.state("g1").combatRole).toBe("defender");
    expect(game.state("g2").combatRole).toBe("defender");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    expect(d?.kind === "order" ? d.items.map((i) => i.card).sort() : []).toEqual(["anivia", "ww"]);
  });

  test("with the triggers declared (Warwick bottom, Anivia top) the ATTACKER holds priority and may play Cannon Barrage as a Reaction on top: chain = ww, anivia, barrage", async () => {
    const game = await attackOrdered();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "barrage")).toBe(true);
    await game.p1.cast("barrage");
    expect(ids(game)).toEqual(["ww", "anivia", "barrage"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("resolution is reverse order: Barrage (2 to each enemy IN COMBAT — the Idler at bf2 is untouched) → Anivia (+3 = 5 each) → Warwick kills both damaged Giants", async () => {
    const game = await attackOrdered();
    await game.p1.cast("barrage");
    await resolveTop(game); // Cannon Barrage
    expect(ids(game)).toEqual(["ww", "anivia"]);
    expect(game.state("g1")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.state("g2")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.state("idler")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    await resolveTop(game); // Anivia
    expect(ids(game)).toEqual(["ww"]);
    expect(game.state("g1").damage).toBe(5);
    expect(game.state("g2").damage).toBe(5);
    await resolveTop(game); // Warwick
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("g1")).toBe("trash");
    expect(game.zoneOf("g2")).toBe("trash");
    expect(game.state("ww").damage).toBe(0);
    expect(game.state("anivia").damage).toBe(0);
  });

  test("after all triggers resolve the ATTACKER (P1) gets Focus in the still-open showdown; passing out ends with P1 conquering bf1", async () => {
    const game = await attackOrdered();
    await game.p1.cast("barrage");
    await resolveTop(game);
    await resolveTop(game);
    await resolveTop(game);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});

void P2;
