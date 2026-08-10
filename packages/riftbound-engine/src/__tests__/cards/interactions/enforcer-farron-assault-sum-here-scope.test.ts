/**
 * Interaction: Chemtech Enforcer (ogn-003-298) · Unit · Fury · 2 · 2 Might
 *     "[Assault 2] (+2 [Might] while I'm an attacker.) When you play me, discard 1."
 *   × Captain Farron (ogn-015-298) · Unit · Fury · 4 · 5 Might
 *     "Other friendly units here have [Assault]. (+1 [Might] while they're attackers.)"
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla)
 *
 * Rules: 807.1.b.3 (bare [Assault] = Assault 1), 807.1.c / 807.1.d.1 (Assault only adds Might while the
 * unit holds the Attacker designation), 807.2 (Assault from several sources sums), 807.3 (the summed value
 * is a readable characteristic), 465.2.a (combat damage = current Might), 465.2.c / 465.2.c.4 (assignment;
 * over-assigning a sole defender is fine), 466.3 (no surviving attacker → nobody conquers).
 *
 * Question. P1: Enforcer + Farron together in base; P2 holds bf1 with Vanguard Sergeant.
 *   (a) In base: Enforcer reads Assault 3 (2 printed + 1 from Farron 'here' = base) as a characteristic,
 *       but Might is still 2. Farron grants nothing to himself.
 *   (b) Both move to bf1: Enforcer 2+3 = 5, Farron 5 → 10 vs 4. Sergeant dies; P2's 4 cannot reach lethal
 *       (5) on either → both survive, P1 conquers bf1. Afterwards Enforcer (with Farron) reads Assault 3,
 *       Might 2 again.
 *   (c) Enforcer moves ALONE: Farron's 'here' is base, not bf1 → the grant drops on leaving → Assault 2 →
 *       4 vs 4, both die, bf1 not conquered (466.3.d No Result; empty → uncontrolled per 190.4.c).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";

const ENFORCER = "ogn-003-298";
const FARRON = "ogn-015-298";
const SERGEANT = "ogn-219-298";

/** P1's turn: Enforcer + Farron ready in P1's base; P2 controls bf1 with the Sergeant alone. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", ENFORCER, "enf")
    .unit(P1, "base", FARRON, "farron")
    .unit(P2, "bf1", SERGEANT, "sgt");
}

/** rule 807.2 / 807.3 — a unit's total Assault: printed value + every granted instance (bare = 1). */
function assaultOf(game: Game, unit: string): number {
  const printed = (getGlobalCardRegistry().getAbilities(unit) ?? [])
    .filter((a) => a.type === "keyword" && (a as { keyword?: string }).keyword === "Assault")
    .reduce((s, a) => s + ((a as { value?: number }).value ?? 1), 0);
  const granted = game
    .state(unit)
    .grantedKeywords.filter((k) => k.keyword === "Assault")
    .reduce((s, k) => s + (typeof k.value === "number" ? k.value : 1), 0);
  return printed + granted;
}

describe("(a) at rest in base with Farron: Assault is a readable characteristic, Might is not raised", () => {
  test("Enforcer carries printed Assault 2 plus ONE static bare Assault from Farron ('here' = P1's base) → Assault 3 (807.2, 807.3)", async () => {
    const game = await board().build();
    expect(game.state("enf").keywords).toContain("Assault");
    expect(game.state("enf").grantedKeywords).toEqual([{ duration: "static", keyword: "Assault", value: undefined }]);
    expect(assaultOf(game, "enf")).toBe(3);
  });

  test("…but its Might is still 2 — Assault adds nothing without the Attacker designation (807.1.c, 807.1.d.1)", async () => {
    const game = await board().build();
    expect(game.state("enf")).toMatchObject({ baseMight: 2, combatRole: null, might: 2 });
  });

  test("Farron does not grant himself Assault ('OTHER friendly units here'): no Assault keyword, Might 5", async () => {
    const game = await board().build();
    expect(game.state("farron").keywords).not.toContain("Assault");
    expect(game.state("farron").grantedKeywords).toEqual([]);
    expect(assaultOf(game, "farron")).toBe(0);
    expect(game.state("farron").might).toBe(5);
  });

  test("the enemy Sergeant at bf1 gets nothing from Farron (friendly + here only)", async () => {
    const game = await board().build();
    expect(game.state("sgt").grantedKeywords).toEqual([]);
    expect(game.state("sgt").might).toBe(4);
  });
});

