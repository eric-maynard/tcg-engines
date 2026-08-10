/**
 * Interaction: King's Edict (ogn-237-298) · Spell · Order · 6 + [order][order]
 *     "Starting with the next player, each other player chooses a unit you don't control that hasn't been
 *      chosen for this spell. Kill those units."
 *   × Baron Nashor (unl-147-219) · Unit · Chaos · 10 · 12 Might
 *     "As you play me, add the Baron Pit battlefield token … I enter there. I can't be chosen by enemy spells
 *      and abilities. Other friendly units have +2 [Might]."
 *   × Not So Fast (sfd-045-221) · Spell · Calm · 2 + [calm] · "[Reaction] Counter an enemy spell or ability
 *     that chooses a friendly unit or gear."
 *
 * Question: 1v1, P1's turn. P2's only unit is Baron Nashor (at the Baron Pit); P2 holds Not So Fast with
 * exactly 2 energy + [calm]. P1 plays King's Edict. (a) Is Baron offered/excluded anywhere while P1 plays it?
 * (b) Can P2 respond with Not So Fast? (c) On resolution, can P2 avoid picking Baron? (d) Same with Baron + a
 * vanilla Recruit on P2's side.
 *
 * Rules: 355.10.e (a set chosen by OTHER players does not target — the caster chooses nothing), 355.8 (a spell
 * needs valid targets to go on the chain), 355.9.a.2 ("spell or ability" = an object on the chain), 355.9.b
 * (Not So Fast's target must be an enemy spell that CHOOSES a friendly unit/gear), 757/758 ("can't be chosen
 * by ENEMY spells" is untargetability relative to the chooser — it does not shield Baron from his own
 * controller's resolution-time choice, which is not the spell choosing at all).
 *
 * Expected: (a) no unit prompt for P1 at all; the play is legal (6 + [order][order] paid) although the only
 * enemy unit is untargetable. (b) No — King's Edict chooses nothing, so it is not a legal Not So Fast target;
 * with nothing else on the chain P2 cannot play it and can only pass. (c) P2 (the next player) must choose a
 * unit P1 doesn't control: the pool is exactly {Baron}; no "may", no decline → Baron is chosen and killed →
 * P2's trash; the Baron Pit token stays on the board. (d) P2 — not P1 — is prompted with {Baron, Recruit} and
 * may pick the Recruit; only the Recruit dies.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KINGS_EDICT = "ogn-237-298";
const BARON_NASHOR = "unl-147-219";
const NOT_SO_FAST = "sfd-045-221";
const BARON_PIT = "unl-t01";

/**
 * P1's turn with exactly King's Edict's cost; P1 has one vanilla unit (so "a unit you don't control" has
 * something to exclude). P2: Baron Nashor at the Baron Pit token battlefield, Not So Fast in hand with exactly
 * 2 energy + [calm]. `recruit` adds a vanilla 1-Might Recruit to P2's base (contrast d).
 */
