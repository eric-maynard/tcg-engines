/**
 * Ruling 8158b882f2e3d43b — Ride the Wind (OGN-173 → ogn-173-298) · Action · 2+[chaos] "Move a friendly unit and ready it."
 *   × Kai'Sa, Survivor (OGN-039 → ogn-039-298) · 4 Might "When I conquer, draw 1."
 *   × Rune Prison (OGN-050 → ogn-050-298) · Action · 2+[calm] "Stun a unit."
 *   × a 2-Might Poro (Stalwart Poro OGN-052 → ogn-052-298 would gain Shield as a defender; here the Poro ATTACKS, so a plain 2-Might Poro).
 *
 * Q: A Poro moves to open BF1 to conquer; Kai'Sa Rides the Wind into BF1; then Rune Prison stuns Kai'Sa. Who conquers, what happens
 *    to both?
 * A: The first (non-combat) showdown ends with no control, no damage, no points. A COMBAT showdown immediately follows with the Poro's
 *    player attacking (they applied contested). Poro (2) can't kill Kai'Sa (4); stunned Kai'Sa deals nothing back; the attacking Poro
 *    is recalled, Kai'Sa remains → her controller takes control: conquers BF1 and scores the point (and her conquer trigger draws 1).
 * Rules: 464.2.c (attacker = who applied contested), 466 (control only when one side remains), 423.1.b (stunned: no combat damage),
 *        461.1.a.2 (attackers recalled if defenders survive), 464.1 (conquer point).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const KAISA_SURVIVOR = "ogn-039-298";
const RUNE_PRISON = "ogn-050-298";
const PORO = { cardType: "unit", energyCost: 2, might: 2, name: "Poro", tags: ["Poro"] } as const;

/** P2's turn. bf1 open. P2: Poro (2) in base, Rune Prison + 2+[calm]. P1: Kai'Sa (4) in base, Ride the Wind + 2+[chaos]; deck top d1. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", PORO, "poro")
    .hand(P2, RUNE_PRISON, "prison")
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .unit(P1, "base", KAISA_SURVIVOR, "kaisa")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

function stack(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
}

/** Resolve whatever is on the chain by passing priority around. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d?.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]!.key);
    } else {
      break;
    }
  }
}

/** Poro → open bf1; P2 passes Focus; P1 rides Kai'Sa in (resolves); P2, with Focus back, Rune-Prisons Kai'Sa (resolves). */
async function poroKaisaPrison(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("poro", "bf1");
  expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false });
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: null });
  await game.p2.passFocus();
  await game.p1.cast("rtw", { targets: "kaisa" });
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("battlefield-bf1");
  }
  await resolveChain(game);
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("kaisa")).toBe("bf1");
  // P2 needs an action window in the showdown to play Rune Prison (an Action).
  for (let i = 0; i < 4 && !(game.decision()?.seat === P2 && game.p2.can("cast", "prison")); i++) {
    await game.acting().pass();
  }
  expect(game.p2.can("cast", "prison")).toBe(true);
  await game.p2.cast("prison", { targets: "kaisa" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  await resolveChain(game);
  expect(game.zoneOf("prison")).toBe("trash");
  expect(game.state("kaisa").isStunned).toBe(true);
  return game;
}

describe("Ruling 8158b882f2e3d43b — Poro walks in, Kai'Sa rides in, Rune Prison stuns her: Poro attacks, bounces off, Kai'Sa conquers", () => {
  test("while all this happens it is still ONE showdown at bf1: both units there, Kai'Sa stunned (confused), nobody controls bf1, no damage, no points", async () => {
    const game = await poroKaisaPrison();
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1" });
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.locationOf("kaisa")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: null });
    expect(game.state("poro").damage + game.state("kaisa").damage).toBe(0);
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  test("the first showdown establishes no control; a COMBAT showdown follows at bf1 with P2 (the Poro's player, who applied contested) as attacker and Kai'Sa defending — contested status carried over, still no points", async () => {
    const game = await poroKaisaPrison();
    for (let i = 0; i < 6 && !(stack(game)[0]?.isCombatShowdown ?? false); i++) {
      await game.acting().pass();
    }
    expect(stack(game)).toHaveLength(1);
    expect(stack(game)[0]).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("poro").combatRole).toBe("attacker");
    expect(game.state("kaisa").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: null });
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
  });

  test("combat: Poro (2) can't kill Kai'Sa (4), stunned Kai'Sa deals nothing; the Poro is recalled to base alive, Kai'Sa stays → P1 conquers bf1, scores 1, and 'When I conquer, draw 1' gives P1 d1", async () => {
    const game = await poroKaisaPrison();
    await game.settle();
    expect(stack(game)).toEqual([]);
    expect(game.zoneOf("poro")).toBe("base"); // recalled, undamaged by the stunned defender
    expect(game.state("poro").damage).toBe(0);
    expect(game.zoneOf("kaisa")).toBe("battlefield-bf1");
    expect(game.state("kaisa").damage).toBe(0); // healed in cleanup
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
