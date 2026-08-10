/**
 * Ruling f0a63cb5bac3335f — Vex, Apathetic (UNL-150 → unl-150-219) · 4 Might · "[Deflect] When an opponent plays a unit while I'm at a
 *     battlefield, [Stun] it. They can't move it this turn."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction — the kind of card the asker wants to respond with; exercised here with Discipline
 *     (ogn-058-298, Reaction: "Give a unit +2 [Might] this turn. Draw 1.") and, for contrast, the Action-speed Charm (ogn-043-298).
 *
 * Q: My opponent has Vex at a battlefield; I play a unit. Can I react to the stun?
 * A: Yes — once Vex's trigger is on the chain. The unit (a permanent) hits the board with no response window and Vex's trigger goes
 *    straight onto the chain; THEN players get priority and may play Reactions before it resolves. The stun itself doesn't target
 *    (automatic "it"), so it can't be dodged by untargetability — but it can be responded to.
 * Rules: 340 (permanents resolve immediately), 383 (trigger → chain), 813 (Reaction timing in a Closed State), 355.10.d (not a target).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const DISCIPLINE = "ogn-058-298";
const CHARM = "ogn-043-298";

/** P2's turn. P1's Vex holds bf1. P2: a Grunt (3) to play ([2]), Discipline ([2][calm]) and Charm ([1][calm]) in hand, resources for all. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 5, power: { calm: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", VEX, "vex")
    .hand(P2, { cardType: "unit", energyCost: 2, might: 3, name: "Grunt" }, "grunt")
    .hand(P2, DISCIPLINE, "disc")
    .hand(P2, CHARM, "charm")
    .deck(P2, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

async function playGrunt(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("grunt");
  return game;
}

/** Hand priority to P2 on the pending Vex trigger (P1, its controller, may hold it first). */
async function p2Window(game: Game): Promise<void> {
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling f0a63cb5bac3335f — you can Reaction-respond to Vex's stun trigger once it is on the chain", () => {
  test("no window before the trigger: the Grunt is already ON THE BOARD (not on the chain) and Vex's trigger is already the pending chain item — the very next decision is chain priority", async () => {
    const game = await playGrunt();
    expect(game.zoneOf("grunt")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vex", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.state("grunt").isStunned).toBe(false); // not resolved yet
  });

  test("with the trigger pending P2 gets priority and CAN play a Reaction (Discipline) — but NOT an Action-speed spell (Charm)", async () => {
    const game = await playGrunt();
    await p2Window(game);
    expect(game.p2.can("cast", "disc")).toBe(true);
    expect(game.p2.can("cast", "charm")).toBe(false);
    await game.p2.cast("disc", { targets: "grunt" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vex", "disc"]);
  });

  test("LIFO: Discipline resolves first (+2, draw 1), then Vex's trigger still stuns the Grunt and pins it (the stun never targeted, so nothing about the response dodged it)", async () => {
    const game = await playGrunt();
    await p2Window(game);
    await game.p2.cast("disc", { targets: "grunt" });
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "disc"); i++) {
      await game.acting().passPriority();
    }
    expect(game.state("grunt")).toMatchObject({ isStunned: false, might: 5 });
    expect(game.p2.hand()).toEqual(["charm", "d1"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["vex"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("grunt")).toMatchObject({ isStunned: true, might: 5, zone: "base" });
    expect(game.state("grunt").grantedKeywords.map((k) => k.keyword)).toContain("NoMove");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
