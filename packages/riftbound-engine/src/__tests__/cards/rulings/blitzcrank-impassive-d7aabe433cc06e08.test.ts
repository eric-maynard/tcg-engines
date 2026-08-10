/**
 * Ruling d7aabe433cc06e08 — Blitzcrank, Impassive (OGN-067 → ogn-067-298) · 5 Might · [Tank]
 *     "When you play me to a battlefield, you may move an enemy unit to here. …"
 *   × Nine-Tailed Fox (OGN-255 → ogn-255-298) · Ahri legend "When an enemy unit attacks a battlefield you control, give it
 *     -1 [Might] this turn, to a minimum of 1 [Might]."
 *   × Challenge (OGN-128 → ogn-128-298) "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to
 *     each other." — the ruling has it played "as reaction speed", so it is modelled by an inline reaction-timed copy.
 *   (Ravenbloom Student OGN-103 is cited only for the "still counts as played" nuance about spells.)
 *
 * Q: Blitzcrank pulls an enemy 5-Might unit to a battlefield of the Ahri player; in response to Ahri's trigger, Challenge
 *    kills the pulled unit (and Blitzcrank). Does Ahri's ability fizzle?
 * A: It doesn't "fizzle" — it still RESOLVES, but with its target gone it affects nothing (the illegal portion is skipped).
 *    Sequence: Blitz played → pull trigger resolves → the pulled unit is now attacking → Nine-Tailed Fox triggers → Challenge
 *    in response kills both 5s → Ahri's trigger resolves to no effect.
 * Rules: 340.1 (LIFO), 359.3.e.1/5 (resolve with illegal targets; those are unaffected), 466 (an enemy unit arriving at
 *        your battlefield attacks it).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLITZCRANK = "ogn-067-298";
const NINE_TAILED_FOX = "ogn-255-298";
/** Challenge's exact effect (ogn-128-298) at Reaction speed, as the ruling stipulates. */
const CHALLENGE_REACTION = {
  abilities: [
    {
      effect: { attacker: { controller: "friendly", type: "unit" }, defender: { controller: "enemy", type: "unit" }, type: "fight" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 2,
  name: "Challenge (reaction speed)",
  timing: "reaction",
};

/** P1 (Nine-Tailed Fox) holds bf1 with a 2-Might Warden and plays Blitzcrank there ([5][calm]). P2's 5-Might Bruiser sits at P2's bf2; P2 holds Challenge + [2]. */
function board() {
  return scenario()
    .legend(P1, NINE_TAILED_FOX, "ahri")
    .resources(P1, { energy: 5, power: { calm: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Warden" }, "warden")
    .unit(P2, "bf2", { might: 5, name: "Bruiser" }, "bruiser")
    .hand(P1, BLITZCRANK, "blitz")
    .hand(P2, CHALLENGE_REACTION, "chal");
}

/** Blitz to bf1, accept the pull (Bruiser is the only enemy unit), resolve it → Bruiser attacks bf1 and Nine-Tailed Fox triggers. */
async function pulledAndAhriPending(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("blitz", { to: "bf1" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("bruiser");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", targets: ["bruiser"], triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // the pull resolves
  expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
  expect(game.state("bruiser").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, triggered: true })]);
  return game;
}

describe("Ruling d7aabe433cc06e08 — Ahri's trigger still resolves after Challenge kills the pulled unit; it just does nothing", () => {
  test("Blitzcrank's pull brings the Bruiser to bf1 as an ATTACKER, which triggers Nine-Tailed Fox (its -1 not yet applied: Bruiser still 5)", async () => {
    const game = await pulledAndAhriPending();
    expect(game.state("bruiser").might).toBe(5);
    expect(game.state("blitz")).toMatchObject({ combatRole: "defender", zone: "battlefield-bf1" });
  });

  test("control: unanswered, Ahri's trigger gives the attacking Bruiser -1 (5 → 4)", async () => {
    const game = await pulledAndAhriPending();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("bruiser").might).toBe(4);
  });

  test("P2 responds to Ahri's trigger with (reaction-speed) Challenge on Bruiser + Blitzcrank: it resolves first — 5 to each — and both die, Ahri's item still pending", async () => {
    const game = await pulledAndAhriPending();
    await game.p1.passPriority();
    expect(game.p2.can("cast", "chal")).toBe(true);
    await game.p2.cast("chal", { targets: ["bruiser", "blitz"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ahri", "chal"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Challenge resolves
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.zoneOf("blitz")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", triggered: true })]);
  });

  test("Ahri's trigger then resolves off the chain with nothing to shrink: no prompt, no error, nobody else gets -1; the showdown winds down and P1 keeps bf1 with the Warden", async () => {
    const game = await pulledAndAhriPending();
    await game.p1.passPriority();
    await game.p2.cast("chal", { targets: ["bruiser", "blitz"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Challenge
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ahri's trigger resolves (to no effect)
    expect(game.chain()).toEqual([]);
    expect(game.state("warden")).toMatchObject({ might: 2, mightModifier: 0 });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("warden")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
