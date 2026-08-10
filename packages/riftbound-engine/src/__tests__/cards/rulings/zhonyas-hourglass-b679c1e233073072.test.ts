/**
 * Ruling b679c1e233073072 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment · +1 "If I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me."
 *   (Soraka, Wanderer sfd-173-221 is cited as another orderable replacement; GA covers that nuance here.)
 *
 * Q: I have TWO Zhonya's Hourglasses and ONE of my units dies — must both be used?
 * A: No — only one Hourglass applies to a single death. If two units die at the same time, each Hourglass saves one.
 *    With other death replacements around (Guardian Angel, Soraka) you order the replacement effects, so you can let the
 *    other one apply and keep your Hourglass.
 * Rules: 372 (controller orders multiple applicable replacement effects), 373 (a one-shot replacement applies to one
 *        event; once the death is replaced there is nothing left for the second to replace).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const GUARDIAN_ANGEL = "sfd-051-221";
const FLURRY_OF_BLADES = "ogn-133-298"; // [1] Reaction: deal 1 to all units at battlefields
/** Inline [Action] removal: deal 3 to a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

type Pick = Extract<Decision, { kind: "pick" }>;

/** Settle, answering P1's replacement prompts with `choose`; returns the prompts P1 saw (semantics + option cards). */
async function resolveWith(game: Game, choose: (d: Pick) => string): Promise<{ semantics?: string; options: string[] }[]> {
  const seen: { semantics?: string; options: string[] }[] = [];
  for (let i = 0; i < 10; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      break;
    }
    const d = game.decision();
    if (d?.kind !== "pick") {
      break;
    }
    expect(d.seat).toBe(P1); // rule 372 — the dying unit's controller orders / assigns
    seen.push({ options: d.options.map((o) => o.card ?? o.key), semantics: d.semantics });
    await game.p1.pick(choose(d));
  }
  return seen;
}

describe("Ruling b679c1e233073072 — one death consumes one Zhonya's; two simultaneous deaths use both; other replacements can be ordered first", () => {
  test("ONE unit dies with two Hourglasses out: the Pawn is saved (healed, exhausted, recalled) and exactly ONE Zhonya's went to the trash — the other is still in play", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Pawn" }, "pawn")
      .gear(P1, ZHONYAS, "zh1")
      .gear(P1, ZHONYAS, "zh2")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "pawn" });
    const prompts = await resolveWith(game, (d) => d.options[0]!.key);
    // If asked at all, it is only WHICH Hourglass goes first — never a demand to use both.
    expect(prompts.every((p) => p.semantics === "replacement-order")).toBe(true);
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.state("pawn")).toMatchObject({ damage: 0, isExhausted: true, might: 2 });
    const trashed = game.p1.trash().filter((c) => c === "zh1" || c === "zh2");
    expect(trashed).toHaveLength(1);
    expect(game.p1.gear()).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });

  test("TWO units die at the same time (Flurry of Blades on two 1-Might Pawns): each Hourglass saves one — both Pawns recalled exhausted, both Zhonya's in the trash", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Pawn A" }, "pa")
      .unit(P1, "bf1", { might: 1, name: "Pawn B" }, "pb")
      .gear(P1, ZHONYAS, "zh1")
      .gear(P1, ZHONYAS, "zh2")
      .hand(P2, FLURRY_OF_BLADES, "flurry")
      .build();
    await game.p2.cast("flurry");
    await resolveWith(game, (d) => d.options[0]!.key);
    for (const p of ["pa", "pb"]) {
      expect(game.zoneOf(p)).toBe("base");
      expect(game.state(p)).toMatchObject({ damage: 0, isExhausted: true });
    }
    expect(game.p1.trash().sort()).toEqual(["zh1", "zh2"]);
    expect(game.p1.gear()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("with Guardian Angel on the Pawn AND a Zhonya's out, P1 is asked to ORDER the replacements; putting GA first saves the Pawn with GA and the Hourglass is NOT used", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Pawn" }, "pawn", { equippedWith: ["ga"] })
      .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "pawn" }, owner: P1, zone: "bf1" })
      .gear(P1, ZHONYAS, "zh1")
      .hand(P2, BOLT, "bolt")
      .build();
    expect(game.state("pawn").might).toBe(2);
    await game.p2.cast("bolt", { targets: "pawn" });
    const prompts = await resolveWith(game, (d) => d.options.find((o) => (o.card ?? o.key) === "ga")!.key);
    expect(prompts[0]).toEqual({ options: expect.arrayContaining(["ga", "zh1"]), semantics: "replacement-order" });
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.state("pawn")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("zh1")).toBe("base"); // kept
    expect(game.p1.gear()).toEqual(["zh1"]);
  });

  test("…and ordering the Hourglass first instead spends the Zhonya's and keeps Guardian Angel", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Pawn" }, "pawn", { equippedWith: ["ga"] })
      .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "pawn" }, owner: P1, zone: "bf1" })
      .gear(P1, ZHONYAS, "zh1")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "pawn" });
    await resolveWith(game, (d) => d.options.find((o) => (o.card ?? o.key) === "zh1")!.key);
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.zoneOf("zh1")).toBe("trash");
    expect(game.zoneOf("ga")).not.toBe("trash");
  });
});
