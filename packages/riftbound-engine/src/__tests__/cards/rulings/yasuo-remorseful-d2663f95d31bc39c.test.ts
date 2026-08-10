/**
 * Ruling d2663f95d31bc39c — Yasuo, Remorseful (ogn-076-298) × Fight or Flight (ogn-168-298)
 *   Yasuo — Champion Unit · Calm · [6] · 6 Might: "When I attack, deal damage equal to my Might to an enemy unit here."
 *   Fight or Flight — [Hidden][Action] · [2]: "Move a unit from a battlefield to its base."
 *
 * Q: Yasuo moves into a battlefield; a hidden card (Fight or Flight) reacts and moves him back to base. Does his "When I
 *    attack" trigger trigger?
 * A: Yes, it TRIGGERS (the move made him an attacker and put the ability on the chain) — but it fails to resolve: the
 *    hidden Fight or Flight is a Reaction on top, resolves first, Yasuo goes home, and on resolution "here" no longer
 *    holds for him, so the target is illegal and no damage is dealt.
 * Rules: 376–378 (attack trigger), 811 (hidden → Reaction), 340 (LIFO), 359.3.e.9/12 (conditions rechecked on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/** P1's turn 3. P2 holds bf1 with a 7-Might Brute and a facedown Fight or Flight (hidden earlier), 0 resources. Yasuo in P1's base. */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Brute" }, "brute")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .unit(P1, "base", YASUO, "yasuo");
}

/** Yasuo attacks bf1; answer his trigger's target (Brute) if asked; stop at P1's priority with the trigger on the chain. */
async function yasuoAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  for (let i = 0; i < 6; i++) {
    const d: Decision | null = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick("brute");
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling d2663f95d31bc39c — Yasuo's attack trigger DOES trigger, then whiffs once hidden Fight or Flight sends him home", () => {
  test("1–2. the move makes Yasuo the attacker and his 'When I attack' trigger IS placed on the chain (aimed at the Brute), state Closed", async () => {
    const game = await yasuoAttacks();
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.locationOf("yasuo")).toBe("bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, targets: ["brute"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("brute").damage).toBe(0); // nothing dealt yet
  });

  test("3. P2 reacts from hidden: Fight or Flight (for [0]) on Yasuo lands ABOVE the trigger and resolves first — Yasuo is back in P1's base with his trigger still pending", async () => {
    const game = await yasuoAttacks();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof");
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
      await game.p2.pick("yasuo");
    }
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "fof"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", triggered: true })]);
  });

  test("4. the trigger then resolves with Yasuo not 'here': illegal target, NO damage to the Brute (nor anyone), no re-target prompt; bf1 stays P2's", async () => {
    const game = await yasuoAttacks();
    await game.p1.passPriority();
    await game.p2.reveal("fof");
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("yasuo");
    }
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      expect(d?.kind).toBe("action"); // never asked to pick a new victim
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("brute")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.state("yasuo").damage).toBe(0);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: with no reaction the trigger resolves normally — the Brute takes 6 (Yasuo's Might)", async () => {
    const game = await yasuoAttacks();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("brute").damage).toBe(6);
    expect(game.locationOf("yasuo")).toBe("bf1");
  });
});
