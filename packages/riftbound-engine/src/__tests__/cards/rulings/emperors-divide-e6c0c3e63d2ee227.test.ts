/**
 * Ruling e6c0c3e63d2ee227 — Emperor's Divide (SFD-043 → sfd-043-221) · [Hidden] [Action] · Calm · 2
 *     "Move any number of friendly units at a battlefield to their base."
 *   × Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield · "Units can't move from here to base."
 *
 * Q: Can I play Emperor's Divide at Vilemaw's Lair to move my units back to base?
 * A: No. The Lair's "can't" overrides the spell's move instruction: the spell resolves and does nothing for those
 *    units (an instruction that can't be followed is ignored). No spell, ability or Standard Move can move units from
 *    the Lair to base — but Recall effects (not moves) still work.
 * Rules: 105 ("can't" beats "can"), 359.3.e.6 (impossible instruction ignored, spell still resolves), 446 (move) vs
 *        recall (not a move).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EMPERORS_DIVIDE = "sfd-043-221";
const VILEMAWS_LAIR = "ogn-295-298";
/** Inline [Action] "Recall a friendly unit." — the ruling's contrast (a recall is not a move). */
const FALL_BACK = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "recall" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Fall Back (inline recall)",
  timing: "action",
} as const;

/** P1's turn with [3]. P1 holds the live Lair with a Spider (3) and a Hatchling (2); a plain bf2 with a Scout (2) for the control case. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "lair", { might: 3, name: "Spider" }, "spider")
    .unit(P1, "lair", { might: 2, name: "Hatchling" }, "hatch")
    .unit(P1, "bf2", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "bf3", { might: 2, name: "Guard" }, "guard")
    .hand(P1, EMPERORS_DIVIDE, "divide")
    .hand(P1, FALL_BACK, "fallback");
}

describe("Ruling e6c0c3e63d2ee227 — Emperor's Divide can't pull units out of Vilemaw's Lair", () => {
  test("premise: the Lair's restriction is live — neither unit there has a Standard Move to base, while the Scout at bf2 does", async () => {
    const game = await board().build();
    const toBase = game.p1.legal().find((o) => o.key === "standardMove:to:base");
    const movable = (toBase?.fields.find((f) => f.name === "unitIds")?.options ?? []).flat();
    expect(movable).toContain("scout");
    expect(movable).not.toContain("spider");
    expect(movable).not.toContain("hatch");
  });

  test("Emperor's Divide naming both Lair units is castable and RESOLVES (goes to trash, [2] spent) — but the move is ignored: Spider and Hatchling stay at the Lair, nothing counted as moved", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "divide")).toBe(true);
    await game.p1.cast("divide", { targets: ["spider", "hatch"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "divide", controller: P1, targets: ["spider", "hatch"] })]);
    expect(game.p1.energy()).toBe(1);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("divide")).toBe("trash"); // it resolved (matters for "when a spell resolves" effects)
    expect(game.locationOf("spider")).toBe("lair");
    expect(game.locationOf("hatch")).toBe("lair");
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.gameState.battlefields.lair?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control — the same spell at an ordinary battlefield works: the Scout is moved from bf2 to base", async () => {
    const game = await board().build();
    await game.p1.cast("divide", { targets: ["scout"] });
    await game.settle();
    expect(game.zoneOf("divide")).toBe("trash");
    expect(game.locationOf("scout")).toBe("base");
  });

  test("contrast — a RECALL effect is not a move: 'Recall a friendly unit' takes the Spider from the Lair to base", async () => {
    const game = await board().build();
    await game.p1.cast("fallback", { targets: "spider" });
    await game.settle();
    expect(game.zoneOf("fallback")).toBe("trash");
    expect(game.locationOf("spider")).toBe("base");
    expect(game.locationOf("hatch")).toBe("lair");
  });
});
