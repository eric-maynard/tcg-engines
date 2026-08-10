/**
 * Ruling ed0cecd13dcc3a23 — Arcane Shift (SFD-200 → sfd-200-221) · [Action] · Mind/Chaos · 3+[rainbow]
 *     "Banish a friendly unit, then its owner plays it, ignoring its cost. Deal 3 to an enemy unit at a battlefield.
 *      Banish this."
 *   (+ an inline [Reaction] "Kill a unit" standing in for Hidden Blade in the "target dies in response" nuance.)
 *
 * Q: Does Arcane Shift need a valid enemy unit at a battlefield to be played, or can it be cast just to blink a friendly
 *    unit when no enemy is at a battlefield?
 * A: It needs BOTH targets (a friendly unit AND an enemy unit at a battlefield) to be played at all — no partial casting.
 *    But once on the chain there is no fizzle: if the enemy target becomes invalid (killed in response) you still do as
 *    much as you can — blink the friendly unit, deal no damage.
 * Rules: 355.5 / 355.8 (every required target must be choosable to play), 359.3.e (illegal target ⇒ that instruction
 *        is skipped, the rest resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARCANE_SHIFT = "sfd-200-221";
const COST = { energy: 3, power: { rainbow: 1 } };
/** Inline [Reaction] "Kill a unit." — the removal played in response (the ruling names Hidden Blade). */
const SNUFF = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  name: "Snuff (inline reaction kill)",
  timing: "reaction",
} as const;

/** P1's turn with exactly 3+[rainbow]; P1's exhausted Apprentice (2) in base and bf2 held by P1's Sentry. P2's Homebody sits in BASE only. */
function noEnemyAtBattlefield() {
  return scenario()
    .resources(P1, COST)
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 2, name: "Apprentice" }, "mine", { damage: 1, exhausted: true })
    .unit(P2, "base", { might: 3, name: "Homebody" }, "home")
    .hand(P1, ARCANE_SHIFT, "shift");
}

/** Same, plus P2's 5-Might Grunt at bf1 (a legal enemy target) and P2 holding Snuff + [1]. */
function withEnemyAtBattlefield() {
  return noEnemyAtBattlefield().unit(P2, "bf1", { might: 5, name: "Grunt" }, "grunt").resources(P2, { energy: 1 }).hand(P2, SNUFF, "snuff");
}

function targetPairs(game: Game): string[][] {
  return ((game.p1.option("cast", "shift")?.fields.find((f) => f.arg === "targets")?.options ?? []) as unknown[]).map((v) =>
    Array.isArray(v) ? (v as string[]) : [v as string],
  );
}

/** Answer the replay's destination (base) when the owner is asked; reports whether the Apprentice was seen in banishment (= really blinked). */
async function settleTakingBase(game: Game): Promise<{ sawBanished: boolean }> {
  let sawBanished = false;
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      break;
    }
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      sawBanished ||= game.zoneOf("mine") === "banishment"; // its owner is choosing where to replay it from banishment
      await game.p1.pick(d.options.find((o) => o.key === "base") ? "base" : (d.options[0]?.key as string));
    } else if (d?.kind === "yes-no") {
      await game.seat(d.seat).no();
    } else {
      break;
    }
  }
  return { sawBanished };
}

describe("Ruling ed0cecd13dcc3a23 — Arcane Shift needs both a friendly unit and an enemy unit at a battlefield to be cast", () => {
  test("no enemy unit at any battlefield (their only unit is in base): Arcane Shift is NOT castable even though the friendly half is available — forcing it fails, nothing spent, nobody blinked", async () => {
    const game = await noEnemyAtBattlefield().build();
    expect(game.p1.units()).toEqual(expect.arrayContaining(["mine", "sentry"]));
    expect(game.p1.can("cast", "shift")).toBe(false);
    expect(targetPairs(game)).toEqual([]);
    const r = await game.p1.try((p) => p.cast("shift", { targets: ["mine", "home"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("shift")).toBe("hand");
    expect(game.p1.resources()).toEqual(COST);
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.state("mine").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("with an enemy Grunt at bf1 it IS castable as the pair [friendly, enemy-at-a-battlefield]; it resolves in full: Apprentice banished and replayed (a fresh object), Grunt takes 3, the spell banishes itself", async () => {
    const game = await withEnemyAtBattlefield().build();
    expect(game.p1.can("cast", "shift")).toBe(true);
    const pairs = targetPairs(game);
    expect(pairs).toContainEqual(["mine", "grunt"]);
    expect(pairs.some((p) => p.includes("home"))).toBe(false); // base units are never the enemy half
    await game.p1.cast("shift", { targets: ["mine", "grunt"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    const played = game.gameState.cardsPlayedThisTurn?.[P1] ?? 0;
    const r = await settleTakingBase(game);
    expect(r.sawBanished).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.state("grunt")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.state("mine").damage).toBe(0); // a new object: the old damage is gone
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(played + 1); // it was PLAYED again
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });

  test("nuance — no fizzle: P2 kills the Grunt in response; Arcane Shift still resolves and does what it can — the Apprentice is blinked (banished + replayed), no damage is dealt to anyone, the spell still banishes itself", async () => {
    const game = await withEnemyAtBattlefield().build();
    await game.p1.cast("shift", { targets: ["mine", "grunt"] });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "snuff")).toBe(true);
    await game.p2.cast("snuff", { targets: "grunt" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["shift", "snuff"]);
    const r = await settleTakingBase(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("grunt")).toBe("trash"); // killed in response
    expect(r.sawBanished).toBe(true); // still blinked …
    expect(game.zoneOf("mine")).toBe("base"); // … and replayed
    expect(game.state("mine")).toMatchObject({ damage: 0 });
    expect(game.state("home").damage).toBe(0); // damage not redirected anywhere
    expect(game.state("sentry").damage).toBe(0);
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });
});
