/**
 * Ruling 1bc19b0f5aebfe8d — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Unit · Calm · 6
 *   "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Fight or Flight (OGN-168 → ogn-168-298) [Hidden][Action] "Move a unit from a battlefield to its base."
 *
 * Q: A unit with an attack trigger moves in (trigger goes on the chain); a Reaction then moves it back out. Does the
 *    attack trigger still happen?
 * A: Yes — once on the chain the trigger is an independent item and still resolves. But what it DOES depends on its
 *    text: Yasuo's "an enemy unit HERE" mistargets once he is back in base (no damage), whereas a location-free
 *    trigger ("When I attack, draw 1") resolves in full.
 * Rules: 359.3.f.2 (Yasuo + Fight or Flight example: "here" no longer the combat battlefield → mistargets),
 *        383.4.e (attack triggers), 811 (a Hidden card is played as a Reaction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
/** A unit whose attack trigger has no location reference. */
const HERALD = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 4,
  name: "Herald",
  rulesText: "When I attack, draw 1.",
} as const;

/** P1's turn. P2 holds bf1 with a 3-Might Guard and has Fight or Flight face-down there. P1's attacker waits in base. */
function board(attacker: "yasuo" | "herald") {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", attacker === "yasuo" ? YASUO : HERALD, attacker)
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .deck(P1, ["ogn-175-298"], ["p1top"]);
}

/** Attacker moves in (its attack trigger lands on the chain); P1 passes; P2 flips Fight or Flight on the attacker and it resolves. */
async function attackThenFlung(game: Game, attacker: string): Promise<void> {
  await game.p1.move(attacker, "bf1");
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("guard"); // Yasuo's target, if asked at finalization
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: attacker, triggered: true })]);
  expect(game.state(attacker).combatRole).toBe("attacker");
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "fof")).toBe(true);
  await game.p2.reveal("fof", { answers: [attacker] });
  expect(game.chain().map((c) => c.cardId)).toEqual([attacker, "fof"]);
  // Resolve Fight or Flight only (LIFO).
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("fof")).toBe("trash");
  expect(game.locationOf(attacker)).toBe("base");
}

describe("Ruling 1bc19b0f5aebfe8d — an attack trigger survives its unit being moved away, but 'here' effects mistarget", () => {
  test("Yasuo: after Fight or Flight sends him home his attack trigger is STILL on the chain (an independent item)", async () => {
    const game = await board("yasuo").build();
    await attackThenFlung(game, "yasuo");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", triggered: true })]);
    expect(game.state("yasuo").might).toBe(6); // in base (a board zone) he still has a Might
  });

  test("Yasuo: the trigger resolves but 'an enemy unit HERE' finds nothing — the Guard takes NO damage and survives; nothing else happens", async () => {
    const game = await board("yasuo").build();
    await attackThenFlung(game, "yasuo");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(0);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("control — Yasuo NOT moved away: the trigger deals 6 to the Guard (it dies)", async () => {
    const game = await board("yasuo").build();
    await game.p1.move("yasuo", "bf1");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("guard");
    }
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.zoneOf("guard")).toBe("trash");
  });

  test("Herald ('When I attack, draw 1' — no location reference): moved home by Fight or Flight, its trigger still resolves in full and P1 draws 1", async () => {
    const game = await board("herald").build();
    const handBefore = game.p1.hand().length;
    await attackThenFlung(game, "herald");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herald", triggered: true })]);
    await game.settle();
    expect(game.p1.hand()).toContain("p1top");
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.zoneOf("herald")).toBe("base");
    expect(game.state("guard").damage).toBe(0);
  });
});
