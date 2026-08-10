/**
 * Ruling 909174943da2255a — Ride the Wind (OGN-173 → ogn-173-298) · [Action] · 2 + [chaos] · "Move a friendly unit and ready it."
 *   × Fortified Position (OGN-279 → ogn-279-298) "When you defend here, choose a unit. It gains [Shield 2] this combat."
 *   × Reaver's Row (OGN-285) — same "when YOU defend here" class;  × The Dreaming Tree (OGN-292) — errata'd, exempt.
 *   Defender with a unit trigger: Kha'Zix, Mutating Horror (unl-143-219, 4) "When I attack or defend, if an enemy unit is
 *   alone here, give me +2 [Might] this turn and gain 2 XP."
 *
 * Q: Opponent moves onto an EMPTY battlefield to conquer it; I Ride the Wind a unit there. Who attacks/defends, and do
 *    "when I defend" abilities fire?
 * A: The opponent applied Contested first → they are the attacker; when the open showdown turns into a combat you are
 *    the defender and your UNITS' "When I defend" triggers fire. Battlefield "When YOU defend here" abilities do NOT —
 *    "you" is the battlefield's controller and nobody controls it yet.
 * Rules: 345/464 (attacker = who applied contested; combat once both sides present), 465 (designations), 188 (uncontrolled).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const FORTIFIED_POSITION = "ogn-279-298";
const KHAZIX = "unl-143-219";

type ShowdownView = { battlefieldId: string; active: boolean; isCombatShowdown?: boolean; attackingPlayer?: string; defendingPlayer?: string };
const showdown = (game: Game): ShowdownView | undefined =>
  (game.gameState.interaction as { showdownStack?: ShowdownView[] } | undefined)?.showdownStack?.at(-1);

/**
 * Turn 3, P2 active. "fort" = a LIVE, UNCONTROLLED Fortified Position (empty). P2's Scout (3) in base.
 * P1: Kha'Zix (4) in base, Ride the Wind in hand with 2 + [chaos]; bf2 is P1's (an alternative destination).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("fort", { controller: null, def: FORTIFIED_POSITION, inert: false })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "base", { might: 3, name: "Scout" }, "scout")
    .unit(P1, "base", KHAZIX, "khazix")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** P2 walks onto the empty fort (open showdown, no designations yet), passes Focus; P1 Rides Kha'Zix there; the spell resolves. */
async function rideIntoTheShowdown(): Promise<{ game: Game; prompts: Decision[] }> {
  const game = await board().build();
  await game.p2.move("scout", "fort");
  expect(game.gameState.battlefields.fort).toMatchObject({ contested: true, contestedBy: P2, controller: null });
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "fort", isCombatShowdown: false });
  expect(game.state("scout").combatRole ?? null).toBeNull(); // no designations in an open (non-combat) showdown
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "khazix" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  await game.p1.pick("battlefield-fort");
  const prompts: Decision[] = [];
  // Resolve Ride the Wind (both pass).
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.zoneOf("khazix")).toBe("battlefield-fort");
  const d = game.decision();
  if (d && d.kind !== "action") {
    prompts.push(d);
  }
  return { game, prompts };
}

describe("Ruling 909174943da2255a — Ride the Wind into a battlefield the opponent is contesting: they attack, you defend", () => {
  test("once Kha'Zix arrives the open showdown becomes a COMBAT: P2 (who applied Contested) is the attacker, P1 the defender; the fort is still uncontrolled", async () => {
    const { game } = await rideIntoTheShowdown();
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "fort", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("khazix").combatRole).toBe("defender");
    expect(game.gameState.battlefields.fort?.controller ?? null).toBeNull();
  });

  test("ruling 909174943da2255a — the defending UNIT's 'When I … defend' fires: Kha'Zix's trigger goes on the chain for P1 and resolves (+2 Might → 6, P1 gains 2 XP)", async () => {
    const { game } = await rideIntoTheShowdown();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "khazix", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("khazix").might).toBe(6);
    expect(game.p1.xp()).toBe(2);
  });

  test("ruling 909174943da2255a — the BATTLEFIELD's 'When YOU defend here' (Fortified Position) does NOT fire: no 'choose a unit' prompt, nobody gains Shield, no fort item ever on the chain", async () => {
    const { game, prompts } = await rideIntoTheShowdown();
    expect(game.chain().some((c) => c.cardId === "fort")).toBe(false);
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      expect(game.chain().some((c) => c.cardId === "fort")).toBe(false);
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        prompts.push(d);
        break;
      }
    }
    expect(prompts).toEqual([]); // Fortified Position would have asked P1 to "choose a unit"
    expect(game.state("khazix").grantedKeywords.some((k) => k.keyword === "Shield")).toBe(false);
  });

  test("the combat then resolves: Kha'Zix (6) beats Scout (3); P1 — the defender — conquers the fort and scores on the opponent's turn", async () => {
    const { game } = await rideIntoTheShowdown();
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("khazix")).toBe("battlefield-fort");
    expect(game.gameState.battlefields.fort).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
