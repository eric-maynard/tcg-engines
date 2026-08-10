/**
 * Ruling 6adf53979db2ab23 — Elder Dragon (UNL-118 → unl-118-219) · 12+[body]×4 · 10 Might
 *     "Any amount of your damage is enough to kill enemy units. When you play me, choose up to one enemy unit at each
 *      location. Deal 1 to them."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction [2] "Move up to 2 friendly units to base."
 *
 * Q: I hold two battlefields with one creature each; the opponent's Elder Dragon enters targeting both. If I Flash both back
 *    to base, do they live, or does the damage follow them to the new location?
 * A: Both survive undamaged. Flash resolves first; when the Dragon's ability resolves, the units are no longer at the
 *    locations they were chosen "at", so they fail its targeting restriction and are unaffected.
 * Rules: 355.5/355.7 (targets fixed at finalization), 359.3.e.5 (target illegal on resolution → unaffected), 336 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const FLASH = "ogs-011-024";

/** P1's turn with exactly 12 + [body]×4. P2 controls bf1 (Yak, 3) and bf2 (Ram, 4), base empty; Flash in hand + [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { body: 4 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Yak" }, "yak")
    .unit(P2, "bf2", { might: 4, name: "Ram" }, "ram")
    .hand(P2, FLASH, "flash")
    .hand(P1, ELDER_DRAGON, "elder");
}

/** P1 plays the Dragon and picks Yak (bf1) + Ram (bf2) as its per-location targets; P1 passes to P2. */
async function dragonTargetsBoth(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("elder");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "elder", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "elder" } });
  await game.p1.pick("yak", "ram");
  for (let i = 0; i < 4 && game.decision()?.kind === "pick" && game.decision()?.seat === P1; i++) {
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    const want = ["yak", "ram"].filter((t) => keys.includes(t));
    if (want.length > 0) {
      await game.p1.pick(want[0]!);
    } else {
      await game.p1.decline();
    }
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 6adf53979db2ab23 — Flashing both targets home leaves Elder Dragon's ability with nothing to hit", () => {
  test("P2 can respond with Flash moving BOTH targeted units to base; it stacks above the Dragon's ability and resolves first", async () => {
    const game = await dragonTargetsBoth();
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: ["yak", "ram"] });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["elder", "flash"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves
    expect(game.locationOf("yak")).toBe("base");
    expect(game.locationOf("ram")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["elder"]); // the ability is still to resolve
    expect(game.state("yak").damage).toBe(0);
    expect(game.state("ram").damage).toBe(0);
  });

  test("then the Dragon's ability resolves: neither unit is at the location it was chosen at → NO damage to either, both alive in base; P1 is never asked to re-target", async () => {
    const game = await dragonTargetsBoth();
    await game.p2.cast("flash", { targets: ["yak", "ram"] });
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      expect(d?.kind === "pick" && d.seat === P1).toBe(false); // no new choice for the Dragon player
      if (d?.kind !== "action") {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("yak")).toBe("base");
    expect(game.zoneOf("ram")).toBe("base");
    expect(game.state("yak").damage).toBe(0);
    expect(game.state("ram").damage).toBe(0);
    expect(game.p2.trash()).not.toContain("yak");
    expect(game.p2.trash()).not.toContain("ram");
    expect(game.zoneOf("elder")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control — no Flash: both chosen units take 1 where they stand and, any amount being lethal, both die", async () => {
    const game = await dragonTargetsBoth();
    await game.settle();
    expect(game.zoneOf("yak")).toBe("trash");
    expect(game.zoneOf("ram")).toBe("trash");
  });
});
