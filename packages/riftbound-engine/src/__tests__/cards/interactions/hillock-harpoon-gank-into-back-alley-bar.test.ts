/**
 * Interaction: Windswept Hillock (ogn-297-298, Battlefield) "Units here have [Ganking]. (They can move from battlefield to
 *     battlefield.)"
 *   × Harpoon Squad (sfd-137-221, 4 Might) "When I move from a battlefield, give me +2 [Might] this turn."
 *   × Back-Alley Bar (ogn-277-298, Battlefield) "When a unit moves from here, give it +1 [Might] this turn."
 *   with P2's vanilla Vanguard Sergeant (ogn-219-298, 4 Might) defending the Bar.
 *
 * Question: the Hillock is P1's with a ready Harpoon Squad on it; the Bar is P2's, held by a Sergeant.
 *   (a) YES: can Harpoon Squad — no printed Ganking — Standard-Move Hillock → Bar? Does losing the granted Ganking on
 *       arrival matter? What Might does it fight at, and when does combat start relative to its own trigger?
 *   (b) NO: can P2's Sergeant at the Bar Standard-Move to the Hillock ("it would have Ganking once there")? Can Harpoon
 *       Squad, later sitting on the Bar, gank back to the Hillock?
 *   (c) NO/recall: a defender survives combat, so the surviving Harpoon Squad is RECALLED Bar → base. Does the Bar's
 *       "moves from here" fire? Does Harpoon's own "when I move from a battlefield" fire?
 *   (d) YES/contrast: on a later turn Harpoon Squad Standard-Moves Bar → base. Which triggers fire?
 *
 * Rules: 144.4 / 144.4.b / 144.4.c.1 + 810.1.b / 810.1.c (Ganking is a passive that ADDS bf→bf to the Standard Move of a
 * unit that currently has it), 447.1 / 446.3 (legality is judged at the Origin; moving is instantaneous, no in-between
 * state), 450 (destination becomes Contested), 323.13 / 460 (combat begins only from a Neutral Open state with an empty
 * chain — the move trigger resolves first), 456 / 456.1 / 466.1.a.2 (step 3d relocation of surviving attackers is a
 * Recall; Recalls are not Moves and do not fire move triggers), 449.1 (effect moves are a different permission source).
 *
 * Expected: (a) legal; sequence: move → Bar contested by P1, Harpoon's trigger pends and resolves (+2 → 6) BEFORE combat;
 * 6 vs Sergeant 4: Sergeant dies, Harpoon survives, P1 conquers the Bar and scores 1; the Bar's own trigger does not
 * fire (moved TO it). (b) no and no — only base is a Standard-Move destination from the Bar. (c) neither trigger fires:
 * Harpoon is back in base at exactly 6 (the +2 from the original move only). (d) both fire → 4 + 2 + 1 = 7 in base.
 *
 * Note on (c): two READY Sergeants would deal 8 ≥ 6 and kill Harpoon Squad, so the second Sergeant is placed STUNNED
 * (423.1.b: contributes no combat damage, 423.1.c: still needs 4 to die). Harpoon takes 4 (< 6) and survives; its 6
 * damage kills one Sergeant (4) and puts 2 on the other, which survives — a defender remains, so the attacker is recalled.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WINDSWEPT_HILLOCK = "ogn-297-298";
const HARPOON_SQUAD = "sfd-137-221";
const BACK_ALLEY_BAR = "ogn-277-298";
const VANGUARD_SERGEANT = "ogn-219-298";

/**
 * P1's turn 2. Hillock (P1, live text) with a ready Harpoon Squad; Bar (P2, live text) with a ready Sergeant.
 * `survive: true` adds a second, STUNNED + exhausted Sergeant at the Bar (see header note on (c)).
 */
function board(opts: { survive?: boolean } = {}) {
  const s = scenario()
    .battlefield("hillock", { controller: P1, def: WINDSWEPT_HILLOCK, inert: false })
    .battlefield("bar", { controller: P2, def: BACK_ALLEY_BAR, inert: false })
    .unit(P1, "hillock", HARPOON_SQUAD, "harpoon")
    .unit(P2, "bar", VANGUARD_SERGEANT, "sarge");
  return opts.survive ? s.unit(P2, "bar", VANGUARD_SERGEANT, "sarge2", { exhausted: true, stunned: true }) : s;
}

