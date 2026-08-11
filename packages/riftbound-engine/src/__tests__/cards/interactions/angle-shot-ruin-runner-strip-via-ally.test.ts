/**
 * Interaction: Angle Shot (sfd-011-221) · Spell · Fury · 2 · Reaction
 *     "Choose a unit and an Equipment with the same controller. Attach that Equipment to that unit or detach that
 *      Equipment from that unit. Draw 1."
 *   × Ruin Runner (sfd-105-221) · Unit · 5 Might — "I can't be chosen by enemy spells and abilities."
 *   × Doran's Blade (sfd-095-221) · Equipment · +2 Might
 *   (+ Vanguard Sergeant ogn-219-298 · vanilla 4 Might; Not So Fast sfd-045-221 "Counter an enemy spell or ability
 *    that chooses a friendly unit or gear.")
 *
 * Question: P2 controls bf1 with Ruin Runner wearing P2's Doran's Blade (5+2 = 7); P2's Vanguard Sergeant (4) is in P2's
 * base. P1's turn; P1 holds Angle Shot. Attach/Detach do not inherently target (434.3 / 435.3) — but does Angle Shot?
 *   (a) NO side: may P1 cast Angle Shot choosing (Ruin Runner, Doran's Blade) to detach the Blade?
 *   (b) May P1 instead choose (P2's Sergeant, P2's Blade) — two ENEMY permanents — in attach mode, pulling the Blade off
 *       Ruin Runner without ever choosing it? Resulting Mights, Blade location, who draws.
 *   (c) YES side: P2 casts its own Angle Shot (Ruin Runner, Blade) — legal? Detach: where does the Blade go? Attach on
 *       its current wearer: what happens?
 *   (d) P1 choosing (P1's own unit, P2's Blade)?
 *   (e) Can P2 answer (b) with Not So Fast?
 *
 * Rules: 434.3 / 435.3 (the effect performing attach/detach may target — Angle Shot "chooses" both), 757 / 758 (Ruin
 * Runner is Untargetable for ENEMY spells; illegal targets are not offered), 757.1 (enemy-only restriction), 718.5.b
 * (an attached card can still be chosen), 434.1.f (attaching to a new Top-Most card detaches from the old one), 434.1.g
 * (attaching to its current Top-Most card does nothing), 434.4 / 434.4.a (location follows the new wearer; not a Move),
 * 435.1.e / 719.2 / 818.3.b (old wearer loses the bonus / Equipped status), 435.4 / 435.4.a / 457.1 (a detached
 * Equipment at a battlefield is Recalled to base at the next Cleanup).
 *
 * Expected: (a) not offered / rejected. (b) legal: Blade hops to the Sergeant — Runner 7→5 (unequipped), Sergeant 4→6,
 * Blade in P2's base still P2's, P1 draws 1. (c) P2 may choose its own Runner: detach → Runner 5, Blade unattached and
 * recalled to P2's base, P2 draws 1; attach-on-current-wearer → nothing changes but P2 still draws 1 (a real choice per
 * ruling 9576). P2 can also hop the Blade to the Sergeant itself. (d) illegal pair (different controllers). (e) Yes —
 * P1's Angle Shot chose a friendly (P2) unit and gear → countered: nothing moves, P1 does not draw.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ANGLE_SHOT = "sfd-011-221";
const RUIN_RUNNER = "sfd-105-221";
const DORANS_BLADE = "sfd-095-221";
const VANGUARD_SERGEANT = "ogn-219-298";
const NOT_SO_FAST = "sfd-045-221";

/**
 * P1's turn 3. P2: bf1 with Ruin Runner wearing Doran's Blade (Blade at bf1, attached), Vanguard Sergeant in base,
 * its own Angle Shot + Not So Fast in hand with 4 energy + 1 calm (both). P1: a vanilla 3-Might unit in base, Angle
 * Shot in hand with exactly 2 energy, an empty hand otherwise (so "draw 1" is easy to read).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P1)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 4, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", RUIN_RUNNER, "runner", { equippedWith: ["blade"] } as Record<string, unknown>)
    .card("blade", { def: DORANS_BLADE, meta: { attachedTo: "runner" } as Record<string, unknown>, owner: P2, zone: "bf1" })
    .unit(P2, "base", VANGUARD_SERGEANT, "sarge")
    .unit(P1, "base", { might: 3, name: "P1 Grunt" }, "mine")
    .hand(P1, ANGLE_SHOT, "p1Shot")
    .hand(P2, ANGLE_SHOT, "p2Shot")
    .hand(P2, NOT_SO_FAST, "nsf");
}

/** The (unit, equipment) pairs offered to `seat` for casting `alias` right now. */
function pairsOffered(game: Game, seat: typeof P1, alias: string): string[][] {
  const field = game.seat(seat).option("cast", alias)?.fields.find((f) => f.name === "targets");
  return ((field?.options ?? []) as string[][]).map((p) => [...p]);
}

