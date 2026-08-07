/**
 * Interaction: Alpha Strike (unl-192-219) · Spell · Calm/Body · 3 + [rainbow] · Action
 *     "Choose a friendly unit. It deals damage equal to its Might split among enemy units at
 *      battlefields. Then for each unit this kills, do this: Gain 1 XP."
 *   × Frigid Touch (sfd-066-221) · Spell · Mind · 2 · Reaction · "Give a unit -2 [Might] this turn."
 *   × Feral Strength (sfd-034-221) · Spell · Calm · 2 · Reaction · "Give a unit +2 [Might] this turn."
 *
 * Question: P1 plays Alpha Strike choosing their 4-Might friendly unit and four 1-Might enemy units at
 * battlefields as split targets.
 *   (a) P2 responds with Frigid Touch on the friendly unit (2 Might at resolution): how many targets
 *       take damage, who picks which are dropped, may P1 drop three to put 2 on one unit, how much XP?
 *   (b) P2 instead responds with Feral Strength on ONE enemy target (now 3 Might): may P1 drop it to
 *       concentrate 2 elsewhere, how much XP?
 *   (c) No response.
 *
 * Rules:
 *   355.14.b / 355.14.c  split targets are chosen at finalization, up to the damage then available (4).
 *   355.14.e / 359.3.f.2 the pool ("its Might") and its division are determined at RESOLUTION.
 *   355.14.f / 355.14.g  every remaining target must receive ≥ 1.
 *   355.14.h / 355.14.h.1 more targets than damage → the controller of the damage (P1) chooses which
 *                        cease being targets, and may not drop more than needed (printed example is
 *                        exactly this Alpha Strike / Feral Strength / Frigid Touch situation).
 *   355.14.i             costs/triggers from the dropped targets having been chosen are not undone.
 *
 * Expected:
 *   (a) Frigid Touch resolves first (LIFO) → pool = 2 with 4 targets → P1 must drop exactly 2 (no
 *       more, no fewer), 1 damage to each of the other two → both die → 2 XP.
 *   (b) Feral Strength resolves first → pool still 4 with 4 targets → nothing may be dropped, exactly 1
 *       each: three 1-Might units die, the 3-Might one survives with 1 damage → 3 XP.
 *   (c) 1 to each of four → four kills → 4 XP.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALPHA_STRIKE = "unl-192-219";
const FRIGID_TOUCH = "sfd-066-221";
const FERAL_STRENGTH = "sfd-034-221";

const ENEMIES = ["e1", "e2", "e3", "e4"] as const;

/**
 * P1's turn with exactly Alpha Strike's cost; P1's 4-Might "Alpha" in base. P2 has two 1-Might units
 * at each of bf1/bf2, one 1-Might unit at home (not "at a battlefield"), 2 energy and both reactions.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Alpha" }, "ally")
    .unit(P2, "bf1", { might: 1, name: "Recruit One" }, "e1")
    .unit(P2, "bf1", { might: 1, name: "Recruit Two" }, "e2")
    .unit(P2, "bf2", { might: 1, name: "Recruit Three" }, "e3")
    .unit(P2, "bf2", { might: 1, name: "Recruit Four" }, "e4")
    .unit(P2, "base", { might: 1, name: "Home Guard" }, "home")
    .hand(P1, ALPHA_STRIKE, "alpha")
    .hand(P2, FRIGID_TOUCH, "frigid")
    .hand(P2, FERAL_STRENGTH, "feral");
}

/** P1 casts Alpha Strike (Alpha + all four battlefield enemies), passes; P2 optionally reacts; chain resolves. */
async function alphaStrike(react?: { spell: "frigid" | "feral"; target: string }): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("alpha", { targets: ["ally", ...ENEMIES] });
  expect(game.chain().map((i) => i.cardId)).toEqual(["alpha"]);
  await game.p1.passPriority();
  if (react) {
    await game.p2.cast(react.spell, { targets: react.target });
    expect(game.chain().map((i) => i.cardId)).toEqual(["alpha", react.spell]);
  }
  await game.settle(); // stops at P1's drop-target prompt, if any
  return game;
}

