/**
 * Interaction: Ambessa, The Wolf (ven-084-166) — Body Champion unit, [4], 4 Might
 *     "[Empower] [3][body]. [Empowered][>] I have +3 [Might] and can't be dealt damage unless I'm in combat."
 *   × Falling Comet (ogn-085-298) — Mind Action spell, [5]: "Deal 6 to a unit at a battlefield."
 *   × Vengeance (ogn-229-298) — Order spell, [4][order][order]: "Kill a unit."
 *   (+ Immortal Phoenix ogn-037-298 in P1's trash as the "when you kill a unit with a spell" witness.)
 *
 * Question: P2's Empowered Ambessa (7) sits alone at battlefield B (P2 controls it). P1's turn, Open
 * state, no combat. P1 holds Falling Comet and Vengeance.
 *   (a) Is Ambessa offered to Falling Comet at all? Damage afterwards? Does she die? Do
 *       kill-with-a-spell / damage triggers fire?
 *   (b) Vengeance on Ambessa — does "can't be dealt damage" save her? Where does she go?
 *   (c) Contrast: NOT empowered (plain 4) — Falling Comet result?
 *   (d) Contrast: P1 first moves a unit into B (combat staged) and casts Comet in the showdown.
 *
 * Rules:
 *   757      — "can't be chosen" is what removes a unit from a target set; Ambessa's text is not that.
 *   358.3.a  — an effect preventing a game action does not make the spell illegal to play/finalize.
 *   054.1    — can't beats can: "deal 6" vs "can't be dealt damage" → no damage is dealt.
 *   055 / 359.3.e.6 — impossible instructions are ignored; the spell still resolves and is trashed.
 *   428.2    — Kill = put directly into the trash; it is not damage, so the restriction is irrelevant.
 *
 * Expected: (a) offered; 0 damage; survives at 7; Comet → P1 trash; no Phoenix prompt. (b) killed →
 *   P2's trash; Phoenix prompt (a spell DID kill); B uncontrolled after cleanup. (c) 6 ≥ 4 → dies →
 *   P2's trash (Phoenix prompt). (d) defender in combat → takes 6, survives (7 Might) with 6 marked;
 *   any 1+ combat damage that combat then kills her.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const AMBESSA = "ven-084-166";
const FALLING_COMET = "ogn-085-298";
const VENGEANCE = "ogn-229-298";
const IMMORTAL_PHOENIX = "ogn-037-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Flatten the `targets` field of P1's cast option into the set of card ids offered. */
function targetsOffered(game: Game, alias: string): string[] {
  const opt = game.p1.option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's turn (Open state). P2 controls B with Ambessa alone there (Empowered unless told otherwise).
 * P1: a 1-Might Scout in base, Falling Comet + Vengeance in hand, Immortal Phoenix in trash, and
 * enough to cast both spells and still pay the Phoenix's [1][fury].
 */
function board(opts: { empowered?: boolean } = {}) {
  const empowered = opts.empowered ?? true;
  return scenario()
    .resources(P1, { energy: 10, power: { fury: 1, order: 2 } })
    .battlefield("B", { controller: P2 })
    .unit(P2, "B", AMBESSA, "ambessa", empowered ? { empowered: true } : undefined)
    .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
    .hand(P1, FALLING_COMET, "comet")
    .hand(P1, VENGEANCE, "venge")
    .trash(P1, IMMORTAL_PHOENIX, "phoenix");
}

describe("Empowered Ambessa × Falling Comet (no) × Vengeance (yes)", () => {
  test("setup: Empowered Ambessa is 7 Might (4 + 3) alone at B, not in combat", async () => {
    const game = await board().build();
    expect(game.state("ambessa").isEmpowered).toBe(true);
    expect(game.state("ambessa").might).toBe(7);
    expect(game.state("ambessa").combatRole).toBeNull();
    expect(game.p2.units("B")).toEqual(["ambessa"]);
  });

  // ── (a) Falling Comet on Empowered Ambessa out of combat ────────────────────────────────

  test("(a) Ambessa IS in Falling Comet's offered target set — her text restricts damage, not being chosen (757 contrast, 358.3.a)", async () => {
    const game = await board().build();
    expect(targetsOffered(game, "comet")).toEqual(["ambessa"]);
    expect(game.p1.can("cast", "comet")).toBe(true);
  });

  test("(a) casting it on her is legal and finalizes: 5 energy paid, Comet on the chain targeting Ambessa", async () => {
    const game = await board().build();
    await game.p1.cast("comet", { targets: "ambessa" });
    expect(game.p1.energy()).toBe(5);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "comet", controller: P1, targets: ["ambessa"] })]);
  });

  test("(a) on resolution can't beats can (054.1): 0 damage is marked, she survives at 7 Might, Comet still goes to P1's trash", async () => {
    const game = await board().build();
    await game.p1.cast("comet", { targets: "ambessa" });
    await game.settle();
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.p1.trash()).toContain("comet");
    expect(game.zoneOf("ambessa")).toBe("battlefield-B");
    expect(game.state("ambessa").damage).toBe(0);
    expect(game.state("ambessa").might).toBe(7);
    expect(game.gameState.battlefields.B?.controller).toBe(P2);
  });

  test("(a) no kill and no damage event → Immortal Phoenix's 'when you kill a unit with a spell' does NOT prompt; play returns to P1's open main phase", async () => {
    const game = await board().build();
    await game.p1.cast("comet", { targets: "ambessa" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Vengeance: kill is not damage ───────────────────────────────────────────────────

  test("(b) Vengeance offers Ambessa (and P1's own Scout — 'a unit')", async () => {
    const game = await board().build();
    expect(targetsOffered(game, "venge").sort()).toEqual(["ambessa", "scout"]);
  });

  test("(b) Vengeance KILLS Empowered Ambessa — 'can't be dealt damage' is irrelevant to a Kill (428.2); she goes to her OWNER's (P2's) trash", async () => {
    const game = await board().build();
    await game.p1.cast("comet", { targets: "ambessa" });
    await game.settle();
    await game.p1.cast("venge", { targets: "ambessa" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
    await game.settle();
    expect(game.zoneOf("ambessa")).toBe("trash");
    expect(game.p2.trash()).toContain("ambessa");
    expect(game.p1.trash()).not.toContain("ambessa");
    expect(game.zoneOf("venge")).toBe("trash");
  });

  test("(b) a spell DID kill a unit this time → Immortal Phoenix's optional [1][fury] replay is offered to P1", async () => {
    const game = await board().build();
    await game.p1.cast("venge", { targets: "ambessa" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.prompt).toContain("Immortal Phoenix");
  });

  test("(b) with Ambessa gone B has no P2 unit → B is uncontrolled after the cleanup", async () => {
    const game = await board().build();
    await game.p1.cast("venge", { targets: "ambessa" });
    await game.settle();
    await game.p1.no(); // decline the Phoenix
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.gameState.battlefields.B?.controller).toBeNull();
    expect(game.p2.units("B")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) contrast: not Empowered ─────────────────────────────────────────────────────────

  test("(c) un-Empowered Ambessa is a plain 4-Might unit with no protection: 6 damage ≥ 4 → she dies in the cleanup → P2's trash", async () => {
    const game = await board({ empowered: false }).build();
    expect(game.state("ambessa").isEmpowered).toBe(false);
    expect(game.state("ambessa").might).toBe(4);
    await game.p1.cast("comet", { targets: "ambessa" });
    await game.settle();
    expect(game.zoneOf("ambessa")).toBe("trash");
    expect(game.p2.trash()).toContain("ambessa");
    expect(game.zoneOf("comet")).toBe("trash");
  });

  test("(c) …and that cleanup kill is attributed to the spell → the Phoenix prompt appears (contrast with (a))", async () => {
    const game = await board({ empowered: false }).build();
    await game.p1.cast("comet", { targets: "ambessa" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.prompt).toContain("Immortal Phoenix");
  });

  // ── (d) contrast: Empowered but IN combat ───────────────────────────────────────────────

  test("(d) Scout moves into B → combat showdown; Ambessa is the defender ('in combat') and P1 (attacker) has Focus to cast the [Action] Comet", async () => {
    const game = await board().build();
    await game.p1.move("scout", "B");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("ambessa").combatRole).toBe("defender");
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.p1.can("cast", "comet")).toBe(true);
    expect(targetsOffered(game, "comet").sort()).toEqual(["ambessa", "scout"]);
  });

  test("(d) in combat the 'unless' exception applies: Comet marks 6 on the 7-Might Ambessa → she survives with 6 damage while the showdown continues", async () => {
    const game = await board().build();
    await game.p1.move("scout", "B");
    await game.p1.cast("comet", { targets: "ambessa" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.zoneOf("ambessa")).toBe("battlefield-B");
    expect(game.state("ambessa").damage).toBe(6);
    expect(game.state("ambessa").might).toBe(7);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("(d) …then any 1+ combat damage finishes her: Scout (1) deals 1 → 7 ≥ 7, Ambessa dies (Scout dies too, 7 vs 1); B ends up uncontrolled, no point for P1", async () => {
    const game = await board().build();
    await game.p1.move("scout", "B");
    await game.p1.cast("comet", { targets: "ambessa" });
    await game.settle();
    expect(game.zoneOf("ambessa")).toBe("trash");
    expect(game.p2.trash()).toContain("ambessa");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.gameState.battlefields.B?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
