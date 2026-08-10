/**
 * Ruling 56d5432ca83f5b1b — Sprite Call (OGN-094 → ogn-094-298) · [Hidden][Action] 3 · "Play a ready 3 [Might] Sprite unit token
 *   with [Temporary]."   × Sprite token (OGN-274 → ogn-274-298)
 *
 * Q: Can Sprite Call be used during my attack to add an attacker at a battlefield I don't control?
 * A: No — units (tokens included) may only be played to your base or a battlefield you control. Use it on defense (you do
 *    control the battlefield being attacked), or play the ready Sprite beforehand and move it in with the attack.
 * Rules: 340.2 / 620 (play locations: your base or a battlefield you control), 181.3 (contested-but-controlled counts).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_CALL = "ogn-094-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function sprites(game: Game): string[] {
  return game.findAll({ name: "Sprite", owner: P1 }).filter((id) => game.zoneOf(id) !== "gone");
}

/** Cast Sprite Call (in whatever window is open), pass it through, and return the Sprite's destination prompt. */
async function callAndGetDestination(game: Game): Promise<Extract<Decision, { kind: "pick" }>> {
  expect(game.p1.can("cast", "call")).toBe(true);
  await game.p1.cast("call");
  expect(game.p1.energy()).toBe(0);
  for (let i = 0; i < 4 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  return d as Extract<Decision, { kind: "pick" }>;
}

describe("Ruling 56d5432ca83f5b1b — Sprite Call can't drop a Sprite onto a battlefield you don't control", () => {
  test("ATTACKING P2's bf1: cast mid-showdown, the Sprite may go to P1's base or P1's own bf2 — the contested bf1 is not offered and is refused", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .unit(P1, "bf2", { might: 1, name: "Holder" }, "holder")
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .hand(P1, SPRITE_CALL, "call")
      .build();
    await game.p1.move("raider", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
    const dest = await callAndGetDestination(game);
    expect(dest.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf2"]);
    const r = await game.p1.try((p) => p.answer({ keys: ["battlefield-bf1"], kind: "pick" }));
    expect(r.ok).toBe(false);
    await game.p1.pick("base");
    const [sprite] = sprites(game);
    expect(game.locationOf(sprite as string)).toBe("base");
    expect(game.state(sprite as string).isReady).toBe(true);
    // The attack goes on without it: Raider 3 vs Guard 4.
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("DEFENDING my bf1: I still control it, so the Sprite may be played straight there and fights as a defender", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, SPRITE_CALL, "call")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    await game.p2.passFocus();
    const dest = await callAndGetDestination(game);
    expect(dest.options.map((o) => o.key)).toContain("battlefield-bf1");
    await game.p1.pick("battlefield-bf1");
    const [sprite] = sprites(game);
    expect(game.locationOf(sprite as string)).toBe("bf1");
    await game.settle();
    // Guard 2 + Sprite 3 hold off the Raider 3.
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the sanctioned line on offense: play the Sprite BEFORE attacking (it enters ready) and move it in together with the Raider", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .hand(P1, SPRITE_CALL, "call")
      .build();
    await game.p1.cast("call");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("base");
    }
    const [sprite] = sprites(game);
    expect(game.state(sprite as string)).toMatchObject({ isReady: true, might: 3 });
    await game.p1.move(["raider", sprite as string], "bf1");
    expect(game.p1.units("bf1").sort()).toEqual(["raider", sprite as string].sort());
    await game.settle();
    // 3 + 3 = 6 vs 4: the Guard dies and P1 conquers.
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
