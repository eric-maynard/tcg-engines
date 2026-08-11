/**
 * Interaction: Solari Chief (ogn-225-298, Order unit, 5 + [order], 4 Might)
 *     "When you play me, choose an enemy unit. If it is stunned, kill it. Otherwise, stun it."
 *   × Janna, Savior (sfd-053-221, [Reaction] Calm champion)
 *     "When you play me, heal your units here, then move up to one enemy unit from here to its base."
 *   × Blast Cone (unl-133-219, Chaos gear)
 *     "When you move an enemy unit, you may exhaust this to [Stun] it."
 *   × Gust (ogn-169-298, [Reaction]) as the opponent's answer.
 *
 * Board: P1's turn, Open state. P1 controls bfB (owned by P2) with a Guard there; P2's unit U stands at
 * bfB and a second enemy unit V sits at bfC; P1 has a ready Blast Cone. P1 plays Solari Chief and names U,
 * which is NOT stunned.
 *
 * Question — YES side: in reaction to his own trigger P1 plays Janna to bfB; her trigger moves U to P2's
 * base; Blast Cone triggers off that move and P1 exhausts it to stun U. Does Chief now KILL U (gate
 * re-read at resolution) or STUN it (gate frozen at the choice)? Is U still a legal target once it is in
 * P2's base? NO side: if instead P2 Gusts U back to hand, what happens to both branches — and either way,
 * may P1 switch the choice to V, now the better kill?
 *
 * Rules: 355.5 / 355.5.b (the choice belongs to the TRIGGERED ability, so it is made when that ability is
 * finalized on the chain — not when the card is played), 355.15 (choices cannot be changed afterwards),
 * 337.2 (a unit chain item resolves immediately after finalization), 383.2.a.1 ("If it is stunned" is not
 * immediately after the Trigger Condition, so it is Effect text, not part of the Condition),
 * 135.2.b.5.a (the condition under which a game action is performed is part of that instruction's
 * complement → read when the instruction executes), 359.3.e.2 / .e.4 (illegal target = requirements no
 * longer met, or a trip to/from a Non-Board Zone), 359.3.e.5 / .e.6 (an illegal target is unaffected and
 * its instructions are ignored), 359.3.e.10 (the ability still counts as resolved), 423.1.a.1 (a stunned
 * unit cannot be stunned again), 423.1.a.2 (stun clears in end-of-turn cleanup step 3d).
 *
 * Expected: the CHOICE is locked (V is never re-offered), the GATE is re-checked at resolution. YES side:
 * U is stunned when the trigger resolves, so Chief KILLS it — and its new home in P2's base keeps it a
 * legal target, since the only restriction is "an enemy unit". NO side: U changed to a Non-Board Zone, so
 * it is illegal — no kill AND no stun, the ability resolves with no effect, and P1 still may not re-aim at V.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHIEF = "ogn-225-298";
const JANNA = "sfd-053-221";
const BLAST_CONE = "unl-133-219";
const GUST = "ogn-169-298";

/**
 * `uMight` is 4 by default; the Gust branch uses 3 because Gust itself only reaches
 * "a unit at a battlefield with 3 [Might] or less".
 */
function board(opts: { uMight?: number; uStunned?: boolean } = {}) {
  const { uMight = 4, uStunned = false } = opts;
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 20, power: { calm: 5, chaos: 5, order: 5 } })
    .resources(P2, { energy: 20, power: { calm: 5, chaos: 5, order: 5 } })
    // bfB is P2's battlefield but P1 controls it — that is what lets P1 play the [Reaction] Janna there.
    .battlefield("bfB", { controller: P1, owner: P2 })
    .battlefield("bfC", { controller: P2 })
    .unit(P1, "bfB", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "bfB", { might: uMight, name: "U" }, "u", uStunned ? { stunned: true } : undefined)
    .unit(P2, "bfC", { might: 2, name: "V" }, "v")
    .gear(P1, BLAST_CONE, "cone")
    .hand(P1, CHIEF, "chief")
    .hand(P1, JANNA, "janna")
    .hand(P2, GUST, "gust");
}

