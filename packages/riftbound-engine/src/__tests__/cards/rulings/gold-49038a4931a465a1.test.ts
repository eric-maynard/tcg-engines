/**
 * Ruling 49038a4931a465a1 — Gold (SFD-T03 → sfd-t03) gear token · × Wages of Pain (SFD-070 → sfd-070-221) · Spell ·
 *   Mind · 3 · [Hidden][Action] "Deal 3 to a unit at a battlefield. Play a Gold gear token exhausted."
 *   (+ Flash ogs-011-024 [Reaction] "Move up to 2 friendly units to base." as the invalidating response)
 *
 * Q: Does Wages of Pain still create the Gold token if its target is no longer valid on resolution?
 * A: Yes. The damage instruction is ignored (target no longer "at a battlefield"), but "Play a Gold gear token
 *    exhausted." is a separate sentence that references no target, so it still executes.
 * Rules: 359.3.e.5–6 (instructions that can't be followed are skipped; independent instructions still happen).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAGES_OF_PAIN = "sfd-070-221";
const FLASH = "ogs-011-024";

function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Mark" }, "mark")
    .hand(P1, WAGES_OF_PAIN, "wages")
    .hand(P2, FLASH, "flash");
}

async function wagesThenFlash(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.gear()).toEqual([]);
  await game.p1.cast("wages", { targets: "mark" });
  expect(game.p1.energy()).toBe(0);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.cast("flash", { targets: ["mark"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["wages", "flash"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Flash resolves: Mark → base
  expect(game.locationOf("mark")).toBe("base");
  expect(game.chain().map((c) => c.cardId)).toEqual(["wages"]);
  return game;
}

describe("Ruling 49038a4931a465a1 — Wages of Pain still mints Gold when its damage target went illegal", () => {
  test("Mark is Flashed to base in response; Wages resolves: NO damage to Mark (no longer at a battlefield) and no re-target is offered…", async () => {
    const game = await wagesThenFlash();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      const d = game.decision();
      expect(d?.kind === "pick" && d.seat === P1).toBe(false);
      if (d?.kind !== "action") break;
      await game.seat(d.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("wages")).toBe("trash");
    expect(game.state("mark").damage).toBe(0);
    expect(game.zoneOf("mark")).toBe("base");
  });

  test("…yet the independent second sentence still runs: P1 gets an exhausted Gold gear token", async () => {
    const game = await wagesThenFlash();
    await game.settle();
    expect(game.chain()).toEqual([]);
    const gear = game.p1.gear();
    expect(gear).toHaveLength(1);
    expect(game.state(gear[0]!)).toMatchObject({ controller: P1, isExhausted: true, isToken: true, name: "Gold" });
    expect(game.violations()).toEqual([]);
  });

  test("control: with no response, Wages deals 3 to Mark AND creates the Gold token", async () => {
    const game = await board().build();
    await game.p1.cast("wages", { targets: "mark" });
    await game.settle();
    expect(game.state("mark").damage).toBe(3);
    expect(game.p1.gear()).toHaveLength(1);
    expect(game.state(game.p1.gear()[0]!)).toMatchObject({ isExhausted: true, name: "Gold" });
  });
});