function isDropPrompt(d: Decision | null): d is Extract<Decision, { kind: "pick" }> {
  return !!d && d.kind === "pick" && d.seat === P1 && d.semantics === "drop-target";
}

/** Answer P1's successive drop prompts with `drops` (in order); returns how many drop prompts were shown. */
async function dropTargets(game: Game, drops: readonly string[]): Promise<number> {
  let shown = 0;
  const queue = [...drops];
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (!isDropPrompt(d)) {
      break;
    }
    shown += 1;
    const next = queue.shift() ?? (d.options[0]?.key as string);
    await game.p1.pick(next);
    await game.settle();
  }
  return shown;
}

describe("Alpha Strike × Frigid Touch / Feral Strength — split damage, dropped targets and XP", () => {
  test("finalization: Alpha Strike offers up to 4 enemy split targets (Alpha's Might) — only units AT BATTLEFIELDS, never the one in P2's base (355.14.b, 355.14.c)", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "alpha")?.fields.find((f) => f.name === "targets");
    const tuples = (field?.options ?? []) as string[][];
    expect(tuples).toContainEqual(["ally", ...ENEMIES]);
    expect(tuples.every((t) => t[0] === "ally" && t.length <= 5)).toBe(true);
    expect(tuples.flat()).not.toContain("home");
    await game.p1.cast("alpha", { targets: ["ally", ...ENEMIES] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("alpha")).toBe("chain");
  });

  test("P2 may answer Alpha Strike on the chain with either Reaction, targeting P1's Alpha or one of the split targets", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["ally", ...ENEMIES] });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "frigid")).toBe(true);
    expect(game.p2.can("cast", "feral")).toBe(true);
    const frigidTargets = (game.p2.option("cast", "frigid")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(frigidTargets).toEqual(expect.arrayContaining(["ally", "e1"]));
  });

  // ---- (a) Frigid Touch on the friendly reference unit ------------------------------------------

  test("(a) Frigid Touch resolves first: Alpha is 2 Might when Alpha Strike resolves, so P1 — the controller of the damage — is asked which targets to drop (355.14.e, 355.14.h)", async () => {
    const game = await alphaStrike({ spell: "frigid", target: "ally" });
    expect(game.zoneOf("frigid")).toBe("trash");
    expect(game.p2.energy()).toBe(0);
    expect(game.state("ally").might).toBe(2);
    const d = game.decision();
    expect(isDropPrompt(d)).toBe(true);
    expect(d?.seat).toBe(P1);
    const keys = isDropPrompt(d) ? d.options.map((o) => o.key).sort() : [];
    expect(keys).toEqual([...ENEMIES]);
    // Nothing has been dealt yet — the division waits for the drops.
    for (const e of ENEMIES) {
      expect(game.state(e).damage).toBe(0);
    }
  });

  test("(a) the drop is mandatory: P1 cannot decline and keep four targets for 2 damage (355.14.f, 355.14.h)", async () => {
    const game = await alphaStrike({ spell: "frigid", target: "ally" });
    const d = game.decision();
    expect(isDropPrompt(d)).toBe(true);
    expect(isDropPrompt(d) && d.allowDecline).toBe(false);
    expect(isDropPrompt(d) && d.min).toBe(1);
    const r = await game.p1.try((p) => p.decline());
    expect(r.ok).toBe(false);
    expect(isDropPrompt(game.decision())).toBe(true);
  });

  test("(a) P1 drops exactly two (e3, e4) — no third drop is offered, so P1 cannot shed three to stack 2 on one unit (355.14.h.1); the other two take 1 each", async () => {
    const game = await alphaStrike({ spell: "frigid", target: "ally" });
    const shown = await dropTargets(game, ["e3", "e4", "e1"]); // a 3rd answer is queued but must never be asked for
    expect(shown).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("e3")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.state("e4")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.zoneOf("e2")).toBe("trash");
    expect(game.zoneOf("alpha")).toBe("trash");
  });

  test("(a) total damage dealt is the resolution-time pool (2), not the 4 available at finalization (355.14.e, 359.3.f.2)", async () => {
    const game = await alphaStrike({ spell: "frigid", target: "ally" });
    await dropTargets(game, ["e3", "e4"]);
    const dead = ENEMIES.filter((e) => game.zoneOf(e) === "trash");
    const marked = ENEMIES.filter((e) => game.zoneOf(e) !== "trash").reduce((n, e) => n + game.state(e).damage, 0);
    expect(dead.length + marked).toBe(2);
    expect(game.state("home")).toMatchObject({ damage: 0, zone: "base" });
  });

  // Expected: the two remaining targets are 1-Might units taking 1 each → both killed by Alpha Strike →
  // "for each unit this kills: Gain 1 XP" → P1 gains 2 XP. Actual: after the drop-target path the
  // reflexive XP clause finds nothing (it scans for still-damaged units, and the kills have left the
  // board) → 0 XP.
  test("(a) Alpha Strike kills the two remaining targets → P1 gains exactly 2 XP", async () => {
    const game = await alphaStrike({ spell: "frigid", target: "ally" });
    await dropTargets(game, ["e3", "e4"]);
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.zoneOf("e2")).toBe("trash");
    expect(game.p1.xp()).toBe(2);
    expect(game.p2.xp()).toBe(0);
  });

  // ---- (b) Feral Strength on one enemy target ---------------------------------------------------

  test("(b) Feral Strength resolves first (e1 → 3 Might); pool is still 4 for 4 targets, so P1 gets NO drop prompt and cannot concentrate — exactly 1 lands on each (355.14.f, 355.14.h)", async () => {
    const game = await alphaStrike({ spell: "feral", target: "e1" });
    expect(game.zoneOf("feral")).toBe("trash");
    expect(isDropPrompt(game.decision())).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("e1")).toMatchObject({ damage: 1, might: 3, zone: "battlefield-bf1" });
    expect(game.zoneOf("e2")).toBe("trash");
    expect(game.zoneOf("e3")).toBe("trash");
    expect(game.zoneOf("e4")).toBe("trash");
    expect(game.zoneOf("alpha")).toBe("trash");
  });

  // Expected: three kills → 3 XP (the buffed e1 survives and does not count). Actual: 4 XP — the XP
  // clause counts every damaged/struck enemy rather than the units Alpha Strike actually killed.
  test("(b) three 1-Might targets die and the 3-Might one survives → P1 gains exactly 3 XP ('for each unit this kills')", async () => {
    const game = await alphaStrike({ spell: "feral", target: "e1" });
    expect(game.zoneOf("e1")).toBe("battlefield-bf1");
    expect(ENEMIES.filter((e) => game.zoneOf(e) === "trash")).toHaveLength(3);
    expect(game.p1.xp()).toBe(3);
  });

  // ---- (c) baseline: no response ------------------------------------------------------------------

  test("(c) no response: 4 damage over 4 targets → no drop prompt, 1 to each, all four die, Alpha Strike to trash", async () => {
    const game = await alphaStrike();
    expect(isDropPrompt(game.decision())).toBe(false);
    for (const e of ENEMIES) {
      expect(game.zoneOf(e)).toBe("trash");
    }
    expect(game.state("home").zone).toBe("base");
    expect(game.state("ally")).toMatchObject({ damage: 0, might: 4, zone: "base" }); // "It deals" — Alpha takes nothing
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  test("(c) four kills → P1 gains 4 XP; P2 gains none", async () => {
    const game = await alphaStrike();
    expect(game.p1.xp()).toBe(4);
    expect(game.p2.xp()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
