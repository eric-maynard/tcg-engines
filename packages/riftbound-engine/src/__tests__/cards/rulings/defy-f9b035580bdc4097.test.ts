/**
 * Ruling f9b035580bdc4097 — Defy (OGN-045 → ogn-045-298) · Spell · Calm · [1]+[calm] · [Reaction]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Bullet Time (OGN-268 → ogn-268-298) · Spell · Body/Chaos · [1] · [Action]
 *     "Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *
 * Q: Can I Defy a Bullet Time "if he pays 6 power"?
 * A: Defy CAN counter Bullet Time (it checks the printed cost, [1]) — but only while it is on the chain, before any
 *    power is paid. The payment is part of Bullet Time's resolution; once the opponent is paying/has paid the 6, the
 *    response window is gone and it is too late to Defy.
 * Rules: 204.3.b (pay-X on resolution), 336–339 (priority window before resolution; none during it), 425 (counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const BULLET_TIME = "ogn-268-298";

/** P1's turn: Bullet Time + [1] and 6 floating chaos power. P2 holds bf1 with two Grunts (5, 6) and Defy + [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { chaos: 6 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Grunt A" }, "ga")
    .unit(P2, "bf1", { might: 6, name: "Grunt B" }, "gb")
    .hand(P1, BULLET_TIME, "bt")
    .hand(P2, DEFY, "defy");
}

async function bulletTimeOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bt", { targets: "bf1" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt", controller: P1 })]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 6 } }); // only [1] paid on cast — no power yet
  return game;
}

describe("Ruling f9b035580bdc4097 — Defy must hit Bullet Time on the chain, before the power is paid", () => {
  test("the window: after P1 casts Bullet Time and passes, P2 may Defy it (printed cost [1] ≤ [4]) — it is countered, P1 never pays any power, no damage", async () => {
    const game = await bulletTimeOnChain();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
    const offered = game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options;
    expect(offered).toContainEqual(["bt"]);
    await game.p2.cast("defy", { targets: "bt" });
    await game.settle();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.p1.power()).toBe(6); // nothing was ever paid
    expect(game.state("ga").damage).toBe(0);
    expect(game.state("gb").damage).toBe(0);
    expect(game.zoneOf("ga")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("too late: once both pass and Bullet Time starts resolving, P1 is asked how much [rainbow] to pay — during that payment P2 has no action at all (no Defy)", async () => {
    const game = await bulletTimeOnChain();
    await game.p1.passPriority();
    await game.p2.passPriority(); // P2 let it go → resolution begins
    const d = game.decision();
    expect(d).toMatchObject({ kind: "integer", seat: P1, source: { cardId: "bt" }, unit: "rainbow" });
    expect(d?.kind === "integer" ? d.max : -1).toBe(6);
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect((await game.p2.try((p) => p.cast("defy", { targets: "bt" }))).ok).toBe(false);
    expect(game.zoneOf("defy")).toBe("hand");
  });

  test("P1 pays 6: both Grunts take 6 and die, Bullet Time is in the trash — and there is nothing left for Defy to counter (not castable, still in hand, P2's [1][calm] unspent)", async () => {
    const game = await bulletTimeOnChain();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.chooseX(6);
    await game.settle();
    expect(game.p1.power()).toBe(0);
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("gb")).toBe("trash");
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.violations()).toEqual([]);
  });
});