describe("Solari Chief × Janna × Blast Cone — locked choice, re-read stun gate", () => {
  test("the choice belongs to the TRIGGER, not to playing the card (355.5.b): nothing is asked while paying, then the finalized trigger offers exactly the enemy units", async () => {
    const game = await board().build();
    await game.p1.play("chief");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN", source: { cardId: "chief" } });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(offered).toEqual(["u", "v"]); // both enemy units, any location; never P1's Guard
    // rule 337.2 — the Chief himself already resolved; only his triggered ability is on the chain.
    expect(game.zoneOf("chief")).toBe("base");
    expect(game.chain()).toMatchObject([{ cardId: "chief", triggered: true }]);
    await game.p1.pick("u");
    expect(game.chain()).toMatchObject([{ cardId: "chief", targets: ["u"] }]);
  });

  test("YES side: U is moved to P2's base and stunned in reaction — the gate is re-read at resolution (135.2.b.5.a/383.2.a.1) and Chief KILLS U", async () => {
    const game = await board().build();
    await game.p1.play("chief");
    await game.p1.pick("u");
    expect(game.state("u").isStunned).toBe(false); // the branch was NOT decided here

    // In reaction to his own trigger P1 plays Janna to bfB and moves U home.
    await game.p1.play("janna", { to: "bfB" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, targeting: "up-to", source: { cardId: "janna" } });
    await game.p1.pick("u");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Janna's trigger resolves → U moves bfB → P2's base

    expect(game.locationOf("u")).toBe("base");
    // P1 moved an enemy unit, so Blast Cone offers its exhaust-to-stun.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "cone" } });
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority(); // the Cone's trigger resolves
    expect(game.state("u").isStunned).toBe(true);
    expect(game.state("cone").isExhausted).toBe(true);

    // Only Chief's trigger is left; nothing is re-asked.
    expect(game.chain()).toMatchObject([{ cardId: "chief" }]);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("u")).toBe("trash"); // KILLED — not merely stunned
    expect(game.violations()).toEqual([]);
  });

  test("YES side: U stays a legal target in P2's base — the restriction is only \"an enemy unit\", no battlefield clause (359.3.e.2/.e.4)", async () => {
    const game = await board().build();
    await game.p1.play("chief");
    await game.p1.pick("u");
    await game.p1.play("janna", { to: "bfB" });
    await game.p1.pick("u");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority();
    // U never entered a Non-Board Zone; it merely changed location and gained a status.
    expect(game.state("u")).toMatchObject({ controller: P2, isStunned: true, location: "base" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("u")).toBe("trash");
  });

  test("YES side: V is never re-offered — the choice is locked at finalization (355.15) and V ends the line untouched", async () => {
    const game = await board().build();
    await game.p1.play("chief");
    await game.p1.pick("u");
    const kinds: string[] = [];
    const record = () => {
      const d = game.decision();
      kinds.push(`${d?.seat}:${d?.kind}`);
      // no pick aimed at Chief's ability ever comes back
      expect(d?.kind === "pick" && d.source?.cardId === "chief").toBe(false);
    };
    await game.p1.play("janna", { to: "bfB" });
    record();
    await game.p1.pick("u");
    record();
    await game.p1.passPriority();
    await game.p2.passPriority();
    record();
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority();
    record();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.zoneOf("v")).toBe("battlefield-bfC");
    expect(game.state("v").isStunned).toBe(false); // no consolation stun, no re-aim
  });

  test("NO side: P2 Gusts U to hand — a Non-Board Zone makes the target illegal, so there is NO kill and NO stun (359.3.e.5/.e.6)", async () => {
    const game = await board({ uMight: 3 }).build();
    await game.p1.play("chief");
    await game.p1.pick("u");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("gust", { targets: "u" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("u")).toBe("hand");

    // Chief's trigger is still on the chain and still aimed at U.
    expect(game.chain()).toMatchObject([{ cardId: "chief", targets: ["u"] }]);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    // rule 359.3.e.10 — the ability resolved with no effect; the Chief is still played and on the board.
    expect(game.zoneOf("u")).toBe("hand");
    expect(game.zoneOf("chief")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("NO side: no re-aim at V either (355.15) — V is neither killed nor stunned", async () => {
    const game = await board({ uMight: 3 }).build();
    await game.p1.play("chief");
    await game.p1.pick("u");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "u" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 }); // not a fresh target pick
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("v")).toBe("battlefield-bfC");
    expect(game.state("v").isStunned).toBe(false);
  });

  test("gate control: naming an ALREADY-stunned enemy kills it outright — the same re-read, other branch", async () => {
    const game = await board({ uStunned: true }).build();
    await game.p1.play("chief");
    await game.p1.pick("u");
    await game.settle();
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.zoneOf("v")).toBe("battlefield-bfC");
  });

  test("gate control: naming an unstunned enemy with nothing in reaction only STUNS it, and the stun wears off in end-of-turn cleanup step 3d (423.1.a.2)", async () => {
    const game = await board().build();
    await game.p1.play("chief");
    await game.p1.pick("v");
    await game.settle();
    expect(game.state("v").isStunned).toBe(true);
    expect(game.zoneOf("v")).toBe("battlefield-bfC"); // stunned, not killed
    await game.advanceTurn();
    expect(game.state("v").isStunned).toBe(false);
  });

  test("423.1.a.1 — the Cone's stun on an ALREADY-stunned U adds nothing (status is binary); Chief still kills at resolution", async () => {
    const game = await board({ uStunned: true }).build();
    await game.p1.play("chief");
    await game.p1.pick("u");
    await game.p1.play("janna", { to: "bfB" });
    await game.p1.pick("u");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("u").isStunned).toBe(true); // already stunned before the Cone sees the move
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.p1.passPriority();
      await game.p2.passPriority();
    }
    expect(game.state("u").isStunned).toBe(true); // no "double stun" to strip
    await game.settle();
    expect(game.zoneOf("u")).toBe("trash");
  });
});
