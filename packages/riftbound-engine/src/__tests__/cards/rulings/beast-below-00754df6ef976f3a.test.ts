/**
 * Ruling 00754df6ef976f3a — Beast Below (SFD-132 → sfd-132-221) · Unit · Chaos · [7][chaos][chaos] · 8 Might
 *     "When you play me, return another friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Can I play Beast Below if I do not have another unit in play?
 * A: Yes. Beast Below can always be played as a unit. Its "When you play me" trigger, however, needs a legal target for
 *    EVERY required target to be put on the chain — with no other friendly unit it never goes on the chain, so the enemy
 *    unit is not returned either.
 * Rules: 355.6 / 383.3.c (a triggered ability lacking a required target is not added to the chain), 346 (playing a unit).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BEAST_BELOW = "sfd-132-221";

/** P1's turn with exactly [7][chaos][chaos]; Beast Below in hand; P1 controls NO unit. P2: Raider (4) at P2's bf1, Camper (2) in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 2, name: "Camper" }, "camper")
    .hand(P1, BEAST_BELOW, "beast");
}

describe("Ruling 00754df6ef976f3a — Beast Below is playable with no other friendly unit; its trigger just never reaches the chain", () => {
  test("with no other friendly unit the play is LEGAL: Beast Below enters P1's base (8 Might), the full cost is paid", async () => {
    const game = await board().build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("play", "beast")).toBe(true);
    await game.p1.play("beast");
    expect(game.zoneOf("beast")).toBe("base");
    expect(game.state("beast").might).toBe(8);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("…but the 'When you play me' trigger is NOT put on the chain (no 'another friendly unit' exists): nobody is asked anything, both enemy units stay on the board, P1 is straight back in an open main phase", async () => {
    const game = await board().build();
    await game.p1.play("beast");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.zoneOf("camper")).toBe("base");
    expect(game.p2.hand()).toEqual([]);
    expect(game.zoneOf("beast")).toBe("base"); // it never bounces itself ("another")
    expect(game.violations()).toEqual([]);
  });

  test("contrast — with another friendly unit the trigger DOES go on the chain with both required targets and returns both units to hand", async () => {
    const game = await board().unit(P1, "base", { might: 1, name: "Minnow" }, "minnow").build();
    await game.p1.play("beast");
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.find((o) => (o.card ?? o.key) === "raider")?.key ?? d.options[0]!.key);
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "beast", controller: P1, triggered: true })]);
    expect(game.chain()[0]?.targets).toContain("minnow");
    await game.settle();
    expect(game.zoneOf("minnow")).toBe("hand");
    expect([game.zoneOf("raider"), game.zoneOf("camper")].filter((z) => z === "hand")).toHaveLength(1);
    expect(game.zoneOf("beast")).toBe("base");
  });
});
