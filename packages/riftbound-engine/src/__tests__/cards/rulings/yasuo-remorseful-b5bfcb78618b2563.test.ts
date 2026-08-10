/**
 * Ruling b5bfcb78618b2563 — Yasuo, Remorseful (OGN-076 → ogn-076-298) × Fight or Flight (OGN-168 → ogn-168-298)
 *   Yasuo (6 Might): "When I attack, deal damage equal to my Might to an enemy unit here."
 *   Fight or Flight ([Hidden] [Action]): "Move a unit from a battlefield to its base."
 *
 * Q: Yasuo's on-attack trigger is answered with Fight or Flight moving the targeted enemy unit away — does Yasuo's
 *    ability still resolve?
 * A: No — it mistargets. "Here" is Yasuo's location; the unit is still on the board but no longer at that location, so on
 *    resolution the target is illegal and no damage is dealt.
 * Rules: 355.12 / 359.3.f (targets re-checked on resolution incl. location), 383.4.e (attack trigger), 811 (Hidden → Reaction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/** P1's turn. P2 holds bf1 with a 7-Might Brute (survives a 6-damage hit, so damage would be visible) and has
 *  Fight or Flight hidden there. Yasuo (6) ready in P1's base. */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Brute" }, "brute")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .unit(P1, "base", YASUO, "yasuo");
}

/** Yasuo attacks bf1: his trigger (→ Brute, the only enemy here) is on the chain; P1 passes to P2. */
async function yasuoAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("brute");
  }
  expect(game.state("yasuo").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, targets: ["brute"], triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling b5bfcb78618b2563 — Fight or Flight in response makes Yasuo, Remorseful's 'enemy unit here' mistarget", () => {
  test("P2 reveals the hidden Fight or Flight in response, choosing the Brute; it sits above Yasuo's trigger and resolves first — Brute goes to P2's base", async () => {
    const game = await yasuoAttacks();
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("brute");
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "fof"]);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("brute")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]); // Yasuo's trigger still to resolve
    expect(game.state("brute").damage).toBe(0);
  });

  test("Yasuo's trigger then resolves against a unit no longer 'here': it mistargets — the Brute (in base, still on the board) takes NO damage", async () => {
    const game = await yasuoAttacks();
    await game.p2.reveal("fof");
    await game.p2.pick("brute");
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("brute")).toBe("base");
    expect(game.zoneOf("brute")).toBe("base");
    expect(game.state("brute").damage).toBe(0);
    expect(game.locationOf("yasuo")).toBe("bf1");
    // with the defender gone Yasuo simply takes the battlefield
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("brute").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control — no response: the trigger deals Yasuo's Might (6) to the Brute here", async () => {
    const game = await yasuoAttacks();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("brute")).toBe("bf1");
    expect(game.state("brute").damage).toBe(6);
  });
});
