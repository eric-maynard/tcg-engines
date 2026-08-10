/**
 * Ruling 00ab353cedbc1f73 — Akshan, Mischievous (SFD-109 → sfd-109-221) × Factory Recall (SFD-135 → sfd-135-221)
 *   Akshan: "[Weaponmaster] You may pay [body][body] as an additional cost to play me. When you play me, if
 *   you paid the additional cost, move an enemy gear to your base. You control it until I leave the board."
 *   Factory Recall: "[Action] Return a gear to its owner's hand."
 *
 * Q: If Akshan steals a gear and it gets Factory Recalled, does it return to the Akshan player's hand?
 * A: No. It returns to its ORIGINAL OWNER's hand — "owner" is the player who brought the card into the
 *    game; Akshan's player is merely its controller.
 * Rules: 127.1 (owner), 108.2 / 477.1.a (controller), 056.2 (owner's hand).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const FACTORY_RECALL = "sfd-135-221";
const GARBAGE_GRABBER = "ogn-099-298"; // a plain (non-Equipment) enemy gear to steal

function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 2 } }) // 4 + [body][body] for Akshan, +1 for Factory Recall
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: null })
    .gear(P2, GARBAGE_GRABBER, "grabber")
    .hand(P1, AKSHAN, "akshan")
    .hand(P1, FACTORY_RECALL, "recallP1")
    .hand(P2, FACTORY_RECALL, "recallP2");
}

/** P1 plays Akshan paying [body][body]; the trigger takes P2's only gear. */
async function steal(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("akshan", { payOptional: true, to: "base" });
  const r = await game.settle();
  if (r.reason === "unanswered" && game.decision()?.seat === P1) {
    await game.p1.pick("grabber");
    await game.settle();
  }
  return game;
}

describe("Ruling 00ab353cedbc1f73 — a Factory Recalled stolen gear returns to its OWNER's hand, not Akshan's player's", () => {
  test("setup fact: after the paid trigger the Grabber is CONTROLLED by P1 but still OWNED by P2", async () => {
    const game = await steal();
    expect(game.zoneOf("akshan")).toBe("base");
    expect(game.p1.power("body")).toBe(0);
    expect(game.state("grabber")).toMatchObject({ controller: P1, owner: P2, zone: "base" });
    expect(game.p1.gear()).toEqual(["grabber"]);
  });

  test("P1 (the thief) Factory Recalls the stolen gear on P1's own turn → it goes to P2's hand, never P1's (127.1)", async () => {
    const game = await steal();
    expect(game.p1.energy()).toBe(1);
    await game.p1.cast("recallP1", { targets: "grabber" });
    await game.settle();
    expect(game.zoneOf("grabber")).toBe("hand");
    expect(game.p2.hand()).toContain("grabber");
    expect(game.p1.hand()).not.toContain("grabber");
    expect(game.state("grabber")).toMatchObject({ owner: P2, zone: "hand" });
    expect(game.p1.gear()).toEqual([]);
    expect(game.zoneOf("recallP1")).toBe("trash");
    expect(game.zoneOf("akshan")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("P2 (the owner) Factory Recalls it on P2's turn while Akshan is still out → likewise to P2's hand", async () => {
    const game = await steal();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("grabber").controller).toBe(P1); // still stolen
    await game.p2.tapRune(); // pools emptied at the turn change — 1 energy for Factory Recall
    await game.p2.cast("recallP2", { targets: "grabber" });
    await game.settle();
    expect(game.zoneOf("grabber")).toBe("hand");
    expect(game.p2.hand()).toContain("grabber");
    expect(game.p1.hand()).not.toContain("grabber");
    expect(game.zoneOf("akshan")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
