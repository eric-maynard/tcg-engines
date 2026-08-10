/**
 * Ruling 05cf884f438b66ad — Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield · "Units can't move from here to base."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · "If a friendly unit would die, kill this instead. Heal
 *     that unit, exhaust it, and recall it."   (Vilemaw unl-060-219 is listed but plays no part in the answer.)
 *   Movement effects exercised: Flash (ogs-011-024, "Move up to 2 friendly units to base"), Ride the Wind
 *   (ogn-173-298, "Move a friendly unit and ready it"), a Ganking unit.
 *
 * Q: What happens if I use a movement spell/ability on units at Vilemaw's Lair?
 * A: Depends on the destination. To BASE: the move fails ("can't" beats "do"); the impossible instruction is
 *    ignored but the spell's other instructions (e.g. "ready it") still happen. To ANOTHER BATTLEFIELD: legal
 *    and successful. Recalls (Zhonya's, post-combat attacker recall) are not moves and bypass the Lair entirely.
 * Rules: 359.3.e.6 (impossible instruction ignored, rest resolves), 446 (move) vs recall (not a move), 105 (can't > can).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VILEMAWS_LAIR = "ogn-295-298";
const ZHONYAS = "ogn-077-298";
const FLASH = "ogs-011-024";
const RIDE_THE_WIND = "ogn-173-298";

/** Inline 1-cost action spell: deal 3 to a unit. */
const BOLT = { abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Test Bolt", timing: "action" };
/** Inline 3-Might unit with Ganking (may move battlefield → battlefield). */
const GANKER = { abilities: [{ keyword: "Ganking", type: "keyword" }], keywords: ["Ganking"], might: 3, name: "Ganker" };

/** P1's turn. "lair" = Vilemaw's Lair (live text) held by P1 with an EXHAUSTED 3-Might Spider on it; bf2 is P2's, empty. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "lair", { might: 3, name: "Spider" }, "spider", { exhausted: true })
    .hand(P1, FLASH, "flash")
    .hand(P1, RIDE_THE_WIND, "ride");
}

describe("Ruling 05cf884f438b66ad — movement effects on units at Vilemaw's Lair depend on the destination", () => {
  // ── 1. Moving to base fails ────────────────────────────────────────────────────────────────

  test("premise: the Lair's restriction is live — the Spider has no standard move to base on offer", async () => {
    const game = await board().build();
    const toBase = game.p1.legal().find((o) => o.key === "standardMove:to:base");
    const movable = (toBase?.fields.find((f) => f.name === "unitIds")?.options ?? []).flat();
    expect(movable).not.toContain("spider");
    const r = await game.p1.try((p) => p.move("spider", "base"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("spider")).toBe("lair");
  });

  test("a spell that moves it TO BASE (Flash) can still be played on it, but the move is ignored — Spider stays at the Lair (359.3.e.6)", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "flash")).toBe(true);
    await game.p1.cast("flash", { targets: ["spider"] });
    expect(game.p1.energy()).toBe(2);
    await game.settle();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("spider")).toBe("lair");
    expect(game.violations()).toEqual([]);
  });

  test("Ride the Wind choosing BASE: the move is ignored but the other instruction still executes — Spider stays at the Lair AND is readied", async () => {
    const game = await board().build();
    expect(game.state("spider").isExhausted).toBe(true);
    await game.p1.cast("ride", { answers: ["base"], targets: "spider" });
    await game.settle();
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.locationOf("spider")).toBe("lair");
    expect(game.state("spider").isReady).toBe(true);
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
  });

  // ── 2. Moving to another battlefield works ────────────────────────────────────────────────

  test("Ride the Wind choosing ANOTHER BATTLEFIELD succeeds — Spider relocates Lair → bf2, readied (and goes on to conquer the empty bf2)", async () => {
    const game = await board().build();
    await game.p1.cast("ride", { answers: ["bf2"], targets: "spider" });
    await game.settle();
    await game.settle();
    expect(game.locationOf("spider")).toBe("bf2");
    expect(game.state("spider").isReady).toBe(true);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("a Ganking unit's battlefield-to-battlefield move out of the Lair is legal too", async () => {
    const game = await scenario()
      .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "lair", GANKER, "ganker")
      .build();
    expect(game.state("ganker").keywords).toContain("NoMoveToBase"); // the Lair's restriction is on it…
    expect(game.p1.can("gank", "ganker")).toBe(true); // …yet ganking away is fine
    await game.p1.gank("ganker", "bf2");
    expect(game.locationOf("ganker")).toBe("bf2");
  });

  // ── 3. Recalls are not moves ──────────────────────────────────────────────────────────────

  test("Zhonya's Hourglass saving a unit at the Lair RECALLS it to base — not a move, so the Lair does not stop it", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
      .unit(P1, "lair", { might: 3, name: "Spider" }, "spider")
      .gear(P1, ZHONYAS, "zhonyas")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "spider" });
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash"); // killed instead
    expect(game.zoneOf("spider")).toBe("base"); // recalled out of the Lair
    expect(game.state("spider")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("a surviving attacker that fails to take the Lair is RECALLED to base after combat — again not a move, so it leaves the Lair", async () => {
    const game = await scenario()
      .battlefield("lair", { controller: P2, def: VILEMAWS_LAIR, inert: false })
      .unit(P2, "lair", { might: 5, name: "Wall" }, "wall", { stunned: true }) // stunned: deals no combat damage
      .unit(P1, "base", { might: 2, name: "Poker" }, "poker")
      .build();
    await game.p1.move("poker", "lair");
    expect(game.state("poker").keywords).toContain("NoMoveToBase"); // while at the Lair the restriction applies to it
    await game.settle();
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-lair"); // 2 damage on a 5-Might defender: survives
    expect(game.gameState.battlefields.lair?.controller).toBe(P2);
    expect(game.zoneOf("poker")).toBe("base"); // recalled despite "can't move from here to base"
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
