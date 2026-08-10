/**
 * Ruling d4e58ab9c7cde0c8 — Alpha Strike (UNL-192 → unl-192-219) · Action · [3][R]
 *   "Choose a friendly unit. It deals damage equal to its Might split among enemy units at battlefields. Then for each
 *    unit this kills, do this: Gain 1 XP."
 *   × Stupefy (OGN-095 → ogn-095-298) · Reaction · [1] — "Give a unit -1 [Might] this turn, to a minimum of 1. Draw 1."
 *   × En Garde (OGN-046 → ogn-046-298) · Reaction · [1] — "Give a friendly unit +1 [Might] this turn, then an additional +1
 *     [Might] this turn if it is the only unit you control there."
 *
 * Q: Alpha Strike with my 3-Might unit at three enemy 1-Might Recruits; opponent Stupefies my unit (→ 2) and En Gardes one
 *    Recruit (→ 2). After everything resolves, may I kill only the 2-Might Recruit (both damage on it)?
 * A: No. Under 355.14.h you remove only ENOUGH targets for #targets to match the damage (drop exactly one); each remaining
 *    target takes at least 1, so the 2-Might Recruit can't take 2. With only En Garde (no Stupefy) it's 3 damage over 3
 *    targets — 1 each — so the 2-Might Recruit can't be killed either.
 * Rules: 355.14.h / 355.14.h.1 (cease targeting only as much as needed), 355.14.e (split: ≥1 per target).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, Policy } from "../../../harness";
import { P1, P2, passivePolicy, scenario } from "../../../harness";

const ALPHA_STRIKE = "unl-192-219";
const STUPEFY = "ogn-095-298";
const EN_GARDE = "ogn-046-298";

type Pick = Extract<Decision, { kind: "pick" }>;

/** Passive settle policy that records every distribute prompt it meets (and how much Recruit C could be assigned). */
function recordingPolicy(seen: { distribute: number; r3Max: number[] }): Policy {
  return (d, game) => {
    if (d.kind === "distribute") {
      seen.distribute += 1;
      seen.r3Max.push(d.buckets.find((b) => (b.card ?? b.key) === "r3")?.max ?? 0);
    }
    return passivePolicy(d, game);
  };
}

/**
 * P1's turn: Striker (3) in base, Alpha Strike + exactly [3][R]. P2 holds bf1 with three 1-Might Recruits (R3 is not
 * alone there, so En Garde gives it just +1); P2: Stupefy + En Garde with [2].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Striker" }, "striker")
    .unit(P2, "bf1", { might: 1, name: "Recruit A" }, "r1")
    .unit(P2, "bf1", { might: 1, name: "Recruit B" }, "r2")
    .unit(P2, "bf1", { might: 1, name: "Recruit C" }, "r3")
    .hand(P1, ALPHA_STRIKE, "alpha")
    .hand(P2, STUPEFY, "stupefy")
    .hand(P2, EN_GARDE, "engarde");
}

/** Alpha Strike (Striker → R1, R2, R3); P2 answers with the given reactions; they resolve; stop just before Alpha Strike does. */
async function alphaThenReactions(reactions: { stupefy: boolean; engarde: boolean }): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("alpha", { targets: ["striker", "r1", "r2", "r3"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.p1.passPriority();
  if (reactions.stupefy) {
    await game.p2.cast("stupefy", { targets: "striker" });
  }
  if (reactions.engarde) {
    await game.p2.cast("engarde", { targets: "r3" });
  }
  while (game.chain().length > 1) {
    await game.acting().passPriority();
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["alpha"]);
  return game;
}

describe("Ruling d4e58ab9c7cde0c8 — Alpha Strike after Stupefy + En Garde: drop exactly one target; the 2-Might Recruit can't be singled out", () => {
  test("Stupefy + En Garde resolve first: Striker is 2 Might, Recruit C is 2 Might; Alpha Strike then makes P1 drop EXACTLY ONE of its three chosen targets (mandatory, one at a time)", async () => {
    const game = await alphaThenReactions({ engarde: true, stupefy: true });
    expect(game.state("striker").might).toBe(2);
    expect(game.state("r3").might).toBe(2);
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1, semantics: "drop-target" });
    expect((d as Pick).options.map((o) => o.card ?? o.key).toSorted()).toEqual(["r1", "r2", "r3"]);
    // Trying to drop two (to leave only Recruit C and put both damage on it) is refused.
    const both = await game.p1.try((p) => p.pick("r1", "r2"));
    expect(both.ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "pick", semantics: "drop-target" });
  });

  test("after the single drop the two remaining targets take 1 each — keeping Recruit C as a target only puts 1 on it (survives at 2 Might); no way to deal it 2", async () => {
    const game = await alphaThenReactions({ engarde: true, stupefy: true });
    await game.settle();
    await game.p1.pick("r1"); // drop Recruit A; targets left: B and C, damage 2
    const seen = { distribute: 0, r3Max: [] as number[] };
    const done = await game.settle({ policy: recordingPolicy(seen) }); // 2 over 2 targets with ≥1 each is forced: 1 + 1
    expect(done.reason).toBe("open");
    expect(seen.r3Max.every((m) => m <= 1)).toBe(true); // if an allocation was shown at all, C could never take 2
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.state("r1")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("r2")).toBe("trash");
    expect(game.state("r3")).toMatchObject({ damage: 1, might: 2, zone: "battlefield-bf1" });
    expect(game.p1.xp()).toBe(1); // one kill
  });

  test("En Garde only (no Stupefy): 3 damage over the 3 chosen targets is exactly 1 each — no drop prompt, nothing to distribute; A and B die, the 2-Might Recruit C survives with 1", async () => {
    const game = await alphaThenReactions({ engarde: true, stupefy: false });
    expect(game.state("striker").might).toBe(3);
    expect(game.state("r3").might).toBe(2);
    const seen = { distribute: 0, r3Max: [] as number[] };
    const done = await game.settle({ policy: recordingPolicy(seen) });
    expect(done.reason).toBe("open"); // never stopped for a drop
    expect(seen.r3Max.every((m) => m <= 1)).toBe(true); // and no allocation could put 2 on C
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.zoneOf("r2")).toBe("trash");
    expect(game.state("r3")).toMatchObject({ damage: 1, might: 2, zone: "battlefield-bf1" });
    expect(game.p1.xp()).toBe(2);
  });
});
