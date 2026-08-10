/**
 * Ruling 1a798d889ce48613 — Overzealous Fan (SFD-128 → sfd-128-221, 2 Might)
 *   "When I defend, you may kill me to move an attacking unit to its base."
 *   × Not So Fast (SFD-045 → sfd-045-221, Reaction, 2 + [calm]) "Counter an enemy spell or ability that chooses a
 *     friendly unit or gear."
 *   × Moonfall (UNL-198 → unl-198-219, Action, 3 + 1 power) "Choose a battlefield where you have units. You may move
 *     up to one enemy unit to that battlefield. Then give enemy units there -2 [Might] this turn."
 *
 * Q: When does the Fan's ability trigger — before/after Focus is passed? Is the kill a cost? Can Not So Fast counter it?
 * A: It is a Defend trigger: it fires the moment the Fan gains the Defender designation — at combat start if it is
 *    already there, or (if it enters mid-combat, e.g. via Moonfall) when it next gains Defender. It is optional
 *    ("you may"), and "kill me" is paid UP FRONT as the trigger's cost, so countering the ability (Not So Fast is
 *    legal — it is an enemy ability choosing a friendly attacker) does not save the Fan.
 * Rules: 383.4.f (defend triggers; 383.4.f.2.a once per combat), 383.3.a/383.3.b/383.3.b.1 (leading "you may … kill
 *        me to" = opt-in + base cost paid at finalization), 425.1.c (countering refunds no costs).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FAN = "sfd-128-221";
const NOT_SO_FAST = "sfd-045-221";
const MOONFALL = "unl-198-219";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn. P2 holds bf1 with only the Fan; P1: 3-Might Raider ready in base, Not So Fast in hand with exactly 2 + [calm]. */
function fanDefending() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", FAN, "fan")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, NOT_SO_FAST, "nsf");
}

describe("Ruling 1a798d889ce48613 — Overzealous Fan: defend trigger timing, kill-as-cost, and Not So Fast", () => {
  test("Fan already at the battlefield: the trigger fires at COMBAT START — before anyone acts with Focus — as an optional (yes/no) finalization prompt for P2; nothing is paid before P2 answers", async () => {
    const game = await fanDefending().build();
    await game.p1.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("fan").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2, source: { cardId: "fan" }, timing: "FIN" });
    expect(game.zoneOf("fan")).toBe("battlefield-bf1"); // not yet killed
    expect(game.locationOf("raider")).toBe("bf1");
  });

  test("declining ('you may'): the pending trigger is simply removed — Fan stays and fights", async () => {
    const game = await fanDefending().build();
    await game.p1.move("raider", "bf1");
    await game.p2.no();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("accepting pays the cost UP FRONT: the Fan is killed immediately (before anyone gets priority) and the finalized ability sits on the chain choosing the Raider", async () => {
    const game = await fanDefending().build();
    await game.p1.move("raider", "bf1");
    await game.p2.yes();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", targets: ["raider"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.locationOf("raider")).toBe("bf1"); // not resolved yet
  });

  test("Not So Fast CAN counter it (enemy ability choosing P1's friendly Raider) — but the Fan stays dead: the kill was a cost, not part of the effect; the Raider is not moved and goes on to conquer the now-empty bf1", async () => {
    const game = await fanDefending().build();
    await game.p1.move("raider", "bf1");
    await game.p2.yes();
    await game.p2.passPriority();
    expect(game.p1.can("cast", "nsf")).toBe(true);
    expect(game.p1.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options).toEqual([["fan"]]);
    await game.p1.cast("nsf", { targets: "fan" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fan", "nsf"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("fan")).toBe("trash"); // countering did not save it
    expect(game.state("raider")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — uncountered: the ability resolves and the attacking Raider is moved to its base; nobody is left at bf1", async () => {
    const game = await fanDefending().build();
    await game.p1.move("raider", "bf1");
    await game.p2.yes();
    await game.settle();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toEqual(["nsf"]);
  });

  test("entering MID-COMBAT (P1 Moonfalls P2's Fan from base into the fight): the Fan gains Defender once the chain is empty and its trigger fires THEN — P2 gets the same optional prompt, and accepting kills the Fan and sends the Raider home", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .unit(P2, "base", FAN, "fan")
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, MOONFALL, "moonfall")
      .build();
    await game.p1.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.chain()).toEqual([]); // Fan is in base: no defend trigger yet
    expect(game.state("fan").combatRole).not.toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("moonfall");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    // Resolve Moonfall, moving the Fan (the enemy unit) to bf1.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        await game.seat(d.seat).passPriority();
      } else if (d?.kind === "pick" && d.seat === P1) {
        const key = d.options.find((o) => o.key === "fan" || o.card === "fan")?.key ?? d.options.find((o) => /bf1/.test(`${o.key} ${o.zone ?? ""}`))?.key;
        expect(key).toBeDefined();
        await game.p1.pick(key as string);
      } else {
        break;
      }
    }
    expect(game.zoneOf("moonfall")).toBe("trash");
    expect(game.locationOf("fan")).toBe("bf1");
    // Now — and only now — the Fan is a Defender and its trigger is pending for P2.
    expect(game.state("fan").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "fan" } });
    await game.p2.yes();
    expect(game.zoneOf("fan")).toBe("trash");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
