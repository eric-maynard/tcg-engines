/**
 * Ruling ec00bb941e516a13 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: With multiple Zhonya's in play and one (or several) units dying, do all Zhonya's get destroyed? If several units die
 *    simultaneously, can different Zhonya's save different units?
 * A: One death consumes ONE Zhonya's: you order your replacement effects, the first replaces the death, and since nothing
 *    then dies the second never applies. If several units die at once with several Zhonya's, you may order/assign them so
 *    that different Zhonya's save different units.
 * Rules: 370–373 (replacement effects; 372 controller orders multiple applicable replacements; 373 controller assigns a
 *        single-use replacement among simultaneous events).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P2's removal (inline): 3 to one unit / 3 to every enemy unit at a battlefield (cast at bf1). */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;
const SWEEP = {
  abilities: [
    {
      effect: { amount: 3, target: { controller: "enemy", location: "battlefield", quantity: "all", type: "unit" }, type: "damage" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Sweep",
  timing: "action",
} as const;

/** P2's turn with [1]. P1 holds bf1 with Pawn (2) + Rook (2) and has TWO face-up Zhonya's (zh1, zh2) in base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Pawn" }, "pawn")
    .unit(P1, "bf1", { might: 2, name: "Rook" }, "rook")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .gear(P1, ZHONYAS, "zh1")
    .gear(P1, ZHONYAS, "zh2")
    .hand(P2, BOLT, "bolt")
    .hand(P2, SWEEP, "sweep");
}

/** P2 casts `spell` (Bolt at Pawn / Sweep), both pass → it resolves; returns at P1's first replacement prompt. */
async function resolve(spell: "bolt" | "sweep"): Promise<Game> {
  const game = await board().build();
  await game.p2.cast(spell, spell === "bolt" ? { targets: "pawn" } : { targets: "bf1" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  return game;
}

describe("Ruling ec00bb941e516a13 — several Zhonya's: one per death; simultaneous deaths can each get their own", () => {
  test("ONE unit (Pawn) would die with two Zhonya's out: P1 — their controller — is asked to ORDER the two replacement effects (RPL, replacement-order, both Hourglasses listed)", async () => {
    const game = await resolve("bolt");
    const d = game.decision() as PickD;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "replacement-order", timing: "RPL" });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["zh1", "zh2"]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.zoneOf("pawn")).toBe("battlefield-bf1"); // not dead while P1 decides
  });

  test("P1 puts zh2 first: zh2 is killed instead and saves the Pawn (healed, exhausted, recalled) — nothing died after that, so zh1 never applies and STAYS in play", async () => {
    const game = await resolve("bolt");
    await game.p1.pick("zh2");
    await game.settle();
    expect(game.zoneOf("zh2")).toBe("trash");
    expect(game.zoneOf("zh1")).toBe("base");
    expect(game.p1.gear()).toEqual(["zh1"]);
    expect(game.state("pawn")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("rook")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("TWO units (Pawn + Rook) die simultaneously to Sweep: after ordering, P1 is asked WHICH death the first Hourglass replaces (replacement-assign: Pawn | Rook) — assigning zh1 → Rook leaves zh2 to save Pawn: both units saved, both Hourglasses consumed", async () => {
    const game = await resolve("sweep");
    let assign: PickD | undefined;
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind !== "pick" || d.seat !== P1) {
        break;
      }
      if (d.semantics === "replacement-order") {
        await game.p1.pick("zh1");
      } else if (d.semantics === "replacement-assign") {
        assign = d;
        expect(d.source?.cardId).toBe("zh1");
        expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["pawn", "rook"]);
        await game.p1.pick("rook");
      } else {
        break;
      }
    }
    expect(assign).toBeDefined();
    await game.settle();
    expect(game.zoneOf("zh1")).toBe("trash");
    expect(game.zoneOf("zh2")).toBe("trash");
    expect(game.state("rook")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.state("pawn")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.p1.trash()).not.toContain("pawn");
    expect(game.p1.trash()).not.toContain("rook");
    expect(game.violations()).toEqual([]);
  });

  test("…the assignment is P1's free choice: zh1 → Pawn instead, and zh2 then saves Rook — same end state, different pairing", async () => {
    const game = await resolve("sweep");
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind !== "pick" || d.seat !== P1) {
        break;
      }
      if (d.semantics === "replacement-order") {
        await game.p1.pick(d.options[0]!.key);
      } else if (d.semantics === "replacement-assign") {
        await game.p1.pick("pawn");
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("zh1")).toBe("trash");
    expect(game.zoneOf("zh2")).toBe("trash");
    expect(game.state("pawn")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.state("rook")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
  });
});
