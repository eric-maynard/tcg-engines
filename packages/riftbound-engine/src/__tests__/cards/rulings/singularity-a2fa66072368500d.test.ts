/**
 * Ruling a2fa66072368500d — Singularity (OGN-105 → ogn-105-298) · Spell · [6][mind][mind] · "Deal 6 to each of up to two units."
 *   × Retreat (OGN-104 → ogn-104-298) · Reaction · [1] · "Return a friendly unit to its owner's hand. Its owner channels 1
 *     rune exhausted."
 *
 * Q: Singularity targets two units and one is Retreated before it resolves — can the caster retarget another unit?
 * A: No. The two targets are locked when Singularity is put on the chain. The opponent may Retreat one in response
 *    (they get priority); the other target still takes 6, and no retargeting happens.
 * Rules: 355.5 / 355.13 (targets chosen and fixed at finalization; "up to two"), 355.11 (an instruction whose target
 *        is gone does nothing), 330–332 (priority on the chain, LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SINGULARITY = "ogn-105-298";
const RETREAT = "ogn-104-298";

/** P1's turn, exactly [6][mind][mind]. P2: Alpha (4), Bravo (7), Charlie (3) in base; Retreat + [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .resources(P2, { energy: 1 })
    .unit(P2, "base", { might: 4, name: "Alpha" }, "a")
    .unit(P2, "base", { might: 7, name: "Bravo" }, "b")
    .unit(P2, "base", { might: 3, name: "Charlie" }, "c")
    .hand(P1, SINGULARITY, "sing")
    .hand(P2, RETREAT, "retreat");
}

/** Singularity at [Alpha, Bravo]; P1 passes; P2 Retreats Alpha; Retreat resolves. Singularity is left on the chain. */
async function retreatedAlpha(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("sing", { targets: ["a", "b"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sing", controller: P1, targets: ["a", "b"] })]);
  await game.p1.passPriority();
  // nuance: P2 CAN respond before it resolves — this is P2's priority window and Retreat is legal in it.
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "retreat")).toBe(true);
  await game.p2.cast("retreat", { targets: "a" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["sing", "retreat"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Retreat resolves (LIFO)
  expect(game.zoneOf("a")).toBe("hand");
  expect(game.p2.runes({ ready: false })).toHaveLength(1); // "its owner channels 1 rune exhausted"
  return game;
}

describe("Ruling a2fa66072368500d — Singularity cannot retarget after one of its two targets is Retreated", () => {
  test("with Alpha gone, Singularity still names its ORIGINAL targets [a, b]; the caster's next decision is plain priority (pass/concede) — no re-target pick, Charlie is never offered", async () => {
    const game = await retreatedAlpha();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sing", targets: ["a", "b"] })]);
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    const seat = game.seat((d as { seat: string }).seat);
    expect(seat.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
  });

  test("resolution: Bravo takes its 6 (survives at 7); Alpha in hand is untouched; Charlie — never a target — takes nothing; nobody was asked to pick anything on the way", async () => {
    const game = await retreatedAlpha();
    let sawPick = false;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        sawPick = true;
        break;
      }
      await game.acting().pass();
    }
    expect(sawPick).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.state("b")).toMatchObject({ damage: 6, might: 7, zone: "base" });
    expect(game.zoneOf("a")).toBe("hand");
    expect(game.state("a").damage).toBe(0);
    expect(game.state("c")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("control: un-Retreated, both original targets are hit — Alpha (4) dies, Bravo wears 6", async () => {
    const game = await board().build();
    await game.p1.cast("sing", { targets: ["a", "b"] });
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.state("b").damage).toBe(6);
    expect(game.state("c").damage).toBe(0);
  });
});
