/**
 * Ruling a6a4e61cf7a5ceee — Not So Fast (SFD-045 → sfd-045-221) · Spell · Calm · [2][calm] · Reaction
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Overzealous Fan (SFD-128 → sfd-128-221) · Unit · Chaos · [2] · 2 · "When I defend, you may kill me to move an
 *     attacking unit to its base."
 *
 * Q: If I Not So Fast an Overzealous Fan's trigger, does the Fan still die?
 * A: Yes. Under the current (Unleashed) rules "kill me" is a cost paid up front to finalize the triggered ability onto the
 *    chain: defend trigger → controller pays by killing the Fan → ability is on the chain → opponent may Not So Fast it →
 *    countered: the attacking unit is NOT moved, but the Fan, already killed to pay the cost, stays dead.
 * Rules: 356 / 383.3 (costs within a triggered ability's instructions are paid at finalization), 425.1 (a countered
 *        item's effect doesn't happen; paid costs are not refunded), 355 (the ability chooses the attacking unit → NSF-legal).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const OVERZEALOUS_FAN = "sfd-128-221";

const nsfTargets = (game: Game) => (game.p1.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();

/** P1's turn. P2 holds bf1 with the Fan (2) and a Wall (4). P1's Raider (3) in base; P1 has Not So Fast with exactly [2][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, NOT_SO_FAST, "nsf");
}

/** Raider attacks bf1; the Fan's "When I defend" triggers and P2 opts in (paying "kill me"). */
async function fanOptsIn(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "fan" } });
  expect(game.zoneOf("fan")).toBe("battlefield-bf1"); // still alive while P2 decides
  await game.p2.yes();
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("raider");
  }
  return game;
}

describe("Ruling a6a4e61cf7a5ceee — countering Overzealous Fan's ability does not save the Fan (kill is an up-front cost)", () => {
  test("steps 1–3: on opting in, P2 pays the cost — the Fan is killed (P2's trash) — and only then is the ability on the chain, choosing the attacking Raider", async () => {
    const game = await fanOptsIn();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.p2.trash()).toContain("fan");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P2, targets: ["raider"], triggered: true })]);
    expect(game.locationOf("raider")).toBe("bf1"); // nothing moved yet
  });

  test("step 4: with the ability pending, P1 gets priority and Not So Fast is legal against it (it chooses P1's unit)", async () => {
    const game = await fanOptsIn();
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(nsfTargets(game)).toEqual(["fan"]);
    expect(game.p1.can("cast", "nsf")).toBe(true);
  });

  test("step 5: NSF resolves and counters it — the Raider is NOT moved home and keeps attacking; the Fan is STILL in the trash (not brought back), both players' resources spent", async () => {
    const game = await fanOptsIn();
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    await game.p1.cast("nsf", { targets: "fan" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fan", "nsf"]);
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.p2.units()).toEqual(["wall"]);
    // And the combat goes on without the Fan: Raider (3) into Wall (4) → Raider dies, P2 keeps bf1.
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("control — not countered: the ability resolves, the Raider is moved to P1's base, and the Fan is (of course) dead too", async () => {
    const game = await fanOptsIn();
    await game.settle();
    expect(game.locationOf("raider")).toBe("base");
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
