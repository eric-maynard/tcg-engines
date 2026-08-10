/**
 * Ruling 39c5988b78e35151 — Void Seeker (OGN-024 → ogn-024-298) · Action spell · Fury · [3]+[fury]
 *     "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] · "Kill a unit at a battlefield. Its controller draws 2."
 *   (+ Pouty Poro ogn-013-298, a [Deflect] unit, as the target — for the "deflect cost stays paid" nuance.)
 *
 * Q: Void Seeker targets my unit; can I flip a hidden Hidden Blade to kill my own unit first? What happens to Void
 *    Seeker, and does its caster still pay?
 * A: Yes. All costs (incl. Deflect) were paid on cast and stay paid. Hidden Blade resolves first: the unit dies and
 *    you draw 2. Void Seeker then does as much as it can — no damage (target gone) but its caster still draws 1.
 * Rules: 355.1/356 (costs paid at play), 811 (Hidden), 359.3.f (illegal target → that instruction does nothing;
 *        independent instructions still resolve).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const HIDDEN_BLADE = "ogn-213-298";
const POUTY_PORO = "ogn-013-298"; // 2 Might, [Deflect]

/** P1's turn with exactly [3] + fury + 1 rainbow (the Deflect pip). P2 holds bf1 with Pouty Poro and a hidden Hidden Blade. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1, rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
    .hand(P1, VOID_SEEKER, "vs");
}

async function voidSeekerThenBlade(): Promise<{ game: Game; p1Hand0: number; p2Hand0: number }> {
  const game = await board().build();
  const p1Hand0 = game.p1.hand().length;
  const p2Hand0 = game.p2.hand().length;
  await game.p1.cast("vs", { targets: "poro" });
  await game.p1.passPriority();
  expect(game.p2.can("reveal", "blade")).toBe(true);
  await game.p2.reveal("blade");
  return { game, p1Hand0, p2Hand0 };
}

describe("Ruling 39c5988b78e35151 — Hidden Blade can snipe your own unit out from under Void Seeker; costs stay paid, caster still draws", () => {
  test("Player A pays ALL of Void Seeker's costs up front — [3] + [fury] + the Poro's Deflect [rainbow] — and it goes on the chain targeting the Poro", async () => {
    const game = await board().build();
    await game.p1.cast("vs", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vs", controller: P1, targets: ["poro"] })]);
  });

  test("P2 responds by revealing Hidden Blade (for 0) at the same unit: it sits above Void Seeker and resolves first — the Poro dies and P2 (its controller) draws 2", async () => {
    const { game, p2Hand0 } = await voidSeekerThenBlade();
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "blade"]);
    expect(game.p2.energy()).toBe(0);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Hidden Blade resolves
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vs", targets: ["poro"] })]);
  });

  test("Void Seeker then resolves doing as much as it can: no damage is dealt anywhere, P1 still draws 1, and nothing was refunded", async () => {
    const { game, p1Hand0, p2Hand0 } = await voidSeekerThenBlade();
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("poro").damage).toBe(0); // it died to the Blade, never took the 4
    expect(game.p1.hand()).toHaveLength(p1Hand0 - 1 + 1); // Void Seeker left, drew 1
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } }); // costs stay paid
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
