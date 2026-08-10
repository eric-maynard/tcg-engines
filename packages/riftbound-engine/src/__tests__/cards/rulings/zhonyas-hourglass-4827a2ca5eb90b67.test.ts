/**
 * Ruling 4827a2ca5eb90b67 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: When a [Tank] unit must be assigned lethal damage first and several units die in the same combat, is Zhonya's
 *    forced to save the Tank (assigned first), or may its controller choose which dying unit to save?
 * A: Tank only orders ASSIGNMENT; all combat damage is DEALT simultaneously, so the units die at the same time and
 *    Zhonya's controller chooses which one to save. Nuances: it is a replacement effect (not a trigger); it must be
 *    face up before the death; a still-hidden Zhonya's does nothing when a unit dies.
 * Rules: 815 (Tank: assigned combat damage first), 465.2.c.1.a (assigned damage is dealt simultaneously), 370–373
 *        (replacement effects; single-use replacement vs several simultaneous events → its controller picks).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

/**
 * P1's turn. P2 holds bf1 with Tank T (3, [Tank]) and Pal (2); Zhonya's is FACE UP in P2's base.
 * P1's Brute (6) attacks: 6 = 3 to the Tank first (lethal) + 3 to Pal (lethal) — both defenders take lethal damage.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { keywords: ["Tank"], might: 3, name: "Tank T" }, "tank")
    .unit(P2, "bf1", { might: 2, name: "Pal" }, "pal")
    .gear(P2, ZHONYAS, "zh")
    .unit(P1, "base", { might: 6, name: "Brute" }, "brute");
}

/** Attack, both pass Focus, P1 assigns Tank-first (3/3). Returns with the replacement-assign prompt (if any) pending. */
async function combatKillsBoth(game: Game): Promise<void> {
  await game.p1.move("brute", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  const d = game.decision();
  if (d?.kind === "distribute" && d.seat === P1) {
    // 815: the Tank must take its lethal 3 first; the remaining 3 go to Pal.
    expect(d.total).toBe(6);
    expect((await game.p1.try((p) => p.distribute({ pal: 6, tank: 0 }))).ok).toBe(false);
    await game.p1.distribute({ pal: 3, tank: 3 });
  }
}

describe("Ruling 4827a2ca5eb90b67 — Tank orders assignment, not death: Zhonya's controller picks which simultaneous death to replace", () => {
  test("both defenders take lethal combat damage at once → a 'which unit does Zhonya's save?' choice surfaces to P2 (its controller), naming BOTH the Tank and Pal; nothing has died yet", async () => {
    const game = await board().build();
    await combatKillsBoth(game);
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P2, semantics: "replacement-assign", source: { cardId: "zh" }, timing: "RPL" });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["pal", "tank"]);
    expect(game.actingSeat()).toBe(P2);
    expect(game.zoneOf("tank")).toBe("battlefield-bf1");
    expect(game.zoneOf("pal")).toBe("battlefield-bf1");
  });

  test("P2 is NOT forced onto the Tank: picking Pal → Zhonya's is killed instead, Pal healed/exhausted/recalled to base, the Tank dies; Brute conquers bf1", async () => {
    const game = await board().build();
    await combatKillsBoth(game);
    await game.p2.pick("pal");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("pal")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("tank")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("…or P2 picks the Tank — equally legal: Tank saved to base exhausted, Pal dies", async () => {
    const game = await board().build();
    await combatKillsBoth(game);
    await game.p2.pick("tank");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("tank")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("nuance — a still-HIDDEN Zhonya's (facedown at bf1, never flipped) replaces nothing: both defenders die, no choice is offered, Zhonya's was not 'killed instead'", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { keywords: ["Tank"], might: 3, name: "Tank T" }, "tank")
      .unit(P2, "bf1", { might: 2, name: "Pal" }, "pal")
      .facedown(P2, "bf1", ZHONYAS, "zh")
      .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
      .build();
    await combatKillsBoth(game);
    expect(game.decision()?.kind === "pick" ? (game.decision() as PickDecision).semantics : undefined).not.toBe("replacement-assign");
    await game.settle();
    expect(game.zoneOf("tank")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.p2.base()).toEqual([]); // nobody recalled
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // The unflipped facedown card is simply lost with the battlefield (never played, never "killed instead").
    expect(game.zoneOf("zh")).not.toBe("base");
    expect(game.state("zh").isExhausted).toBe(false);
  });
});
