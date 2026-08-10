/**
 * Ruling 3c84219af110747c — Akshan, Mischievous (SFD-109 → sfd-109-221) 4 Might "[Weaponmaster] You may pay [body][body] as
 *   an additional cost to play me. When you play me, if you paid the additional cost, move an enemy gear to your base. You
 *   control it until I leave the board. If it's an Equipment, attach it to me."
 *   × Guardian Angel (SFD-051 → sfd-051-221, Equipment) worn by an enemy unit
 *   × Star-Crossed (UNL-128 → unl-128-219) [Reaction] 3+[chaos] "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: I play Akshan targeting the opponent's equipped Guardian Angel; they respond with Star-Crossed (bouncing Akshan).
 *    Does the Guardian Angel come back unequipped?
 * A: Yes. Star-Crossed resolves first and Akshan returns to hand; his trigger still resolves: the GA is moved to MY base
 *    (detaching it), but the "you control it until I leave" can't stick (Akshan already left) and "attach it to me" is
 *    impossible and ignored. Result: GA unattached in a base, still controlled (and owned) by the opponent.
 * Rules: 376 (ability on the chain independent of its source), 359.3.e.6 / e.11 (do as much as possible; impossible
 *        parts ignored), 455 ("until" duration already satisfied), 435.1 (detach), 323.7 (foreign permanents in a base
 *        are recalled to their controller's base at the next Cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const GUARDIAN_ANGEL = "sfd-051-221";
const STAR_CROSSED = "unl-128-219";

/**
 * P1's turn. P2: Unit U (3) at P2's bfB wearing Guardian Angel (→ 4), a 1-Might Pawn in base (Star-Crossed's friendly
 * half), a loose Trinket (so Akshan's gear pick is a real choice), Star-Crossed in hand + 3+[chaos]. P1: Akshan + 4+[body][body].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 2 } })
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", { might: 3, name: "Unit U" }, "U", { equippedWith: ["ga"] } as Record<string, unknown>)
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "U" } as Record<string, unknown>, owner: P2, zone: "bfB" })
    .unit(P2, "base", { might: 1, name: "Pawn" }, "pawn")
    .gear(P2, { cardType: "gear", name: "Trinket" }, "trinket")
    .hand(P1, AKSHAN, "akshan")
    .hand(P2, STAR_CROSSED, "starx");
}

/** Akshan played (paid), trigger aimed at the GA; P2 responds with Star-Crossed (Pawn + Akshan) which resolves. Trigger still pending. */
async function bouncedInResponse(): Promise<Game> {
  const game = await board().build();
  expect(game.state("U")).toMatchObject({ attachments: ["ga"], might: 4 });
  await game.p1.play("akshan", { payOptional: true, to: "base" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  // The trigger's gear is chosen as it is finalized — by P1.
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["ga", "trinket"]);
  await game.p1.pick("ga");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "akshan", targets: ["ga"], triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.cast("starx", { targets: ["pawn", "akshan"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["akshan", "starx"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Star-Crossed resolves first (LIFO)
  return game;
}

/** …then both pass again and Akshan's orphaned trigger resolves; chain empty, back to P1's main phase. */
async function triggerResolved(): Promise<Game> {
  const game = await bouncedInResponse();
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 3c84219af110747c — Star-Crossed bounces Akshan; his trigger still strips the Guardian Angel but can't keep or wear it", () => {
  test("Star-Crossed resolves first: Akshan → P1's hand, Pawn → P2's hand; Akshan's trigger is STILL on the chain (not removed with its source); GA as yet untouched on U", async () => {
    const game = await bouncedInResponse();
    expect(game.zoneOf("starx")).toBe("trash");
    expect(game.zoneOf("akshan")).toBe("hand");
    expect(game.p1.hand()).toContain("akshan");
    expect(game.zoneOf("pawn")).toBe("hand");
    expect(game.p2.hand()).toContain("pawn");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "akshan", targets: ["ga"], triggered: true })]);
    expect(game.state("ga")).toMatchObject({ attachedTo: "U", controller: P2, location: "bfB" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("Akshan's trigger then resolves doing what it can: the GA comes off U (U back to 3) into a base as a loose, UNATTACHED gear — 'attach it to me' is impossible with Akshan in hand and is ignored", async () => {
    const game = await triggerResolved();
    expect(game.state("U")).toMatchObject({ attachments: [], might: 3, zone: "battlefield-bfB" }); // detached: "returns unequipped"
    expect(game.zoneOf("ga")).toBe("base");
    expect(game.state("ga")).toMatchObject({ attachedTo: undefined, location: "base", owner: P2, zone: "base" });
    expect(game.state("akshan")).toMatchObject({ attachments: [], zone: "hand" });
    expect(game.p1.hand()).not.toContain("ga");
    expect(game.p2.hand()).not.toContain("ga");
    expect(game.violations()).toEqual([]);
  });

  test("…and the 'you control it until I leave the board' never takes hold (Akshan already left): P2 still controls the GA, P1 controls no gear", async () => {
    const game = await triggerResolved();
    expect(game.state("ga")).toMatchObject({ controller: P2, owner: P2 });
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear().sort()).toEqual(["ga", "trinket"]);
  });
});
