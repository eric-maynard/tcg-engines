/**
 * Ruling 2039b0c9d8a46fbe — Akshan, Mischievous (SFD-109 → sfd-109-221) × Factory Recall (SFD-135 → sfd-135-221)
 *   Akshan: "[Weaponmaster] You may pay [body][body] as an additional cost to play me. When you play me, if you paid
 *   the additional cost, move an enemy gear to your base. You control it until I leave the board."
 *   Factory Recall: "[Action] Return a gear to its owner's hand."
 *
 * Q: When Akshan steals a gear and Factory Recall is played on it, does it return to the ORIGINAL owner's hand?
 * A: Yes. "Owner" is whoever literally owns the card; Akshan's player is only its controller.
 * Rules: 127.1 (owner), 108.2 (controller), 056.2 (owner's hand).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const FACTORY_RECALL = "sfd-135-221";
const GARBAGE_GRABBER = "ogn-099-298"; // P2's plain gear — the thing Akshan steals

/** P1's turn. P2 owns a Garbage Grabber in base. P1: Akshan + Factory Recall in hand, 4+1 energy and [body][body]. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .resources(P1, { energy: 5, power: { body: 2 } })
    .gear(P2, GARBAGE_GRABBER, "grabber")
    .hand(P1, AKSHAN, "akshan")
    .hand(P1, FACTORY_RECALL, "recall");
}

/** Play Akshan paying the optional [body][body]; his trigger moves P2's Grabber to P1's base. */
async function stealGrabber(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("akshan", { payOptional: true, to: "base" });
  const r = await game.settle();
  if (r.reason === "unanswered" && game.decision()?.seat === P1) {
    await game.p1.pick("grabber");
    await game.settle();
  }
  return game;
}

describe("Ruling 2039b0c9d8a46fbe — Factory Recall on an Akshan-stolen gear returns it to its OWNER (P2), not its controller (P1)", () => {
  test("after the steal: the Grabber sits in P1's base under P1's CONTROL, but its OWNER is still P2", async () => {
    const game = await stealGrabber();
    expect(game.zoneOf("akshan")).toBe("base");
    expect(game.p1.power("body")).toBe(0); // the additional cost was paid
    expect(game.state("grabber")).toMatchObject({ controller: P1, owner: P2, zone: "base" });
    expect(game.p1.gear()).toContain("grabber");
    expect(game.p2.gear()).not.toContain("grabber");
  });

  test("Factory Recall (cast by P1 on the stolen Grabber) puts it into P2's hand — never P1's", async () => {
    const game = await stealGrabber();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("recall", { targets: "grabber" });
    await game.settle();
    expect(game.zoneOf("recall")).toBe("trash");
    expect(game.zoneOf("grabber")).toBe("hand");
    expect(game.state("grabber").owner).toBe(P2);
    expect(game.p2.hand()).toContain("grabber");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.hand()).not.toContain("grabber");
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // only Factory Recall left it
    expect(game.p1.gear()).toEqual([]);
    expect(game.zoneOf("akshan")).toBe("base"); // Akshan is unaffected
    expect(game.violations()).toEqual([]);
  });

  test("control: Factory Recall on a gear P1 both owns and controls goes to P1's hand (owner = controller)", async () => {
    const game = await board().gear(P1, GARBAGE_GRABBER, "ownGrabber").build();
    await game.p1.cast("recall", { targets: "ownGrabber" });
    await game.settle();
    expect(game.p1.hand()).toContain("ownGrabber");
    expect(game.p2.hand()).not.toContain("ownGrabber");
  });
});
