/**
 * Icathian Rain — ogn-248-298 · Spell · Fury/Mind · 7 energy + 3 power (hybrid fury|mind pips)
 *
 *   Deal 2 to a unit.
 *   Deal 2 to a unit.
 *   Deal 2 to a unit.
 *   Deal 2 to a unit.
 *   Deal 2 to a unit.
 *   Deal 2 to a unit.
 *
 * Six separate "Deal 2" instances, each with its own freely chosen unit (same or different, any
 * location) — 12 damage in total. No [Action]/[Reaction] tag → only on your own turn in an open
 * state. Engine quirk: hybrid pips are paid from `power.rainbow`.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-248-298";

function board(energy = 7, rainbow = 3) {
  return scenario()
    .resources(P1, { energy, power: { rainbow } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 20 }, "a")
    .unit(P2, "base", { might: 20 }, "b")
    .unit(P1, "base", { might: 20 }, "c")
    .hand(P1, CARD, "rain");
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;

/** Cast the Rain aiming the six instances at `targets` (up front if the engine takes a 6-tuple, else one by one). */
async function castAt(game: Built, targets: string[]) {
  // rule 355.8 — all six mandatory targets are bound up front; pad short lists with the last pick.
  const full = [...targets];
  while (full.length < 6) full.push(targets.at(-1) as string);
  const upFront = await game.p1.try((p) => p.cast("rain", { targets: full }));
  if (!upFront.ok) {
    await game.p1.cast("rain", { targets: targets[0] });
  }
  const queue = upFront.ok ? [] : targets.slice(1);
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(queue.shift() ?? (targets.at(-1) as string));
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.acting().pass();
    } else {
      break;
    }
  }
}

describe("Icathian Rain (ogn-248-298)", () => {
  test("costs 7 energy + 3 (hybrid) power; goes to trash after resolving", async () => {
    const game = await board().build();
    await game.p1.cast("rain", { targets: ["a", "a", "a", "a", "a", "a"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rain", triggered: false })]);
    await game.settle({ policy: "first" });
    expect(game.zoneOf("rain")).toBe("trash");
  });

  test("unaffordable with 6 energy or with only 2 power", async () => {
    expect((await board(6, 3).build()).p1.can("cast", "rain")).toBe(false);
    expect((await board(7, 2).build()).p1.can("cast", "rain")).toBe(false);
  });

  test("'a unit': units anywhere (enemy at a battlefield, enemy in base, your own) are legal targets", async () => {
    const game = await board().build();
    const opts = game.p1.option("cast", "rain")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    const firsts = opts.map((o) => (o as string[])[0]);
    expect([...new Set(firsts)].sort()).toEqual(["a", "b", "c"]);
  });

  test("six instances of 'Deal 2' — all aimed at one unit deal 12", async () => {
    // Expected: 6 × 2 = 12 damage on "a". Actual: the spell is modelled as a single "Deal 2 to a unit"
    // (one target, resolves once), so "a" takes only 2.
    const game = await board().build();
    await castAt(game, ["a", "a", "a", "a", "a", "a"]);
    expect(game.state("a").damage).toBe(12);
    expect(game.zoneOf("rain")).toBe("trash");
  });

  test("the six instances can be spread across different units (3 on a, 2 on b, 1 on c)", async () => {
    // Expected: a=6, b=4, c=2. Actual: only one instance exists, so a=2 and the rest take nothing.
    const game = await board().build();
    await castAt(game, ["a", "a", "a", "b", "b", "c"]);
    expect(game.state("a").damage).toBe(6);
    expect(game.state("b").damage).toBe(4);
    expect(game.state("c").damage).toBe(2);
  });

  // rule 355.8: the six "Deal 2 to a unit" instructions are mandatory targets, so all six are
  // chosen as the spell is put on the chain — a partial pick would defer the rest to
  // resolution-time prompts raised after the reaction window already closed.
  test("355.8: all six targets are locked at play time — a partial target list is refused", async () => {
    const game = await board().build();
    await expect(game.p1.cast("rain", { targets: ["a", "b"] })).rejects.toThrow();
    expect(game.zoneOf("rain")).toBe("hand");
    await game.p1.cast("rain", { targets: ["a", "a", "a", "a", "a", "a"] });
    expect(game.chain()[0]).toMatchObject({ cardId: "rain", targets: ["a", "a", "a", "a", "a", "a"] });
  });

  // rule 355.9.a.1: instances aimed at a unit an earlier instance already killed simply do
  // nothing — targets are never re-chosen, and no prompt is raised on resolution.
  test("355.9.a.1: instances aimed at an already-killed unit fizzle — no resolution-time re-pick", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { rainbow: 3 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Weak" }, "weak")
      .unit(P2, "bf1", { might: 20 }, "a")
      .hand(P1, CARD, "rain")
      .build();
    await game.p1.cast("rain", { targets: ["weak", "weak", "weak", "weak", "weak", "weak"] });
    let sawPick = false;
    for (let i = 0; i < 20; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.acting().pass();
      } else if (d?.kind === "pick" && d.seat === P1) {
        sawPick = true;
        break;
      } else {
        break;
      }
    }
    expect(sawPick).toBe(false);
    expect(game.zoneOf("weak")).toBe("trash");
    expect(game.state("a").damage ?? 0).toBe(0);
  });

  test("no [Action]/[Reaction]: not castable on the opponent's turn", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "rain")).toBe(false);
  });

  test("no [Action] tag — not castable during a showdown even on your own turn with focus (rules 155, 310.1.a)", async () => {
    // Expected: once the attacker's move opens a showdown at bf1 the untagged Rain is no longer legal.
    // Actual: the engine still offers it to the focused turn player.
    const game = await board().unit(P1, "base", { might: 3 }, "attacker").build();
    expect(game.p1.can("cast", "rain")).toBe(true);
    await game.p1.move("attacker", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "rain")).toBe(false);
  });
});
