/**
 * Interaction: Noxus Saboteur (ogn-018-298) · Unit · Fury · 3 · 3 Might
 *     "Your opponents' [Hidden] cards can't be revealed here."
 *   × Hidden Blade (ogn-213-298) · Spell · Order · 2+[order]
 *     "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."
 *   × Vanguard Sergeant (ogn-219-298) · vanilla 4-Might unit  (+ Shipyard Skulker, vanilla 3)
 *
 * Question: P1 controls bf1 with Vanguard Sergeant and hid Hidden Blade there last turn; P1 also has a
 * facedown card at bf2. On P2's turn P2 Standard-Moves Noxus Saboteur + Shipyard Skulker into bf1.
 *   (a) Can P1 flip Hidden Blade in the combat showdown? Is there a window "before Saboteur arrives"?
 *   (b) Does Saboteur touch P1's facedown card at bf2, or P2's own facedown cards?
 *   (c) P2 wins the combat with Saboteur still there — is Hidden Blade pinned facedown under P2's
 *       battlefield, or removed, and to where?
 *   (d) Contrast: Saboteur is killed by a from-hand spell mid-showdown — can P1 now flip the Blade at
 *       Skulker before combat damage?
 *
 * Rules:
 *   364          — Saboteur's text is a continuous passive; it applies the instant Saboteur is "here".
 *   811.6        — a Hidden card has [Reaction] while facedown; playing it from facedown reveals it.
 *   811.1.b/d.2  — play-from-facedown ignores cost; targets must be chosen from that battlefield.
 *   466.3.a/466.5 — sole player with units left wins and establishes control (→ Conquer, +1 point).
 *   466.5.c, 323.7, 107.3.c/d — hidden cards not sharing a controller with the battlefield are removed
 *                  at cleanup and put in their OWNER'S TRASH (a rule-mandated zone change, not a reveal
 *                  by P1 — 421.4's reveal-on-zone-change is informational).
 *   A Standard Move is not a chain item: no priority exists between the move and Saboteur being here.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SABOTEUR = "ogn-018-298";
const HIDDEN_BLADE = "ogn-213-298";
const SERGEANT = "ogn-219-298";
const SKULKER = "ogn-175-298"; // Shipyard Skulker — vanilla 3 Might
const CONSULT = "ogn-083-298"; // Consult the Past — [Hidden] [Reaction] Draw 2 (a facedown with no target needs)

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Card ids offered by the current pick prompt (empty if the decision is not a pick). */
function pickOffered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
}

/**
 * Turn 3, P2 to act (P1 hid its cards on an earlier turn).
 *   bf1 (P1):  Vanguard Sergeant (4) · facedown Hidden Blade "blade"
 *   bf2 (P1):  1-Might guard · facedown Consult the Past "p1AtBf2"
 *   bf3 (P2):  1-Might guard · P2's own facedown Consult the Past "p2AtBf3"
 *   P2 base:   Noxus Saboteur (3) + Shipyard Skulker (3), both ready
 *   P1 hand:   a second Hidden Blade with exactly 2 energy + [order] to cast it
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "bf1", SERGEANT, "sergeant")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .unit(P1, "bf2", { might: 1, name: "Bf2 Guard" }, "bf2Guard")
    .facedown(P1, "bf2", CONSULT, "p1AtBf2")
    .unit(P2, "bf3", { might: 1, name: "Bf3 Guard" }, "bf3Guard")
    .facedown(P2, "bf3", CONSULT, "p2AtBf3")
    .unit(P2, "base", SABOTEUR, "sab")
    .unit(P2, "base", SKULKER, "skulker")
    .hand(P1, HIDDEN_BLADE, "bladeHand");
}

/** P2 moves both units into bf1; the combat showdown opens with P2 (attacker) holding Focus. */
async function attack(game: Game): Promise<void> {
  await game.p2.move(["sab", "skulker"], "bf1");
}

