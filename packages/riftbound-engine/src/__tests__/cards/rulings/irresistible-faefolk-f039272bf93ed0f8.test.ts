/**
 * Ruling f039272bf93ed0f8 — Irresistible Faefolk (UNL-112 → unl-112-219) · Unit · Body · 2 · 1 Might
 *     "When I move to a battlefield, you may move an enemy unit to that battlefield."
 *   × Rengar, Trophy Hunter (UNL-120 → unl-120-219) 6 Might "[Ambush] (You may play me as a [Reaction] to a battlefield where
 *     you have units.) I can be played to a battlefield where there are enemy units …"
 *   × Kha'Zix, Mutating Horror (unl-143-219) 4 Might "[Ambush] When I attack or defend, if an enemy unit is alone here, give me
 *     +2 [Might] this turn and gain 2 XP." (the enemy 'when I defend, if an enemy unit is alone here' unit)
 *
 * Q: I move a 'When I move' unit to a battlefield and, before that trigger resolves, Ambush a second unit in. Does the
 *    enemy's "when I defend, if an enemy unit is alone here" trigger still fire?
 * A: No. Combat does not begin until the chain is empty; by the time Attacker/Defender designations are assigned there are
 *    TWO enemy units there, so the 'alone' condition fails at the moment of designation and the trigger never activates.
 * Rules: 401.1/323.13 (a staged combat only begins in a Neutral Open state — after the chain empties), 725 (Ambush),
 *        383.2 (an "if" condition is checked when the trigger would fire), 464.2 (designations at combat start).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FAEFOLK = "unl-112-219";
const RENGAR = "unl-120-219";
const KHAZIX = "unl-143-219";

/** P1's turn with exactly 5+[body] (Rengar). P2 holds bf1 with a 2-Might Guard and keeps Kha'Zix (4) in base. Faefolk (1) ready in P1's base. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "base", KHAZIX, "khazix")
    .unit(P1, "base", FAEFOLK, "fae")
    .hand(P1, RENGAR, "rengar");
}

const showdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1);
const khazixItems = (game: Game) => game.chain().filter((c) => c.cardId === "khazix" && c.triggered);

/** Faefolk moves to bf1; P1 accepts its trigger and names Kha'Zix as the enemy unit to drag along. Stops with P1 on priority. */
async function faefolkMovesTargetingKhazix(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("fae", "bf1");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
  await game.p1.yes();
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("khazix");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fae", controller: P1, targets: ["khazix"], triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** Pass priority for whoever holds it until the chain is empty (accepting any soft order offer). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
}

describe("Ruling f039272bf93ed0f8 — Ambush a second unit in before the move trigger resolves: the defender's 'alone' trigger never fires", () => {
  test("Faefolk's move trigger is on the chain and NO combat has started: no showdown, no designations — a Closed state in which P1 holds priority", async () => {
    const game = await faefolkMovesTargetingKhazix();
    expect(showdown(game)).toBeUndefined();
    expect(game.state("fae").combatRole ?? null).toBeNull();
    expect(game.state("guard").combatRole ?? null).toBeNull();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
  });

  test("in that window Rengar is playable via Ambush as a Reaction — and only to bf1 (where P1 now has a unit); he enters bf1 while the Faefolk trigger is still pending", async () => {
    const game = await faefolkMovesTargetingKhazix();
    expect(game.p1.can("play", "rengar")).toBe(true);
    const to = game.p1.option("play", "rengar")?.fields.find((f) => f.name === "location")?.options;
    expect(to).toEqual(["battlefield-bf1"]);
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.locationOf("rengar")).toBe("bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fae", targets: ["khazix"] })]);
    expect(showdown(game)).toBeUndefined(); // still no combat
  });

  test("the chain resolves (Kha'Zix dragged to bf1), THEN combat begins: Faefolk + Rengar attack, Guard + Kha'Zix defend — two enemy units are here at designation, so Kha'Zix's trigger does NOT fire: no chain item, no +2 (stays 4), no XP", async () => {
    const game = await faefolkMovesTargetingKhazix();
    await game.p1.play("rengar", { to: "bf1" });
    await drainChain(game);
    expect(game.locationOf("khazix")).toBe("bf1");
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("fae").combatRole).toBe("attacker");
    expect(game.state("rengar").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.state("khazix").combatRole).toBe("defender");
    expect(khazixItems(game)).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.state("khazix")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.p2.xp()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // It stays that way through the whole combat.
    await game.settle();
    expect(game.p2.xp()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no Ambush: Faefolk is the ONLY enemy unit at bf1 when Kha'Zix becomes a Defender, so his trigger fires: +2 this turn (4 → 6) and P2 gains 2 XP", async () => {
    const game = await faefolkMovesTargetingKhazix();
    await drainChain(game); // Faefolk's trigger resolves; combat begins; Kha'Zix's trigger is queued …
    expect(game.locationOf("khazix")).toBe("bf1");
    expect(game.state("khazix").combatRole).toBe("defender");
    if (game.chain().length > 0) {
      expect(khazixItems(game)).toHaveLength(1);
      await drainChain(game); // … and resolves
    }
    expect(game.state("khazix")).toMatchObject({ might: 6, mightModifier: 2 });
    expect(game.p2.xp()).toBe(2);
  });
});
