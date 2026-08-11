/**
 * Interaction: Icathian Rain (ogn-248-298) · Spell · Fury/Mind · [7]+[rainbow]×3 · "Deal 2 to a unit." ×6
 *   × Lee Sin, Centered (ogn-151-298) · Unit/Champion · Body · [6] · 6 Might
 *     "Other buffed friendly units at my battlefield have +2 [Might]."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · [2]
 *     "[Hidden] … If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Question. P1's turn. P2 at bf1: Lee Sin, Centered (6 Might) and a buffed vanilla Y (printed 3, +1 buff,
 * +2 from Lee Sin's aura = 6 Might). P2 has ONE face-up Zhonya's Hourglass in base. P1 casts Icathian Rain
 * with instances 1-4 on Lee Sin (8 total) and 5-6 on Y (4 total).
 *   (a) In the first Cleanup after the Rain leaves the chain, which units have lethal damage — is Y (4/6)
 *       among them?
 *   (b) Zhonya's is mandatory, so it replaces Lee Sin's death and recalls him to base. Y then loses the +2
 *       aura and is 4/4. Is Y killed in that SAME Cleanup or in a second, cascaded one — and is Zhonya's
 *       available to save Y there?
 *   (c) Contrast: no Zhonya's at all.
 *   (d) Contrast: instances split 3/3, so BOTH are lethal in the first Cleanup — is P2 prompted to choose
 *       which death the single Hourglass applies to?
 *
 * Expected.
 *   (a) No death check runs between the six instances (321, 321.1). At the end of resolution Lee Sin is 8/6
 *       and Y is 4/6. Cleanup C1 (319.5) step 3b: only Lee Sin has lethal damage (142.4.b); Y at 4/6 is safe
 *       and is NOT killed.
 *   (b) Lee Sin "would die" → Zhonya's is a mandatory would-die replacement applied to that event (369.1,
 *       370.1.a, 370.1.a.1): Zhonya's is killed instead, Lee Sin is healed, exhausted and recalled to base.
 *       Because Lee Sin has left bf1, Y loses the aura's +2 and now reads 4 Might with 4 damage marked =
 *       lethal. That state change qualifies for a Cleanup (319.6), so a NEW Cleanup C2 runs immediately
 *       after C1 completes — not nested inside it (322, 322.1, 320). In C2 Y would die, but Zhonya's is
 *       already in P2's trash and its passive no longer applies off the board (365.1), so nothing replaces
 *       the death: Y dies in C2. Final: Lee Sin alive in base at 0 damage exhausted; Y and Zhonya's in the
 *       trash; bf1 emptied (323.6). Y's kill is attributed to Icathian Rain (428.5.c), the spell that dealt
 *       the damage — even though the trigger for Y's death was an aura loss.
 *   (c) Without Zhonya's: Lee Sin (8/6) dies in C1, Y survives C1 at 4/6, then dies in C2 at 4/4 — the same
 *       cascade. Zhonya's presence changes WHO is in the trash, not the two-Cleanup shape.
 *   (d) With a 3/3 split (Lee Sin 6/6, Y 6/6) both deaths occur simultaneously in C1 from the same game
 *       action (370.1.a.2), so P2 — the controller of the single replacement — chooses which event to apply
 *       Zhonya's to first (373; it may be applied in only one sequence, 373.2 / 370.2). Saving Y heals /
 *       exhausts / recalls it BEFORE Lee Sin's unmodified death executes (373.1.a): Y ends safe at 0 damage
 *       in base with its buff intact, Lee Sin dies, and NO C2 death follows. Saving Lee Sin kills Y in C1
 *       and needs no cascade.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ICATHIAN_RAIN = "ogn-248-298";
const LEE_SIN_CENTERED = "ogn-151-298";
const ZHONYAS = "ogn-077-298";

/** P1's turn with exactly [7]+3 and the Rain; P2 owns bf1 with Lee Sin + buffed Y, and (optionally) Zhonya's. */
function board(opts: { zhonyas: boolean }) {
  const s = scenario()
    .resources(P1, { energy: 7, power: { rainbow: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", LEE_SIN_CENTERED, "lee")
    .unit(P2, "bf1", { might: 3, name: "Yordle" }, "y", { buffed: true })
    .unit(P2, "base", { might: 20, name: "Wall" }, "wall")
    .hand(P1, ICATHIAN_RAIN, "rain");
  return opts.zhonyas ? s.gear(P2, ZHONYAS, "zh") : s;
}

/** Cast the Rain with the given six instances and pass it through the chain. */
async function rain(game: Game, targets: readonly string[]): Promise<void> {
  await game.p1.cast("rain", { targets: [...targets] });
  await game.p1.passPriority();
  await game.p2.passPriority();
}

const FOUR_TWO = ["lee", "lee", "lee", "lee", "y", "y"]; // Lee Sin 8/6, Y 4/6
const THREE_THREE = ["lee", "lee", "lee", "y", "y", "y"]; // Lee Sin 6/6, Y 6/6

describe("Icathian Rain × Lee Sin, Centered × Zhonya's Hourglass — the aura-loss death lands one Cleanup late", () => {
  test("setup: Lee Sin's aura makes the buffed Y a 6-Might unit (3 printed + 1 buff + 2 aura) and Lee Sin himself is 6 Might", async () => {
    const game = await board({ zhonyas: true }).build();
    expect(game.state("lee")).toMatchObject({ damage: 0, location: "bf1", might: 6 });
    expect(game.state("y")).toMatchObject({ baseMight: 3, damage: 0, isBuffed: true, location: "bf1", might: 6 });
    expect(game.zoneOf("zh")).toBe("base");
  });

  // ── (a) one resolution, no death check between instances ──────────────────────────────────────

  test("(a) no Cleanup runs BETWEEN the six instances (321, 321.1): six instances all on Lee Sin put 12 on him and Zhonya's still saves him once — a death check at instance 3 would have let instances 4-6 finish him", async () => {
    const game = await board({ zhonyas: true }).build();
    await rain(game, ["lee", "lee", "lee", "lee", "lee", "lee"]);
    await game.settle();
    expect(game.state("lee")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.zoneOf("lee")).toBe("base");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(a) 4/2 split: only Lee Sin is lethal in C1 — the single would-die event is replaced with no choice to make, while the 3/3 split (both lethal) DOES raise P2's replacement-assign pick (142.4.b, 373)", async () => {
    const one = await board({ zhonyas: true }).build();
    await rain(one, FOUR_TWO);
    const settledOne = await one.settle();
    expect(settledOne.reason).toBe("open"); // Y at 4/6 is not among C1's deaths, so nothing is ordered
    expect(one.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });

    const both = await board({ zhonyas: true }).build();
    await rain(both, THREE_THREE);
    const settledBoth = await both.settle();
    expect(settledBoth.reason).toBe("unanswered");
    expect(both.decision()).toMatchObject({ kind: "pick", seat: P2 });
  });

  // ── (b) Zhonya's saves Lee Sin in C1; Y dies in the cascaded C2 ───────────────────────────────

  test("(b) Zhonya's replaces Lee Sin's C1 death: the gear is killed instead and Lee Sin is healed, exhausted and recalled to base (369.1, 370.1.a, 370.1.a.1)", async () => {
    const game = await board({ zhonyas: true }).build();
    await rain(game, FOUR_TWO);
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p2.trash()).toContain("zh");
    expect(game.state("lee")).toMatchObject({ controller: P2, damage: 0, isExhausted: true, zone: "base" });
  });

  test("(b) losing the aura kills Y in a SECOND, cascaded Cleanup (319.6, 322, 322.1) — 4 damage on a now-4-Might unit; Zhonya's, already in the trash, saves nothing there (365.1)", async () => {
    const game = await board({ zhonyas: true }).build();
    await rain(game, FOUR_TWO);
    await game.settle();
    expect(game.zoneOf("y")).toBe("trash");
    expect(game.p2.trash()).toEqual(expect.arrayContaining(["y", "zh"]));
    expect(game.p2.units("bf1")).toEqual([]);
  });

  test("(b) it really is the aura loss that kills Y: with only 2 damage on Y (2/4 after the recall) Y survives the cascade at bf1 while Lee Sin is still saved", async () => {
    const game = await board({ zhonyas: true }).build();
    await rain(game, ["lee", "lee", "lee", "lee", "y", "wall"]);
    await game.settle();
    expect(game.zoneOf("lee")).toBe("base");
    expect(game.state("y")).toMatchObject({ damage: 2, location: "bf1", might: 4 });
    expect(game.p2.units("bf1")).toEqual(["y"]);
  });

  test("(b) 428.5.c: Y's kill is attributed to Icathian Rain and to P1 — the damage source, not the aura loss that made it lethal", async () => {
    const game = await board({ zhonyas: true }).build();
    await rain(game, FOUR_TWO);
    await game.settle();
    expect(game.zoneOf("y")).toBe("trash");
    const lastDamage = (game.state("y").meta as { lastDamage?: { source?: { cardId?: string; kind?: string; player?: string } } }).lastDamage;
    expect(lastDamage?.source).toMatchObject({ cardId: "rain", kind: "spell", player: P1 });
  });

  test("(b) bf1 is emptied by the two Cleanups, so P2's control lapses (323.6); the Rain is in P1's trash and play returns to P1's open main phase", async () => {
    const game = await board({ zhonyas: true }).build();
    await rain(game, FOUR_TWO);
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.zoneOf("rain")).toBe("trash");
    expect(game.p1.trash()).toContain("rain");
    expect(game.violations()).toEqual([]);
  });

  // ── (c) no Zhonya's — same two-Cleanup shape ─────────────────────────────────────────────────

  test("(c) without Zhonya's the cascade is identical in shape: Lee Sin dies in C1 (8/6) and Y — safe at 4/6 in C1 — dies in C2 at 4/4; both end in P2's trash", async () => {
    const game = await board({ zhonyas: false }).build();
    await rain(game, FOUR_TWO);
    const settled = await game.settle();
    expect(settled.reason).toBe("open"); // one lethal unit in C1 → nothing to order even without a replacement
    expect(game.zoneOf("lee")).toBe("trash");
    expect(game.zoneOf("y")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("(c) without Zhonya's, Y at 2 damage still survives Lee Sin's death (2/4) — C2 re-checks lethality, it does not blanket-kill the battlefield", async () => {
    const game = await board({ zhonyas: false }).build();
    await rain(game, ["lee", "lee", "lee", "lee", "y", "wall"]);
    await game.settle();
    expect(game.zoneOf("lee")).toBe("trash");
    expect(game.state("y")).toMatchObject({ damage: 2, location: "bf1", might: 4 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  // ── (d) 3/3 — two simultaneous deaths, one replacement ───────────────────────────────────────

  test("(d) 3/3: both deaths happen in C1 from the same game action (370.1.a.2), so P2 — the replacement's controller, not the caster — is asked which death Zhonya's applies to, naming both units (373)", async () => {
    const game = await board({ zhonyas: true }).build();
    await rain(game, THREE_THREE);
    const settled = await game.settle();
    expect(settled.reason).toBe("unanswered");
    const decision = game.decision();
    expect(decision).toMatchObject({ kind: "pick", seat: P2 });
    const named = decision?.kind === "pick" ? decision.options.map((o) => o.card ?? o.key).sort() : [];
    expect(named).toEqual(["lee", "y"]);
  });

  test("(d) P2 applies Zhonya's to Y: Y is healed, exhausted and recalled with its buff intact (4 Might in base) BEFORE Lee Sin's unmodified death executes (373.1.a); Lee Sin dies and NO cascaded death follows", async () => {
    const game = await board({ zhonyas: true }).build();
    await rain(game, THREE_THREE);
    await game.settle();
    await game.p2.pick("y");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.state("y")).toMatchObject({ damage: 0, isBuffed: true, isExhausted: true, might: 4, zone: "base" });
    expect(game.zoneOf("lee")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(d) P2 applies Zhonya's to Lee Sin instead: Lee Sin is recalled to base and Y dies in C1 alongside it — the one Hourglass may be applied in only one sequence (373.2, 370.2)", async () => {
    const game = await board({ zhonyas: true }).build();
    await rain(game, THREE_THREE);
    await game.settle();
    await game.p2.pick("lee");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.state("lee")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("y")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.violations()).toEqual([]);
  });
});
