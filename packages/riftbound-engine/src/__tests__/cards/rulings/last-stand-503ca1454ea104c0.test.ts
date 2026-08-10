/**
 * Ruling 503ca1454ea104c0 — Last Stand (OGN-069 → ogn-069-298) · Spell · Calm · 3+[calm] · [Action] "Double a friendly
 *   unit's Might this turn. Give it [Temporary]." × Zhonya's Hourglass (OGN-077 → ogn-077-298) "If a friendly unit would
 *   die, kill this instead. Heal that unit, exhaust it, and recall it."  (Lee Sin, Ascetic ogn-078-298 · 5 · "I can have
 *   any number of buffs." as the buffed Lee Sin)
 *
 * Q: Lee Sin got Last Stand (so: Temporary). When Temporary tries to kill him and Zhonya's saves him, does he keep
 *    Temporary and his buffs in base?
 * A: Yes. Zhonya's only replaces the death (heal / exhaust / recall); it removes neither keywords nor buffs. So he
 *    survives one more cycle and Temporary kills him the next time it triggers (unless saved again).
 * Rules: 816 (Temporary: kill at the start of its controller's Beginning Phase), 372 (replacement), 702–703 (buffs).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LAST_STAND = "ogn-069-298";
const ZHONYAS = "ogn-077-298";
const LEE_SIN_ASCETIC = "ogn-078-298";

/** P1's turn. Lee Sin (5) with TWO buffs (→ 7) at P1's bf1; face-up Zhonya's in P1's base; Last Stand + 3+[calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", LEE_SIN_ASCETIC, "lee", { buffed: true, extraBuffs: 1 })
    .gear(P1, ZHONYAS, "zh")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "by")
    .hand(P1, LAST_STAND, "ls");
}

async function lastStandOnLee(): Promise<Game> {
  const game = await board().build();
  expect(game.state("lee")).toMatchObject({ isBuffed: true, might: 7 });
  await game.p1.cast("ls", { targets: "lee" });
  await game.settle();
  expect(game.zoneOf("ls")).toBe("trash");
  expect(game.state("lee").might).toBe(14); // doubled this turn
  expect(game.state("lee").keywords).toContain("Temporary");
  return game;
}

describe("Ruling 503ca1454ea104c0 — Zhonya's saves a Last-Stand Lee Sin without stripping Temporary or his buffs", () => {
  test("through P2's turn Lee Sin is back to 7 (double expired) but still buffed ×2 and still Temporary; nothing kills him on the OPPONENT's beginning phase", async () => {
    const game = await lastStandOnLee();
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("lee")).toBe("battlefield-bf1");
    expect(game.state("lee")).toMatchObject({ isBuffed: true, might: 7 });
    expect(game.state("lee").meta.extraBuffs).toBe(1);
    expect(game.state("lee").keywords).toContain("Temporary");
    expect(game.zoneOf("zh")).toBe("base");
  });

  test("at the start of P1's next Beginning Phase Temporary tries to kill him: Zhonya's is killed instead and Lee Sin is healed, exhausted and recalled to base — KEEPING both buffs (7 Might) and the Temporary keyword", async () => {
    const game = await lastStandOnLee();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (Temporary fires in the Beginning Phase; the replacement applies)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("lee")).toBe("base");
    expect(game.state("lee")).toMatchObject({ damage: 0, isBuffed: true, isExhausted: true, might: 7 });
    expect(game.state("lee").meta.extraBuffs).toBe(1);
    expect(game.state("lee").keywords).toContain("Temporary");
  });

  test("…which only buys one cycle: with no second Hourglass, Temporary triggers again at P1's following Beginning Phase and Lee Sin dies", async () => {
    const game = await lastStandOnLee();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1: saved by Zhonya's
    expect(game.zoneOf("lee")).toBe("base");
    await game.advanceTurn(); // → P2
    expect(game.zoneOf("lee")).toBe("base"); // not on the opponent's turn
    await game.advanceTurn(); // → P1: Temporary again, nothing to replace the death
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("lee")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
