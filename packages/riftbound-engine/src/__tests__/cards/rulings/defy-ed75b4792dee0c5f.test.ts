/**
 * Ruling ed75b4792dee0c5f — Defy (OGN-045 → ogn-045-298) · Spell · Calm · 1+[calm] · Reaction
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Bullet Time (OGN-268 → ogn-268-298) · Spell · Body/Chaos · 1 · Action
 *     "Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *
 * Q: Can you Defy a Bullet Time that paid 2+ power?
 * A: Not after the power is paid — paying is part of Bullet Time's EFFECT (at resolution), and once it is paid the spell is
 *    resolving; there is no window left. Defy it while it sits on the chain (it costs [1] and no power there); if you do, the
 *    opponent never pays any power.
 * Rules: 204.3.b (an amount "paid" inside an effect is paid at resolution), 425 (counter), 332/336 (no priority mid-resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const BULLET_TIME = "ogn-268-298";

/** P1's turn: [1] + 3 floating rainbow, Bullet Time in hand. P2 holds bf1 with two 2-Might Grunts and has Defy with exactly 1+[calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 3 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Grunt A" }, "ga")
    .unit(P2, "bf1", { might: 2, name: "Grunt B" }, "gb")
    .hand(P1, BULLET_TIME, "bt")
    .hand(P2, DEFY, "defy");
}

async function bulletTimeOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bt", { targets: "bf1" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt", controller: P1 })]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 3 } }); // only the printed [1]; no power yet
  return game;
}

describe("Ruling ed75b4792dee0c5f — Defy must hit Bullet Time BEFORE its power is paid", () => {
  test("on the chain Bullet Time has cost exactly [1] and no power has been paid — it is a legal Defy target and P2 is offered it", async () => {
    const game = await bulletTimeOnChain();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
    const targets = (game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toContain("bt");
  });

  test("Defied there: Bullet Time is countered — P1 is NEVER asked for an amount and pays no power (still 3 rainbow), no Grunt is damaged", async () => {
    const game = await bulletTimeOnChain();
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "bt" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bt", "defy"]);
    let askedX = false;
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      askedX ||= game.decision()?.kind === "integer";
      await game.acting().passPriority();
    }
    askedX ||= game.decision()?.kind === "integer";
    expect(askedX).toBe(false);
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 3 } });
    expect(game.state("ga").damage).toBe(0);
    expect(game.state("gb").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("not Defied on the chain: both pass, Bullet Time starts RESOLVING and only now asks P1 how much [rainbow] to pay — during that payment P2 has no action at all (no Defy window)", async () => {
    const game = await bulletTimeOnChain();
    await game.p1.passPriority();
    await game.p2.passPriority(); // P2 let it go
    expect(game.decision()).toMatchObject({ kind: "integer", seat: P1, unit: "rainbow" });
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.can("cast", "defy")).toBe(false);
  });

  test("once the 2 power is paid it is too late: the damage is dealt in the same resolution (both Grunts die), Bullet Time is in the trash, and Defy — still in P2's hand — has nothing left to counter", async () => {
    const game = await bulletTimeOnChain();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.chooseX(2);
    expect(game.p1.power("rainbow")).toBe(1);
    await game.settle();
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("gb")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } }); // never got to spend it
    // Back in P1's open main phase; even when P2 next gets to act there is no Bullet Time to target.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