describe("(b) Enforcer + Farron attack bf1 together: 5 + 5 = 10 vs 4", () => {
  test("in the showdown both are attackers; Farron is now 'here' at bf1 with Enforcer → Enforcer fights at 2 + (2+1) = 5, Farron at 5; Sergeant defends at 4", async () => {
    const game = await board().build();
    await game.p1.move(["enf", "farron"], "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("enf").combatRole).toBe("attacker");
    expect(game.state("farron").combatRole).toBe("attacker");
    expect(game.state("sgt").combatRole).toBe("defender");
    expect(assaultOf(game, "enf")).toBe(3);
    expect(game.state("enf").might).toBe(5);
    expect(game.state("farron").might).toBe(5); // no self-grant even while attacking
    expect(game.state("sgt").might).toBe(4);
  });

  test("damage step: P2 must spread its 4 over two attackers that are each lethal only at 5 — it cannot kill either (465.2.c)", async () => {
    const game = await board().build();
    await game.p1.move(["enf", "farron"], "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 4 });
    const lethal = d?.kind === "distribute" ? Object.fromEntries(d.buckets.map((b) => [b.key, b.lethal])) : {};
    expect(lethal).toEqual({ enf: 5, farron: 5 });
    const max = d?.kind === "distribute" ? Object.fromEntries(d.buckets.map((b) => [b.key, b.max])) : {};
    expect(max).toEqual({ enf: 4, farron: 4 });
  });

  test("outcome: Sergeant dies (10 ≥ 4, sole defender soaks it all, 465.2.c.4), both attackers survive and are healed, P1 conquers bf1 for 1 point", async () => {
    const game = await board().build();
    await game.p1.move(["enf", "farron"], "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.p2.distribute({ enf: 4 }); // all 4 into Enforcer: 4 < 5, it lives
    await game.settle();
    expect(game.zoneOf("sgt")).toBe("trash");
    expect(game.p1.units("bf1").sort()).toEqual(["enf", "farron"]);
    expect(game.state("enf").damage).toBe(0); // healed after combat
    expect(game.state("farron").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("a 2 / 2 split is refused (lethal-first, 465.2.c.3); all 4 into Farron is legal and kills nothing either — same conquer", async () => {
    const game = await board().build();
    await game.p1.move(["enf", "farron"], "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    const r = await game.p2.try((p) => p.distribute({ enf: 2, farron: 2 }));
    expect(r.ok).toBe(false);
    await game.p2.distribute({ farron: 4 });
    await game.settle();
    expect(game.zoneOf("sgt")).toBe("trash");
    expect(game.p1.units("bf1").sort()).toEqual(["enf", "farron"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("after combat, back at rest at bf1 next to Farron: Enforcer again reads Assault 3 but Might 2 (designation gone, 807.1.d.1)", async () => {
    const game = await board().build();
    await game.p1.move(["enf", "farron"], "bf1");
    await game.settle(); // default assignment; nothing of P1's can die
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("enf")).toBe("bf1");
    expect(game.locationOf("farron")).toBe("bf1");
    expect(game.state("enf").combatRole).toBeNull();
    expect(assaultOf(game, "enf")).toBe(3);
    expect(game.state("enf").might).toBe(2);
    expect(game.state("farron").might).toBe(5);
  });
});

describe("(c) contrast — Enforcer attacks bf1 ALONE, Farron stays in base: the 'here' grant does not travel", () => {
  test("the moment Enforcer leaves base Farron's grant drops: in the showdown it has only its printed Assault 2 → fights at 4 (continuous static, 807.1.c)", async () => {
    const game = await board().build();
    await game.p1.move("enf", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("enf").combatRole).toBe("attacker");
    expect(game.state("enf").grantedKeywords).toEqual([]);
    expect(assaultOf(game, "enf")).toBe(2);
    expect(game.state("enf").might).toBe(4);
    expect(game.state("farron")).toMatchObject({ combatRole: null, location: "base", might: 5 });
  });

  test("4 vs 4: each side assigns lethal to the other — Enforcer and Sergeant both die; with no surviving attacker bf1 is NOT conquered (466.3.d 'No Result'): no points, and the now-empty battlefield drops to uncontrolled at the cleanup (190.4.c)", async () => {
    const game = await board().build();
    await game.p1.move("enf", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("enf")).toBe("trash");
    expect(game.zoneOf("sgt")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.gameState.battlefields.bf1?.contested ?? false).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control: Farron following LATER (after that combat) is too late for Enforcer — but had Farron gone alone he would fight at a plain 5 (no Assault of his own) and conquer", async () => {
    const game = await board().build();
    await game.p1.move("farron", "bf1");
    expect(game.state("farron").combatRole).toBe("attacker");
    expect(game.state("farron").might).toBe(5);
    // Enforcer left behind in base is no longer 'here' with Farron → its granted Assault is gone too.
    expect(game.state("enf").grantedKeywords).toEqual([]);
    expect(assaultOf(game, "enf")).toBe(2);
    await game.settle();
    expect(game.zoneOf("sgt")).toBe("trash");
    expect(game.locationOf("farron")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