describe("Noxus Saboteur × facedown Hidden Blade × conquer cleanup", () => {
  // ── (a) the lock is on from the moment Saboteur is here ─────────────────────────────────────

  test("(a) the Standard Move is not a chain item: Saboteur is already at bf1, the chain is empty, and the showdown opens with P2 holding Focus — P1 had no window 'before Saboteur arrived'", async () => {
    const game = await board().build();
    await attack(game);
    expect(game.locationOf("sab")).toBe("bf1");
    expect(game.locationOf("skulker")).toBe("bf1");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.legal()).toEqual([]); // P1 is not being asked anything yet
    expect(game.p1.can("reveal", "blade")).toBe(false);
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
  });

  test("(a) once P1 has Focus in the combat showdown, flipping Hidden Blade at bf1 is NOT legal (Saboteur: opponents' Hidden cards can't be revealed here) — yet P1 does have showdown timing (can cast the in-hand copy)", async () => {
    const game = await board().build();
    await attack(game);
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "bladeHand")).toBe(true); // [Action] timing is live for P1 …
    expect(game.p1.can("reveal", "blade")).toBe(false); // … but the facedown copy is locked
    const r = await game.p1.try((p) => p.reveal("blade", { answers: ["sab"] }));
    expect(r.ok).toBe(false);
    const r2 = await game.p1.try((p) => p.reveal("blade", { answers: ["skulker"] }));
    expect(r2.ok).toBe(false);
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.zoneOf("sab")).toBe("battlefield-bf1");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([]);
  });

  // ── (b) scope: "here" and "your opponents'" ─────────────────────────────────────────────────

  test("(b) 'here' only: during the same showdown P1 CAN flip its facedown card at bf2 (Consult the Past → draws 2)", async () => {
    const game = await board().build();
    await attack(game);
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "p1AtBf2")).toBe(true);
    const hand0 = game.p1.hand().length;
    await game.p1.reveal("p1AtBf2");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("p1AtBf2")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    // the bf1 lock is untouched by any of this
    expect(game.p1.can("reveal", "blade")).toBe(false);
  });

  test("(b) 'your opponents'' only: P2's own facedown cards stay revealable — at bf3 while Saboteur fights at bf1, and even with Saboteur sitting AT bf3 next to it", async () => {
    const game = await board().build();
    await attack(game);
    expect(game.p2.can("reveal", "p2AtBf3")).toBe(true);

    const sameSpot = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf3", { controller: P2 })
      .unit(P2, "bf3", SABOTEUR, "sab")
      .facedown(P2, "bf3", CONSULT, "p2AtBf3")
      .build();
    expect(sameSpot.p2.can("reveal", "p2AtBf3")).toBe(true);
    const hand0 = sameSpot.p2.hand().length;
    await sameSpot.p2.reveal("p2AtBf3");
    await sameSpot.settle();
    expect(sameSpot.zoneOf("p2AtBf3")).toBe("trash");
    expect(sameSpot.p2.hand()).toHaveLength(hand0 + 2);
  });

  // ── (c) P2 conquers with Saboteur alive → the Blade is removed to P1's trash ────────────────

  test("(c) combat: P1 assigns Sergeant's 4 as 3→Skulker (lethal) + 1→Saboteur; Sergeant takes 6 and dies; Saboteur alone remains → P2 wins and conquers bf1 (+1 point)", async () => {
    const game = await board().build();
    await attack(game);
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 });
    await game.p1.distribute({ sab: 1, skulker: 3 });
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("sab")).toBe("battlefield-bf1");
    expect(game.state("sab").damage).toBe(0); // healed in combat cleanup (466.1.a.1)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) 'can't be revealed here' does not pin the Blade: at cleanup P1's facedown Hidden Blade is REMOVED to P1's trash (466.5.c / 323.7 / 107.3.c-d) — not left facedown under P2's battlefield, not returned to hand", async () => {
    const game = await board().build();
    const p1Hand0 = game.p1.hand().length;
    const p2Hand0 = game.p2.hand().length;
    await attack(game);
    await game.p2.passFocus();
    await game.p1.passFocus();
    await game.p1.distribute({ sab: 1, skulker: 3 });
    await game.settle();
    expect(game.zoneOf("sab")).toBe("battlefield-bf1"); // the lock's source is still "here"
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.trash()).toContain("blade");
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.p1.hand()).toHaveLength(p1Hand0); // not returned to hand
    expect(game.p1.hand()).not.toContain("blade");
    // It was removed, not PLAYED: nothing was killed by it and nobody drew off it.
    expect(game.p2.hand()).toHaveLength(p2Hand0);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1 } });
    // P1's other facedown card sits at a battlefield P1 still controls → untouched.
    expect(game.zoneOf("p1AtBf2")).toBe("facedown-bf2");
    expect(game.chain()).toEqual([]);
  });

  // ── (d) contrast: Saboteur dies mid-showdown → the lock lifts immediately ───────────────────

  test("(d) P1 casts the in-hand Hidden Blade at Saboteur during the showdown: it resolves, Saboteur dies, P2 draws 2 — and the facedown Blade at bf1 becomes revealable at once", async () => {
    const game = await board().build();
    const p2Hand0 = game.p2.hand().length;
    await attack(game);
    await game.p2.passFocus();
    await game.p1.cast("bladeHand", { targets: "sab" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bladeHand"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("sab")).toBe("trash");
    expect(game.zoneOf("bladeHand")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 2);
    // Still in the same showdown; when P1 next holds Focus the reveal is on the menu.
    if (game.actingSeat() === P2) {
      await game.p2.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "blade")).toBe(true);
  });

  test("(d) flipping the Blade from facedown: costs nothing, only units HERE are offered (Sergeant, Skulker — not the bf2/bf3 guards, 811.1.d.2); Skulker dies and P2 draws 2 more before any combat damage; P1 keeps bf1 with an undamaged Sergeant", async () => {
    const game = await board().build();
    const p2Hand0 = game.p2.hand().length;
    await attack(game);
    await game.p2.passFocus();
    await game.p1.cast("bladeHand", { targets: "sab" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.actingSeat() === P2) {
      await game.p2.passFocus();
    }
    await game.p1.reveal("blade");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // nothing further spent
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const offered = pickOffered(game);
    expect(offered.sort()).toEqual(["sergeant", "skulker"]);
    await game.p1.pick("skulker");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 4); // 2 (Saboteur) + 2 (Skulker)
    expect(game.state("sergeant").damage).toBe(0); // no combat damage has been dealt yet
    // No attackers remain → the combat ends with P1 still in control; P2 scored nothing.
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("sergeant")).toBe("battlefield-bf1");
    expect(game.state("sergeant").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p2.points()).toBe(0);
    expect(game.p2.units()).toEqual(["bf3Guard"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
