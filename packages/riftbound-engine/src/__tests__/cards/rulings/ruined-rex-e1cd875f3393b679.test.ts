/**
 * Ruling e1cd875f3393b679 — Ruined Rex (UNL-067 → unl-067-219) · Unit · Mind · 6+[mind] · 6 Might
 *     "[Deathknell] — Deal 4 to an enemy unit."
 *   × Shen, Kinkou (ogn-241-298) · 3 Might · "[Reaction] … [Shield 2] (+2 [Might] while I'm a defender.) [Tank]"
 *   × Hidden Blade (ogn-213-298) "[Hidden] … [Action] Kill a unit at a battlefield. Its controller draws 2." — P2's, facedown at bf1
 *
 * Q: Rex attacks into Shen and dies to Hidden Blade during the showdown — does his Deathknell (4) kill Shen, or is Shen
 *    still 5 Might when it resolves?
 * A: Shen is still the Defender while the Deathknell resolves during the showdown (designations last until combat
 *    cleanup), so Shield 2 is on: 3 + 2 = 5 Might, 4 damage is not lethal, Shen survives (and is healed at combat cleanup).
 * Rules: 808.1.d.2 (Deathknell queued as the unit dies), 731/814 (Shield while defender), 461.7.a (designations persist to
 *        combat cleanup), 461.1.a.1 (survivors healed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUINED_REX = "unl-067-219";
const SHEN_KINKOU = "ogn-241-298";
const HIDDEN_BLADE = "ogn-213-298";

/** P1's turn. Rex (6) ready in base. P2 holds bf1 with Shen, Kinkou and has Hidden Blade facedown there (hidden earlier). */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RUINED_REX, "rex")
    .unit(P2, "bf1", SHEN_KINKOU, "shen")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade");
}

/** Rex attacks; P1 passes Focus; P2 flips Hidden Blade on Rex; both pass → it resolves. Stops right after (Deathknell pending/finalized). */
async function bladeKillsRex(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("rex", "bf1");
  expect(game.state("rex").combatRole).toBe("attacker");
  expect(game.state("shen")).toMatchObject({ combatRole: "defender", might: 5 }); // Shield 2 on
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "blade")).toBe(true);
  await game.p2.reveal("blade", { answers: ["rex"] });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("rex");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P2 })]);
  // Resolve Hidden Blade only.
  for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "blade"); i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("rex")).toBe("trash");
  return game;
}

describe("Ruling e1cd875f3393b679 — Rex's Deathknell hits a Shen who is still a 5-Might Defender", () => {
  test("Hidden Blade (from facedown, in the showdown) kills Rex: Rex → P1's trash, P1 draws 2, and Rex's Deathknell is put on the chain aimed at Shen (the only enemy unit)", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.move("rex", "bf1");
    await game.p1.passFocus();
    await game.p2.reveal("blade", { answers: ["rex"] });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("rex");
    }
    for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "blade"); i++) {
      await game.seat(game.decision()!.seat).passPriority();
    }
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 2); // "Its controller draws 2"
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("shen"); // (only candidate — normally auto-bound)
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rex", controller: P1, triggered: true })]);
  });

  test("while the Deathknell is on the chain the showdown is still in progress: Shen keeps the Defender designation and is 5 Might (3 + Shield 2)", async () => {
    const game = await bladeKillsRex();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("shen");
    }
    expect(game.gameState.interaction?.showdownStack?.some((s) => s.active && s.battlefieldId === "bf1")).toBe(true);
    expect(game.state("shen")).toMatchObject({ combatRole: "defender", damage: 0, might: 5 });
  });

  test("the Deathknell resolves: 4 damage is marked on Shen, 4 < 5 so he does NOT die", async () => {
    const game = await bladeKillsRex();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("shen");
    }
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("shen");
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    const hits = (game.gameState.damageLog ?? []).filter((r) => !r.combat && r.target === "shen");
    expect(hits).toEqual([expect.objectContaining({ amount: 4, target: "shen" })]);
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.state("shen")).toMatchObject({ combatRole: "defender", damage: 4, might: 5 });
  });

  test("combat then ends with no attacker left: Shen survives, is healed at combat cleanup (0 damage, back to 3 Might out of combat) and bf1 stays P2's — P1 scores nothing", async () => {
    const game = await bladeKillsRex();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("shen");
    }
    await game.settle();
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.state("shen")).toMatchObject({ combatRole: null, damage: 0, might: 3 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