/** Pass priority around until the chain is empty (or a non-priority prompt appears). */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.acting().pass();
  }
}

describe("Angle Shot × Ruin Runner × Doran's Blade — you can't choose the Runner, but you can strip it via its ally", () => {
  test("setup: Ruin Runner wears the Blade at bf1 → 7 Might, Untargetable; Sergeant bare 4 in P2's base", async () => {
    const game = await board().build();
    expect(game.state("runner")).toMatchObject({ attachments: ["blade"], baseMight: 5, controller: P2, might: 7 });
    expect(game.state("runner").keywords).toContain("Untargetable");
    expect(game.state("blade")).toMatchObject({ attachedTo: "runner", controller: P2, location: "bf1" });
    expect(game.state("sarge")).toMatchObject({ attachments: [], might: 4 });
  });

  // ── (a) NO: P1 cannot choose (Ruin Runner, Blade) ────────────────────────────────────────────

  test("(a) Angle Shot targets (434.3/435.3 — the effect chooses): P1 is NOT offered the pair (Ruin Runner, Blade) and casting it is rejected (757/758)", async () => {
    const game = await board().build();
    const pairs = pairsOffered(game, P1, "p1Shot");
    expect(pairs.some((p) => p.includes("runner"))).toBe(false);
    await expect(game.p1.cast("p1Shot", { targets: ["runner", "blade"] })).rejects.toThrow();
    expect(game.zoneOf("p1Shot")).toBe("hand");
    expect(game.p1.energy()).toBe(2);
    expect(game.state("runner").might).toBe(7);
  });

  // ── (b) YES: (P2's Sergeant, P2's Blade) — same controller, neither protected ─────────────────

  test("(b) the pair (enemy Sergeant, enemy attached Blade) IS offered to P1 — 'same controller' is all that's asked, and an attached card can be chosen (718.5.b)", async () => {
    const game = await board().build();
    expect(pairsOffered(game, P1, "p1Shot")).toEqual([["sarge", "blade"]]);
    expect(game.p1.can("cast", "p1Shot")).toBe(true);
  });

  test("(b) it resolves in attach mode: the Blade hops to the Sergeant (434.1.f) — Ruin Runner 7 → 5 and no longer equipped, Sergeant 4 → 6, without the Runner ever being chosen", async () => {
    const game = await board().build();
    await game.p1.cast("p1Shot", { targets: ["sarge", "blade"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "p1Shot", controller: P1, targets: ["sarge", "blade"] })]);
    await resolveChain(game);
    expect(game.zoneOf("p1Shot")).toBe("trash");
    expect(game.state("runner")).toMatchObject({ attachments: [], might: 5 });
    expect(game.state("sarge")).toMatchObject({ attachments: ["blade"], might: 6 });
    expect(game.state("blade").attachedTo).toBe("sarge");
  });

  test("(b) the Blade's location is now P2's base with the Sergeant (434.4 — not a Move), still owned and controlled by P2; P1 — the caster — draws 1, P2 draws nothing", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("p1Shot", { targets: ["sarge", "blade"] });
    await resolveChain(game);
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.state("blade")).toMatchObject({ controller: P2, location: "base", owner: P2 });
    expect(game.p2.base()).toContain("blade");
    expect(game.p1.hand()).toHaveLength(p1Hand - 1 + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.gameState.unitsMovedThisTurn?.[P2] ?? 0).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) YES side: P2's own Angle Shot ──────────────────────────────────────────────────────────

  test("(c) the restriction is enemy-only (757.1): P2's own Angle Shot IS offered (Ruin Runner, Blade) — and (Sergeant, Blade) too", async () => {
    const game = await board().active(P2).build();
    const pairs = pairsOffered(game, P2, "p2Shot");
    expect(pairs).toContainEqual(["runner", "blade"]);
    expect(pairs).toContainEqual(["sarge", "blade"]);
    expect(pairs.some((p) => p.includes("mine"))).toBe(false); // P1's unit never pairs with P2's Blade
  });

  test("(c) detach mode on (Ruin Runner, Blade): Runner 7 → 5; the Blade is unattached, still P2's, and — having come loose at a battlefield — is Recalled to P2's base by the next Cleanup (435.4/435.4.a/457.1); P2 draws 1", async () => {
    const game = await board().active(P2).build();
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("p2Shot", { targets: ["runner", "blade"] });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 1 } });
    await resolveChain(game);
    await game.settle();
    expect(game.state("runner")).toMatchObject({ attachments: [], location: "bf1", might: 5 });
    expect(game.state("blade")).toMatchObject({ attachedTo: undefined, controller: P2, location: "base", owner: P2 });
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.zoneOf("blade")).not.toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("(c) P2 hopping its own Blade: (Sergeant, Blade) in attach mode moves it Runner → Sergeant (434.1.f): Runner 5, Sergeant 6, P2 draws 1", async () => {
    const game = await board().active(P2).build();
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("p2Shot", { targets: ["sarge", "blade"] });
    await resolveChain(game);
    expect(game.state("runner").might).toBe(5);
    expect(game.state("sarge")).toMatchObject({ attachments: ["blade"], might: 6 });
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1);
  });

  // ruling 9576 ("you must choose one of the two options") / rule 434.1.g: for an already-attached pair the caster
  // may pick ATTACH (`mode` 0), which does nothing to the board, and still draws 1; omitting `mode` derives it
  // from the board (attached → detach).
  test("(c) Angle Shot lets its controller pick attach-vs-detach — choosing ATTACH on the Blade's current wearer changes nothing (434.1.g) yet P2 still draws 1", async () => {
    const game = await board().active(P2).build();
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("p2Shot", { mode: 0, targets: ["runner", "blade"] }); // printed order: attach (0) / detach (1)
    await resolveChain(game);
    await game.settle();
    expect(game.zoneOf("p2Shot")).toBe("trash");
    expect(game.state("runner")).toMatchObject({ attachments: ["blade"], might: 7 });
    expect(game.state("blade").attachedTo).toBe("runner");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1);
  });

  // ── (d) different controllers ─────────────────────────────────────────────────────────────────

  test("(d) (P1's own unit, P2's Blade) is an illegal pair — not offered and rejected; nothing changes", async () => {
    const game = await board().build();
    expect(pairsOffered(game, P1, "p1Shot").some((p) => p[0] === "mine")).toBe(false);
    await expect(game.p1.cast("p1Shot", { targets: ["mine", "blade"] })).rejects.toThrow();
    expect(game.zoneOf("p1Shot")).toBe("hand");
    expect(game.state("mine")).toMatchObject({ attachments: [], might: 3 });
    expect(game.state("blade").attachedTo).toBe("runner");
  });

  // ── (e) Not So Fast answers (b) ───────────────────────────────────────────────────────────────

  test("(e) P1's Angle Shot in (b) is an enemy spell choosing a friendly (P2) unit and gear → Not So Fast may target it", async () => {
    const game = await board().build();
    await game.p1.cast("p1Shot", { targets: ["sarge", "blade"] });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "nsf")).toBe(true);
    const offered = game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered.flat()).toEqual(["p1Shot"]);
  });

  test("(e) …countered: Angle Shot goes to the trash without effect — the Blade stays on Ruin Runner (7), Sergeant stays 4, P1 does NOT draw; NSF cost P2 2 + [calm]", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    await game.p1.cast("p1Shot", { targets: ["sarge", "blade"] });
    await game.p1.passPriority();
    await game.p2.cast("nsf", { targets: "p1Shot" });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["p1Shot", "nsf"]);
    await resolveChain(game);
    await game.settle();
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("p1Shot")).toBe("trash");
    expect(game.state("runner")).toMatchObject({ attachments: ["blade"], might: 7 });
    expect(game.state("sarge")).toMatchObject({ attachments: [], might: 4 });
    expect(game.state("blade")).toMatchObject({ attachedTo: "runner", location: "bf1" });
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // spent the Shot, drew nothing
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