/** Standard-Move destinations currently offered to `seat` for `unit` (bare battlefield ids / "base"), plus gank targets. */
function moveDestinations(game: Game, seat: typeof P1, unit: string): { standard: string[]; gank: string[] } {
  const handle = game.seat(seat);
  const standard: string[] = [];
  const gank: string[] = [];
  for (const o of handle.legal()) {
    if (o.moveId === "standardMove") {
      const carriesUnit = o.variants.some((v) => ((v.params.unitIds as string[] | undefined) ?? []).includes(unit));
      if (carriesUnit) {
        standard.push(o.key.slice("standardMove:to:".length));
      }
    }
    if (o.moveId === "gankingMove" && o.card === unit) {
      for (const v of o.variants) {
        gank.push(String(v.params.toBattlefield));
      }
    }
  }
  return { gank: [...new Set(gank)].sort(), standard: [...new Set(standard)].sort() };
}

/** Sum of combat damage dealt to `target` according to the public damage log. */
function combatDamageTo(game: Game, target: string): number {
  return (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).reduce((s, r) => s + r.amount, 0);
}

describe("Windswept Hillock × Harpoon Squad × Back-Alley Bar — a borrowed Ganking into a defended battlefield", () => {
  test("setup: at the Hillock Harpoon Squad HAS Ganking (a static grant, not printed); the Sergeant at the Bar has none", async () => {
    const game = await board().build();
    expect(game.state("harpoon").keywords).toContain("Ganking");
    expect(game.state("harpoon").grantedKeywords).toEqual([expect.objectContaining({ duration: "static", keyword: "Ganking" })]);
    expect(game.state("harpoon")).toMatchObject({ isReady: true, location: "hillock", might: 4 });
    expect(game.state("sarge").keywords).not.toContain("Ganking");
    expect(game.gameState.battlefields.bar).toMatchObject({ contested: false, controller: P2 });
  });

  // ================================================================== (a) YES — Hillock → Bar
  test("(a) Hillock → Bar IS a legal Standard-Move destination for Harpoon Squad (144.4.c.1 / 810.1.b) — alongside base", async () => {
    const game = await board().build();
    const dest = moveDestinations(game, P1, "harpoon");
    expect(dest.standard).toEqual(["bar", "base"]);
    expect(game.p1.can("move")).toBe(true);
    const r = await game.p1.try((p) => p.move("harpoon", "bar"));
    expect(r.ok).toBe(true);
  });

  test("(a) right after the move: Harpoon is AT the Bar and exhausted, has already lost Ganking (446.3 — irrelevant to legality, 447.1), the Bar is Contested by P1 (450), and ONLY Harpoon's own trigger is on the chain — combat has not begun (323.13/460)", async () => {
    const game = await board().build();
    await game.p1.move("harpoon", "bar");
    expect(game.zoneOf("harpoon")).toBe("battlefield-bar");
    expect(game.state("harpoon").isExhausted).toBe(true);
    expect(game.state("harpoon").keywords).not.toContain("Ganking");
    expect(game.gameState.battlefields.bar).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "harpoon", controller: P1, triggered: true })]);
    expect(game.chain().some((i) => i.cardId === "bar")).toBe(false); // moved TO the Bar, not from it
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("harpoon").might).toBe(4); // trigger not yet resolved
    expect(game.state("sarge").combatRole ?? null).not.toBe("defender"); // no combat yet
  });

  test("(a) the trigger resolves first (+2 → 6), THEN the combat showdown opens with P1 (attacker) holding Focus and Harpoon already at 6", async () => {
    const game = await board().build();
    await game.p1.move("harpoon", "bar");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Harpoon Squad's trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("harpoon").might).toBe(6);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("harpoon").combatRole).toBe("attacker");
    expect(game.state("sarge").combatRole).toBe("defender");
  });

  test("(a) combat: 6 vs 4 — the Sergeant dies, Harpoon takes 4 (< 6) and survives (healed), P1 conquers the Bar and scores 1; Harpoon is exactly 6 (no Bar +1)", async () => {
    const game = await board().build();
    await game.p1.move("harpoon", "bar");
    await game.settle();
    expect(combatDamageTo(game, "sarge")).toBe(6);
    expect(combatDamageTo(game, "harpoon")).toBe(4);
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("harpoon")).toBe("battlefield-bar");
    expect(game.state("harpoon")).toMatchObject({ damage: 0, might: 6 });
    expect(game.gameState.battlefields.bar).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) the +2 is 'this turn' only — next turn Harpoon Squad is a plain 4 again", async () => {
    const game = await board().build();
    await game.p1.move("harpoon", "bar");
    await game.settle();
    expect(game.state("harpoon").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("harpoon").might).toBe(4);
  });

  // ================================================================== (b) NO — no Ganking away from the Hillock
  test("(b) P2's Sergeant at the Bar may only Standard-Move to base — the Hillock is NOT offered ('would have Ganking after arriving' is no permission, 144.4) and forcing it is rejected", async () => {
    const game = await board().turn(3).active(P2).build();
    const dest = moveDestinations(game, P2, "sarge");
    expect(dest.standard).toEqual(["base"]);
    expect(dest.gank).toEqual([]);
    expect(game.p2.can("gank", "sarge")).toBe(false);
    await expect(game.p2.move("sarge", "hillock")).rejects.toThrow();
    await expect(game.p2.gank("sarge", "hillock")).rejects.toThrow();
    expect(game.zoneOf("sarge")).toBe("battlefield-bar");
    expect(game.state("sarge").isReady).toBe(true);
  });

  test("(b) Harpoon Squad, having conquered the Bar, has NO Ganking there on P1's next turn — its only Standard-Move destination is base; Bar → Hillock is rejected", async () => {
    const game = await board().build();
    await game.p1.move("harpoon", "bar");
    await game.settle();
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1 again — Harpoon readied at the Bar
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("harpoon")).toMatchObject({ isReady: true, location: "bar" });
    expect(game.state("harpoon").keywords).not.toContain("Ganking");
    const dest = moveDestinations(game, P1, "harpoon");
    expect(dest.standard).toEqual(["base"]);
    expect(dest.gank).toEqual([]);
    await expect(game.p1.move("harpoon", "hillock")).rejects.toThrow();
    await expect(game.p1.gank("harpoon", "hillock")).rejects.toThrow();
    expect(game.zoneOf("harpoon")).toBe("battlefield-bar");
  });

  // ================================================================== (c) NO — the post-combat Recall is not a Move
  test("(c) setup check: vs Sergeant + STUNNED Sergeant, Harpoon (6) takes only 4 and survives; one Sergeant dies, the other keeps the Bar → Harpoon is RECALLED to base (466.1.a.2), P2 keeps control, nobody scores", async () => {
    const game = await board({ survive: true }).build();
    await game.p1.move("harpoon", "bar");
    await game.settle(); // default allocation: 4 lethal to one Sergeant, 2 to the other
    expect(combatDamageTo(game, "harpoon")).toBe(4); // the stunned Sergeant contributes nothing (423.1.b)
    expect(combatDamageTo(game, "sarge") + combatDamageTo(game, "sarge2")).toBe(6);
    const dead = ["sarge", "sarge2"].filter((s) => game.zoneOf(s) === "trash");
    const alive = ["sarge", "sarge2"].filter((s) => game.zoneOf(s) === "battlefield-bar");
    expect(dead).toHaveLength(1);
    expect(alive).toHaveLength(1);
    expect(game.zoneOf("harpoon")).toBe("base");
    expect(game.state("harpoon")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.gameState.battlefields.bar).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(c) the Recall Bar → base fires NEITHER trigger (456/456.1): nothing goes on the chain and Harpoon sits in base at exactly 6 (just the +2 from the original Hillock → Bar move) — not 7 (Bar) or 8 (own trigger again)", async () => {
    const game = await board({ survive: true }).build();
    await game.p1.move("harpoon", "bar");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("harpoon").might).toBe(6); // the one legitimate +2
    await game.settle();
    expect(game.zoneOf("harpoon")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.state("harpoon").might).toBe(6);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ================================================================== (d) YES — a real Standard Move Bar → base
  test("(d) contrast: on P1's next turn Harpoon Standard-Moves Bar → base (144.4.b) — BOTH 'moves from here' (Bar) and 'move from a battlefield' (Harpoon) trigger as two separate chain items", async () => {
    const game = await board().build();
    await game.p1.move("harpoon", "bar");
    await game.settle(); // (a): conquers the Bar
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("harpoon").might).toBe(4);
    await game.p1.move("harpoon", "base");
    expect(game.zoneOf("harpoon")).toBe("base");
    await game.acceptTriggerOrder(); // both are P1's triggers → soft order offer (383.3.d); keep the listed order
    const items = game.chain();
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.cardId).sort()).toEqual(["bar", "harpoon"]);
    expect(items.every((i) => i.triggered)).toBe(true);
  });

  test("(d) …after both resolve Harpoon Squad is 4 + 2 + 1 = 7 Might in base for the turn, and 4 again next turn", async () => {
    const game = await board().build();
    await game.p1.move("harpoon", "bar");
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.move("harpoon", "base");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("harpoon")).toMatchObject({ location: "base", might: 7 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.advanceTurn();
    expect(game.state("harpoon").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});
