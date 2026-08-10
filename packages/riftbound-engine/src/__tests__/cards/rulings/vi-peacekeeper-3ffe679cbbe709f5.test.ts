/**
 * Ruling 3ffe679cbbe709f5 — Vi, Peacekeeper (UNL-176 → unl-176-219) · Unit · Order · 5 · 5 Might · [Ambush]
 *   "When I attack, [Stun] an enemy unit here."
 *   × Ruin Runner (SFD-105 → sfd-105-221) · Unit · 5 Might — "I can't be chosen by enemy spells and abilities."
 *   × Vex, Apathetic (unl-150-219) — "When an opponent plays a unit while I'm at a battlefield, [Stun] it. …" (contrast)
 *   (Baron Nashor unl-147-219 has the same protection; FAQ #11345.)
 *
 * Q: Can Vi, Peacekeeper stun Ruin Runner?
 * A: No. "[Stun] an enemy unit here" requires choosing which unit — a targeted choice — and Ruin Runner can't be chosen by
 *    enemy abilities. Even as the only enemy there, Vi's ability finds no legal target and does nothing. Contrast Vex,
 *    whose stun selects "it" programmatically (no choice) and therefore DOES hit Ruin Runner (FAQ #8772).
 * Rules: 355.8 / 355.10 (choices are targets; need a valid one), "can't be chosen" protection, 383.4.e (attack trigger).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VI = "unl-176-219";
const RUIN_RUNNER = "sfd-105-221";
const VEX = "unl-150-219";

describe("Ruling 3ffe679cbbe709f5 — Vi, Peacekeeper cannot choose (stun) Ruin Runner", () => {
  test("Ruin Runner is the ONLY enemy at the battlefield: Vi attacks, no target prompt is ever shown, nothing of Vi's resolves against it — Ruin Runner is NOT stunned and deals its combat damage (5 v 5: both die)", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", RUIN_RUNNER, "rr").unit(P1, "base", VI, "vi").build();
    expect(game.state("rr").keywords).toContain("Untargetable");
    await game.p1.move("vi", "bf1");
    expect(game.state("vi").combatRole).toBe("attacker");
    // No choice offered to P1, and no Vi item targeting rr.
    expect(game.decision()?.kind).toBe("action");
    expect(game.chain().some((c) => c.cardId === "vi" && (c.targets ?? []).includes("rr"))).toBe(false);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("rr").isStunned).toBe(false);
    await game.settle();
    // An unstunned Ruin Runner hits back: 5 into Vi's 5 — both die, nobody holds bf1.
    expect(game.zoneOf("vi")).toBe("trash");
    expect(game.zoneOf("rr")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
    expect(game.violations()).toEqual([]);
  });

  test("with another enemy there, only THAT unit can be chosen: Ruin Runner is never among the options; the Grunt gets stunned, Ruin Runner does not", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", RUIN_RUNNER, "rr")
      .unit(P2, "bf1", { might: 2, name: "Grunt" }, "grunt")
      .unit(P1, "base", VI, "vi")
      .build();
    await game.p1.move("vi", "bf1");
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["grunt"]);
      await game.p1.pick("grunt");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", targets: ["grunt"], triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("grunt").isStunned).toBe(true);
    expect(game.state("rr").isStunned).toBe(false);
  });

  test("contrast (FAQ #8772) — Vex, Apathetic's stun is not a choice: P1 plays Ruin Runner while P2's Vex is at a battlefield and Ruin Runner IS stunned", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", VEX, "vex").hand(P1, RUIN_RUNNER, "rr").build();
    await game.p1.play("rr");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vex", controller: P2, triggered: true })]);
    await game.settle();
    expect(game.zoneOf("rr")).toBe("base");
    expect(game.state("rr").isStunned).toBe(true);
    expect(game.state("rr").keywords).toContain("Untargetable"); // protection intact — it just wasn't a "choice"
    expect(game.violations()).toEqual([]);
  });
});
