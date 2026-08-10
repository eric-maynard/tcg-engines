/**
 * Ruling ee2b0f2469dbc1d4 — Mutated Mouser (UNL-036 → unl-036-219) · Unit · Calm · 2 · 1 Might
 *     "[Shield 2] (+2 [Might] while I'm a defender.) [Tank] (I must be assigned combat damage first.)"
 *   × Charm (ogn-043-298) "Move an enemy unit."   × Evelynn, Entrancing (unl-141-219) "[Hidden] … When you play me from face
 *     down on your turn, you may move an enemy unit at a different location to my battlefield."
 *   × Blitzcrank, Impassive (ogn-067-298) "[Tank] When you play me to a battlefield, you may move an enemy unit to here. …"
 *
 * Q: If I pull an enemy unit onto the battlefield I control (with my Mouser) via Evelynn, Charm or Blitzcrank — is my
 *    Mouser the attacker or the defender?
 * A: The enemy unit applies Contested to your battlefield, so IT is the attacker and you defend: Mouser is a Defender, its
 *    Shield 2 is on (+2 Might for the combat) and Tank still makes it take combat damage first — whichever card did the moving.
 * Rules: 190.3.a/450 (the arriving controller applies Contested), 459.2.b.1 (who applied Contested attacks), 731 (Shield), 727 (Tank).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MOUSER = "unl-036-219";
const CHARM = "ogn-043-298";
const EVELYNN = "unl-141-219";
const BLITZCRANK = "ogn-067-298";

/**
 * P1's turn. P1 holds bf1 with Mutated Mouser (1) and Pal (2); P2 holds bf2 with Intruder (2) and a 1-Might Anchor.
 * P1 has Charm (1+[calm]) and Blitzcrank (5+[calm]) in hand with 6 + 2 calm, and Evelynn facedown at bf1 (hidden earlier).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { calm: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", MOUSER, "mouser")
    .unit(P1, "bf1", { might: 2, name: "Pal" }, "pal")
    .unit(P2, "bf2", { might: 2, name: "Intruder" }, "intruder")
    .unit(P2, "bf2", { might: 1, name: "Anchor" }, "anchor")
    .hand(P1, CHARM, "charm")
    .hand(P1, BLITZCRANK, "blitz")
    .facedown(P1, "bf1", EVELYNN, "eve");
}

const showdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1);

/** Answer P1's finalization prompts (opt-in yes, Intruder as the enemy, bf1 as destination) and pass priority until the chain is empty. */
async function driveToCombat(game: Game): Promise<void> {
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context !== "chain")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1) {
      const want = d.options.find((o) => o.card === "intruder" || o.key === "intruder") ?? d.options.find((o) => /bf1/.test(o.key)) ?? d.options[0];
      await game.p1.pick(want!.key);
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
}

/** The shared expectation once Intruder has been pulled into bf1 and the combat showdown has begun. */
function expectMouserDefends(game: Game): void {
  expect(game.locationOf("intruder")).toBe("bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
  expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
  expect(game.state("intruder").combatRole).toBe("attacker");
  expect(game.state("mouser")).toMatchObject({ combatRole: "defender", might: 3 }); // 1 + Shield 2
  expect(game.state("mouser").keywords).toEqual(expect.arrayContaining(["Shield", "Tank"]));
  expect(game.state("pal").combatRole).toBe("defender");
  // The attacker (P2 — it applied Contested) holds Focus first.
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
}

/** Combat resolves: Intruder's 2 must go to the Tank Mouser first (survives at 3), Pal takes nothing, Intruder dies, bf1 stays P1's. */
async function expectCombatOutcome(game: Game): Promise<void> {
  await game.settle();
  const combatHits = (game.gameState.damageLog ?? []).filter((r) => r.combat);
  expect(combatHits.filter((r) => r.target === "mouser")).toEqual([expect.objectContaining({ amount: 2 })]);
  expect(combatHits.some((r) => r.target === "pal")).toBe(false);
  expect(game.zoneOf("intruder")).toBe("trash");
  expect(game.zoneOf("mouser")).toBe("battlefield-bf1");
  expect(game.state("mouser")).toMatchObject({ combatRole: null, damage: 0, might: 1 }); // Shield off again after combat
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
  expect(game.p2.points()).toBe(0);
  expect(game.violations()).toEqual([]);
}

describe("Ruling ee2b0f2469dbc1d4 — an enemy pulled onto Mouser's battlefield attacks; Mouser defends with Shield 2 + Tank", () => {
  test("via Charm: P1 moves Intruder to bf1 (destination named at finalization); when the chain empties combat begins with Intruder ATTACKING and Mouser DEFENDING at 3 Might", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "intruder" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" }); // "Choose a destination"
    await driveToCombat(game);
    expect(game.zoneOf("charm")).toBe("trash");
    expectMouserDefends(game);
    await expectCombatOutcome(game);
  });

  test("via Blitzcrank, Impassive played to bf1: his 'you may move an enemy unit to here' pulls Intruder in — same designations: Intruder attacker, Mouser (and Blitzcrank, Pal) defenders, Mouser at 3", async () => {
    const game = await board().build();
    await game.p1.play("blitz", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    await driveToCombat(game);
    expect(game.locationOf("blitz")).toBe("bf1");
    expectMouserDefends(game);
    expect(game.state("blitz").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("intruder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // Two Tanks now share "first"; Pal (no Tank) is still never assigned anything.
    expect((game.gameState.damageLog ?? []).some((r) => r.combat && r.target === "pal")).toBe(false);
  });

  test("via Evelynn, Entrancing played from facedown at bf1 on P1's turn: her trigger moves Intruder (at a different location) to her battlefield — again Intruder attacks and Mouser defends at 3 with Tank", async () => {
    const game = await board().build();
    expect(game.p1.can("reveal", "eve")).toBe(true);
    await game.p1.reveal("eve");
    await driveToCombat(game);
    expect(game.locationOf("eve")).toBe("bf1");
    expectMouserDefends(game);
    expect(game.state("eve").combatRole).toBe("defender");
    await expectCombatOutcome(game);
  });
});
