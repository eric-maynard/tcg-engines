/**
 * Ruling 5db567d6caadf7e0 — Ezreal, Dashing (SFD-082 → sfd-082-221) · Unit · Mind · [4][mind] · 3 Might
 *   "When I attack or defend, deal damage equal to my Might to an enemy unit here. I don't deal combat damage. …"
 *   × Overzealous Fan (SFD-128 → sfd-128-221) · Unit · Chaos · [2] · 2 Might
 *     "When I defend, you may kill me to move an attacking unit to its base."
 *
 * Q: Can my opponent use Overzealous Fan's ability if I attack with Ezreal, Dashing?
 * A: Yes. Ezreal's "When I attack" (active player) goes on the chain first, the Fan's "When I defend" second. LIFO:
 *    the Fan resolves first — if the opponent kills the Fan, Ezreal is sent back to base; Ezreal's ability then
 *    finds itself no longer "here" and whiffs — no damage. Ezreal's target is chosen when the trigger goes on the
 *    chain; the Fan's kill decision is made for its own ability.
 * Rules: 383 (trigger ordering: turn player first), 340 (LIFO), 356.3.e.12 / 359.3.f.4 ("here" needs the source's location).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EZREAL = "sfd-082-221";
const OVERZEALOUS_FAN = "sfd-128-221";

/** P1's turn. P2 holds bf1 with the Fan (2) and a 5-Might Wall. Ezreal ready in P1's base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "base", EZREAL, "ezreal");
}

/** Ezreal attacks bf1; P1 targets the Wall with his trigger; P2 is offered the Fan's "you may kill me" and answers `acceptFan`. */
async function ezrealAttacks(acceptFan: boolean): Promise<Game> {
  const game = await board().build();
  await game.p1.move("ezreal", "bf1");
  expect(game.state("ezreal").combatRole).toBe("attacker");
  expect(game.state("fan").combatRole).toBe("defender");
  let sawFanOffer = false;
  for (let i = 0; i < 8; i++) {
    const d: Decision | null = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      // Ezreal's target is chosen as his trigger is put on the chain.
      expect(d.source?.cardId).toBe("ezreal");
      expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["fan", "wall"]);
      await game.p1.pick("wall");
    } else if (d.kind === "yes-no" && d.seat === P2) {
      expect(d.source).toMatchObject({ cardId: "fan", pendingChoiceType: "opt-in" });
      sawFanOffer = true;
      await (acceptFan ? game.p2.yes() : game.p2.no());
    } else if (d.kind === "pick" && d.seat === P2) {
      await game.p2.pick("ezreal"); // the attacking unit to send home
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(sawFanOffer).toBe(true); // yes — the opponent CAN use the Fan against Ezreal's attack
  return game;
}

describe("Ruling 5db567d6caadf7e0 — Overzealous Fan vs Ezreal, Dashing: Fan resolves first, Ezreal goes home and his damage whiffs", () => {
  test("triggers go on the chain attacker-first: Ezreal's 'When I attack' (P1, targeting Wall) FIRST, the Fan's 'When I defend' (P2, choosing Ezreal) SECOND; the Fan is already dead (its cost)", async () => {
    const game = await ezrealAttacks(true);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ezreal", controller: P1, targets: ["wall"], triggered: true }),
      expect.objectContaining({ cardId: "fan", controller: P2, targets: ["ezreal"], triggered: true }),
    ]);
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.zoneOf("ezreal")).toBe("battlefield-bf1");
    expect(game.state("wall").damage).toBe(0);
  });

  test("LIFO: the Fan's ability resolves first and moves Ezreal back to P1's base while Ezreal's trigger still waits", async () => {
    const game = await ezrealAttacks(true);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("ezreal")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ezreal", controller: P1, triggered: true })]);
    expect(game.state("wall").damage).toBe(0);
  });

  test("Ezreal's trigger then resolves but he is no longer 'here' → it whiffs: Wall takes NO damage; Ezreal sits in base, Fan in trash", async () => {
    const game = await ezrealAttacks(true);
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(0);
    expect(game.zoneOf("ezreal")).toBe("base");
    expect(game.zoneOf("fan")).toBe("trash");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — P2 declines the 'may': the Fan lives, only Ezreal's trigger is on the chain, and it deals his Might (3) to the Wall", async () => {
    const game = await ezrealAttacks(false);
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ezreal", controller: P1, targets: ["wall"], triggered: true })]);
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("wall").damage).toBe(3);
    expect(game.zoneOf("ezreal")).toBe("battlefield-bf1");
  });
});
