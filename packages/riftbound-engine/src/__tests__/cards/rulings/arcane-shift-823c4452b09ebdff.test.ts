/**
 * Ruling 823c4452b09ebdff — Arcane Shift (SFD-200 → sfd-200-221) · Action · [3][rainbow] "Banish a friendly unit, then its owner plays it,
 *   ignoring its cost. Deal 3 to an enemy unit at a battlefield. Banish this."
 *   × Ahri, Inquisitive (OGN-119 → ogn-119-298, "Blue Ahri") · 3 Might "When I attack or defend, give an enemy unit here -2 [Might] this
 *     turn, to a minimum of 1 [Might]."
 *
 * Q: While defending, can I Arcane Shift Ahri and replay her onto the same battlefield to trigger "When I defend" a second time in
 *    the same combat?
 * A: Yes. Banished and replayed, she is a NEW game object that never triggered before, so gaining the defender designation
 *    triggers her again in the same combat.
 * Rules: 106 / 359.2 (zone change → new object), 464.5 (attack/defend triggers fire on first gaining the role — per object), 340.2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARCANE_SHIFT = "sfd-200-221";
const AHRI = "ogn-119-298";

const chainIds = (game: Game) => game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`);
const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P2's turn. P1 controls bf1 with Ahri (3) and holds Arcane Shift + [3][rainbow]. P2's Raider (7) attacks from base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", AHRI, "ahri")
    .unit(P2, "base", { might: 7, name: "Raider" }, "raider")
    .hand(P1, ARCANE_SHIFT, "shift");
}

/** Raider attacks bf1: Ahri's FIRST defend trigger fires and resolves (Raider 7 → 5); Focus ends up with P1. */
async function firstDefendTrigger(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("raider");
  }
  expect(game.state("ahri").combatRole).toBe("defender");
  expect(chainIds(game)).toEqual(["ahri*"]);
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.state("raider").might).toBe(5);
  // Attacker has Focus first; P2 passes it to P1.
  if (game.decision()?.seat === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** P1 Arcane Shifts Ahri (3 to the Raider), replaying her to bf1. Stops once Arcane Shift has fully resolved. */
async function shiftAhriBackToBf1(game: Game): Promise<void> {
  expect(game.p1.can("cast", "shift")).toBe(true);
  await game.p1.cast("shift", { targets: ["ahri", "raider"] });
  await game.p1.passPriority();
  await game.p2.passPriority();
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "battlefield-bf1")) {
      expect(d).toMatchObject({ semantics: "destination" });
      await game.p1.pick("battlefield-bf1");
    } else if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options[0]!.key);
    } else {
      break;
    }
  }
  expect(game.zoneOf("shift")).toBe("banishment");
}

describe("Ruling 823c4452b09ebdff — Arcane Shift re-plays a defending Ahri as a new object: 'When I defend' triggers again this combat", () => {
  test("first trigger: Ahri defends when the Raider attacks; her -2 resolves once (7 → 5)", async () => {
    const game = await firstDefendTrigger();
    expect(game.state("raider").mightModifier).toBe(-2);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  });

  test("Arcane Shift (P1 has Focus, controls bf1): Ahri is banished and replayed to bf1 — a fresh, undamaged object that is a defender again; the Raider takes 3; Arcane Shift is banished", async () => {
    const game = await firstDefendTrigger();
    await shiftAhriBackToBf1(game);
    expect(game.zoneOf("ahri")).toBe("battlefield-bf1");
    expect(game.state("ahri")).toMatchObject({ combatRole: "defender", damage: 0 });
    expect(game.state("raider").damage).toBe(3);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  });

  // Expected: the replayed Ahri is a new object that has never triggered, so on becoming a defender at bf1 her "When I defend"
  // goes on the chain a SECOND time this combat (P1 choosing the Raider). Actual: no trigger — the chain is empty after the
  // replay and Focus simply passes to P2; the Raider keeps 5 Might.
  test("ruling 823c4452b09ebdff — re-triggers 'When I defend' for the replayed (new-object) Ahri", async () => {
    const game = await firstDefendTrigger();
    await shiftAhriBackToBf1(game);
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("raider");
    }
    expect(chainIds(game)).toEqual(["ahri*"]);
    expect(game.chain()[0]).toMatchObject({ controller: P1, targets: ["raider"], triggered: true });
  });

  // The second -2 resolves → Raider 7 − 2 − 2 = 3 Might carrying 3 damage ⇒ dies; Ahri keeps bf1 for P1.
  test("ruling 823c4452b09ebdff — with the second trigger the Raider (3 Might, 3 damage) dies and P1 keeps bf1", async () => {
    const game = await firstDefendTrigger();
    await shiftAhriBackToBf1(game);
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("raider");
    }
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    // 7 − 2 − 2 = 3 Might carrying 3 damage is lethal on the spot. The −4 itself is no longer readable once the
    // Raider is in the trash: rule 106 / 359.2 — leaving the board makes it a new object, so its modifiers reset.
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("raider").mightModifier).toBe(0);
    await game.settle();
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.zoneOf("ahri")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});