function board(opts: { recruit?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 6, power: { order: 2 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("pit", { controller: P2, def: BARON_PIT, inert: false })
    .unit(P1, "base", { might: 2, name: "P1 Soldier" }, "mine")
    .unit(P2, "pit", BARON_NASHOR, "baron")
    .hand(P1, KINGS_EDICT, "edict")
    .hand(P2, NOT_SO_FAST, "nsf");
  return opts.recruit ? s.unit(P2, "base", { might: 1, name: "Recruit", tags: ["Recruit"] }, "recruit") : s;
}

/** P1 casts King's Edict and both players pass priority once each, so it resolves (stops at whatever it asks). */
async function edictResolves(game: Game): Promise<void> {
  await game.p1.cast("edict");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "edict", controller: P1 })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("King's Edict × Baron Nashor ('can't be chosen by enemy spells') × Not So Fast", () => {
  // ---- (a) playing it -----------------------------------------------------------------------------------

  test("(a) King's Edict targets nothing: P1's cast option has NO unit field — Baron is neither offered nor excluded — and the play is legal, paying 6 + [order][order] (355.10.e)", async () => {
    const game = await board().build();
    expect(game.state("baron").keywords).toContain("Untargetable"); // the untargetability is live
    expect(game.p1.can("cast", "edict")).toBe(true);
    const fields = game.p1.option("cast", "edict")?.fields ?? [];
    expect(fields.find((f) => f.name === "targets" || f.arg === "targets")).toBeUndefined();
    await game.p1.cast("edict");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "edict", controller: P1, triggered: false })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    // No prompt of any kind for P1 between the cast and priority.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // ---- (b) Not So Fast ------------------------------------------------------------------------------------

  test("(b) with only King's Edict on the chain, Not So Fast has no legal target (the Edict CHOOSES nothing) — not offered to P2, the play is rejected, P2 can only pass (355.8, 355.9.a.2, 355.9.b)", async () => {
    const game = await board().build();
    await game.p1.cast("edict");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "nsf")).toBe(false);
    expect(game.p2.option("cast", "nsf")).toBeUndefined();
    expect((await game.p2.try((p) => p.cast("nsf", { targets: "edict" }))).ok).toBe(false);
    expect((await game.p2.try((p) => p.cast("nsf"))).ok).toBe(false);
    expect(game.p2.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 1 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["edict"]);
  });

  // ---- (c) resolution with Baron as P2's only unit ---------------------------------------------------------

  // Expected: P2's resolution-time choice is made by P2, not by the enemy spell, so "can't be chosen by enemy
  // spells" (757/758) does not remove Baron from the pool; the pool is exactly {Baron}, there is no "may", so
  // Baron is chosen (asked-and-forced, or locked without asking) and killed.
  test("(c) on resolution P2 must choose from exactly {Baron} with no decline — Baron Nashor is killed and goes to P2's trash (355.10.e vs 757/758)", async () => {
    const game = await board().build();
    await edictResolves(game);
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.seat).toBe(P2);
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["baron"]);
      expect(d.allowDecline).toBe(false);
      expect((await game.p2.try((p) => p.decline())).ok).toBe(false);
      await game.p2.pick("baron");
    }
    await game.settle();
    expect(game.zoneOf("edict")).toBe("trash");
    expect(game.zoneOf("baron")).toBe("trash");
    expect(game.p2.trash()).toContain("baron");
    expect(game.p2.units()).toEqual([]);
  });

  test("(c) the Baron Pit battlefield TOKEN remains on the board after King's Edict resolves (only units are killed); Edict → P1's trash; Not So Fast never left P2's hand", async () => {
    const game = await board().build();
    await edictResolves(game);
    await game.settle();
    expect(game.zoneOf("edict")).toBe("trash");
    expect(game.p1.trash()).toContain("edict");
    expect(game.battlefields()).toContain("pit");
    expect(game.findAll({ defId: BARON_PIT, zone: "battlefieldRow" })).toEqual(["pit"]);
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 1 } });
    expect(game.zoneOf("mine")).toBe("base"); // "a unit you don't control" — P1's own unit is never in the pool
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ---- (d) Baron + Recruit ---------------------------------------------------------------------------------

  // Expected: P2 is asked to choose among ALL of P2's units — {Baron, Recruit} — Baron is a legal (if unwise)
  // pick for his own controller, so with two candidates a real prompt goes to P2.
  test("(d) with Baron + Recruit it is P2 (not P1) who is prompted, and the offered set is exactly {Baron, Recruit} (355.10.e; 757 is chooser-relative)", async () => {
    const game = await board({ recruit: true }).build();
    await edictResolves(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["baron", "recruit"]);
    expect(d?.kind === "pick" ? d.allowDecline : undefined).toBe(false);
  });

  test("(d) P2 may pick the Recruit: only the Recruit dies, Baron stays at the Pit, P1's unit untouched; P1 was never asked anything", async () => {
    const game = await board({ recruit: true }).script(P2, ["recruit"]).build();
    expect(game.state("recruit").might).toBe(3); // Baron's "+2 to other friendly units" is on
    await game.p1.cast("edict");
    // From the cast to the end of resolution no prompt is ever addressed to P1 other than priority.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.seat === P1) {
        expect(d).toMatchObject({ context: "chain", kind: "action" });
      }
      if (d.kind === "action") {
        await game.acting().passPriority();
      } else {
        await game.settle(); // consumes P2's scripted "recruit"
      }
    }
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.p2.trash()).toContain("recruit");
    expect(game.zoneOf("baron")).toBe("battlefield-pit");
    expect(game.state("baron").damage).toBe(0);
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.zoneOf("edict")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(d) control: Not So Fast is STILL illegal with Baron + Recruit on board — the Recruit is chosen by P2 at resolution, never by the enemy spell (355.9.b)", async () => {
    const game = await board({ recruit: true }).build();
    await game.p1.cast("edict");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "nsf")).toBe(false);
    expect((await game.p2.try((p) => p.cast("nsf", { targets: "edict" }))).ok).toBe(false);
    expect(game.zoneOf("nsf")).toBe("hand");
  });
});
