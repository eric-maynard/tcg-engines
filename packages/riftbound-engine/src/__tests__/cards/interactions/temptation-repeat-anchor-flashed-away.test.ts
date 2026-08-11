/**
 * Interaction: Temptation (sfd-129-221) · Spell · Chaos · 2 · [Repeat] [2]
 *     "Move an enemy unit to a location where there's a unit with the same controller."
 *   × Shipyard Skulker (ogn-175-298) · Unit · Chaos · 3 · 3 Might (vanilla — the unit being moved)
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 + [chaos] · [Reaction] — "Move up to 2 friendly units to base."
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 · 2 Might — "[Deflect]"
 *
 * Question: P1 casts Temptation with the Repeat cost paid. P2 has Shipyard Skulker at bfA, a second unit
 * at bfB and a unit in P2's base; P1 has units at bfC and in P1's base.
 *   (a) What is the exact DESTINATION option set for moving Skulker — is bfC offered? P1's base? P2's
 *       base? bfA itself?
 *   (b) Are both executions' targets and destinations chosen up front or one at a time — and can P1 move
 *       Skulker to bfB and then back to bfA with the repeat?
 *   (c) P2 reacts with Flash, pulling the bfB unit home. What happens to the queued move(s) at
 *       resolution?
 *   (d) How is a [Deflect] enemy unit costed if P1 chooses it for BOTH executions?
 *
 * Expected: the destination restriction is set by the source (449.1) and reads relative to the MOVED
 * unit's controller, not the caster: offered = locations other than Skulker's current one that contain a
 * unit controlled by P2 = {bfB, P2's base}. bfC is ABSENT (only P1's units there), P1's base is ABSENT (a
 * unit is only ever present in its own controller's base), and bfA is ABSENT as Skulker's current
 * location (355.4.a). P2's base being legal is the easy one to miss.
 *   Sequencing: [Repeat] executes the effect a second time (820.1.b) but it is ONE spell — every target
 * and every destination for BOTH executions is chosen at finalization, before anything moves (355.4,
 * 355.5). So P1 cannot move Skulker bfA → bfB and then bfB → bfA: at the moment of choosing, Skulker's
 * current location is bfA for both executions, and a unit's current location is never a valid
 * destination. P1 must pick a distinct legal pair up front.
 *   Flash in response: destination legality is re-checked as each instruction executes. With P2's bfB
 * unit pulled home, bfB no longer contains a unit controlled by Skulker's controller, so THAT move
 * instruction has become impossible and is ignored (359.3.e.6) while the other execution still runs and
 * the spell is still considered played (359.3.e.10) — the caster does NOT get to re-choose a new
 * destination, because destinations were locked at finalization (355.15).
 *   [Deflect]: the tax is per CHOOSING, so naming the same Deflect unit for both executions costs the
 * Deflect value TWICE, payable at finalization or the second execution's choice is not available
 * (809.1.c, 357.3).
 *   Finally, the moved unit is NOT exhausted — only a Standard Move exhausts (144.2, 420.3.a).
 *
 * Rules: 355.4 / 355.4.a (a Move Destination is chosen for EACH move when the card is played; a valid
 * location is one other than the unit's current location), 355.5 (choices of game objects are made now),
 * 355.15 (choices are not re-made), 449.1 (the source states the destination restriction), 820.1.b
 * ([Repeat] executes the effect a second time), 359.3.e.6 (instructions that can't be followed are
 * ignored), 359.3.e.10 (the spell is still played), 809.1.c ([Deflect] costs extra Power for EACH time
 * they choose it), 357.3 (costs may not be paid in a way that deterministically produces illegal choices
 * later), 144.2 (exhausting is the cost of a Standard Move — an effect-driven move is not one).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEMPTATION = "sfd-129-221";
const SKULKER = "ogn-175-298";
const FLASH = "ogs-011-024";
const POUTY_PORO = "ogn-013-298";

/**
 * P1's turn 2, Neutral Open. P2: Shipyard Skulker at bfA, Outpost at bfB, Homebody in P2's base.
 * P1: Ally at bfC, Reserve in P1's base. `energy` = 2 (plain) or 4 (Repeat paid).
 */
function board(energy = 4) {
  return scenario()
    .resources(P1, { energy })
    .resources(P2, { energy: 4, power: { chaos: 2 } }) // enough for Flash
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: P1 })
    .unit(P2, "bfA", SKULKER, "skulker")
    .unit(P2, "bfB", { might: 2, name: "Outpost" }, "outpost")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "bfC", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 2, name: "Reserve" }, "reserve")
    .hand(P1, TEMPTATION, "tempt")
    .hand(P2, FLASH, "flash");
}

/** The keys of the open destination pick (empty when the current decision is not one). */
function destinationsOffered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" && (d as PickDecision).semantics === "destination" ? (d as PickDecision).options.map((o) => o.key) : [];
}

describe("Temptation [Repeat] — destination legality, up-front choices, a Flashed-away anchor and a doubled Deflect", () => {
  // ---- (a) the destination option set --------------------------------------------------------------

  test("(a) moving Skulker offers EXACTLY P2's base and bfB — never bfC (only P1's units there), never bfA (its own current location, 355.4.a, 449.1)", async () => {
    const game = await board(2).build();
    await game.p1.cast("tempt", { targets: "skulker" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect([...destinationsOffered(game)].sort()).toEqual(["base", "battlefield-bfB"]);
    expect(destinationsOffered(game)).not.toContain("battlefield-bfA");
    expect(destinationsOffered(game)).not.toContain("battlefield-bfC");
  });

  test("(a) P2's BASE really is a legal destination — Skulker can be pushed home to stand next to Homebody", async () => {
    const game = await board(2).build();
    await game.p1.cast("tempt", { targets: "skulker" });
    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    expect(game.locationOf("skulker")).toBe("base");
    expect(game.state("skulker")).toMatchObject({ controller: P2, owner: P2 });
    expect(game.p2.units("base").sort()).toEqual(["home", "skulker"]);
    expect(game.zoneOf("tempt")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(a) the restriction reads relative to the MOVED unit's controller, not the caster: only P2's units are targetable at all, and pushing Homebody out of base offers bfA and bfB but never P1's bfC", async () => {
    const game = await board(2).build();
    const targets = game.p1.option("cast", "tempt")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["skulker"], ["outpost"], ["home"]]));
    expect(targets).not.toContainEqual(["ally"]);
    expect(targets).not.toContainEqual(["reserve"]);

    await game.p1.cast("tempt", { targets: "home" });
    await game.settle();
    expect([...destinationsOffered(game)].sort()).toEqual(["battlefield-bfA", "battlefield-bfB"]);
  });

  test("the moved unit is NOT exhausted — only a Standard Move costs exhaustion (144.2, 420.3.a)", async () => {
    const game = await board(2).build();
    await game.p1.cast("tempt", { targets: "skulker" });
    await game.settle();
    await game.p1.pick("battlefield-bfB");
    await game.settle();
    expect(game.locationOf("skulker")).toBe("bfB");
    expect(game.state("skulker").isExhausted).toBe(false);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 }); // joined its own side
  });

  // ---- (b) one spell, choices made up front ---------------------------------------------------------

  test("(b) [Repeat] is one spell: 4 energy total and exactly ONE (non-triggered) chain item carrying both chosen units (820.1.b, 820.3.a)", async () => {
    const game = await board(4).build();
    expect(game.p1.option("cast", "tempt")?.fields.find((f) => f.arg === "repeat")?.max).toBe(1);
    await game.p1.cast("tempt", { repeat: 1, targets: ["skulker", "home"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "tempt", controller: P1, triggered: false });
  });

  // BUG: rules 355.4 / 355.5 put EVERY move destination of the spell — one per execution — in the
  // "make choices" step of playing it, before priority is passed and before anything moves.
  // Actual: the engine carries no destinations on the chain item and raises a `choose-destination`
  // pick with `timing: "RES"` as each execution runs (source.pendingChoiceType === "choose-destination").
  test("both destinations must be chosen when the spell is PLAYED (timing FIN, before priority passes) — the engine asks one at a time at resolution (355.4, 355.5)", async () => {
    const game = await board(4).build();
    await game.p1.cast("tempt", { repeat: 1, targets: ["skulker", "home"] });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
  });

  // BUG: with both destinations chosen while Skulker still stands at bfA, bfA is never a valid
  // destination for either execution (355.4.a) — the round trip bfA → bfB → bfA is impossible.
  // Actual: the second destination is asked after the first move has happened, so bfA (where P2's
  // Anchor still stands) is offered and Skulker can be walked straight back.
  test("no round trip — the second execution must not offer bfA, because at the moment of choosing Skulker's location is bfA for BOTH executions (355.4.a, 355.5)", async () => {
    const game = await board(4).unit(P2, "bfA", { might: 1, name: "Anchor" }, "anchor").build();
    await game.p1.cast("tempt", { repeat: 1, targets: ["skulker", "skulker"] });
    await game.settle();
    expect([...destinationsOffered(game)].sort()).toEqual(["base", "battlefield-bfB"]);
    await game.p1.pick("battlefield-bfB");
    await game.settle();
    expect(destinationsOffered(game)).not.toContain("battlefield-bfA");
  });

  // ---- (c) P2 Flashes the anchor away ---------------------------------------------------------------

  test("(c) Flash is a legal Reaction while Temptation is on the chain, and it resolves first — Outpost is home before Temptation executes (340.1)", async () => {
    const game = await board(2).battlefield("bfD", { controller: P2 }).unit(P2, "bfD", { might: 1, name: "Watcher" }, "watcher").build();
    await game.p1.cast("tempt", { targets: "skulker" });
    await game.p1.pick("battlefield-bfB"); // 355.4 — the destination is named as the spell is PLAYED
    await game.p1.passPriority();
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: ["outpost"] });
    expect(game.chain().map((i) => i.cardId)).toEqual(["tempt", "flash"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.locationOf("outpost")).toBe("base");
    expect(game.zoneOf("tempt")).not.toBe("trash"); // Temptation has not resolved yet
  });

  // BUG: the destination was chosen when Temptation was played (355.4/355.5) and choices are not
  // re-made (355.15). If P2's Flash makes it illegal, that instruction is simply ignored (359.3.e.6);
  // the caster is never handed a fresh menu. Actual: destinations are asked at resolution, so with
  // bfD still holding a P2 unit the engine offers P1 a brand-new choice after the Flash.
  test("after Flash removes the anchor at the chosen destination the caster must NOT be offered a new destination — the choice was locked at finalization (355.15, 359.3.e.6)", async () => {
    const game = await board(2).battlefield("bfD", { controller: P2 }).unit(P2, "bfD", { might: 1, name: "Watcher" }, "watcher").build();
    await game.p1.cast("tempt", { targets: "skulker" });
    await game.p1.pick("battlefield-bfB"); // the anchor Flash is about to remove
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["outpost"] });
    await game.settle();
    expect(destinationsOffered(game)).toEqual([]);
  });

  test("(c) whatever happens to the individual move instruction, the spell is still considered played and reaches the trash (359.3.e.10)", async () => {
    const game = await board(2).build();
    await game.p1.cast("tempt", { targets: "skulker" });
    await game.p1.pick("battlefield-bfB"); // the anchor Flash is about to remove
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["outpost"] });
    await game.settle();
    expect(game.locationOf("outpost")).toBe("base");
    expect(game.zoneOf("tempt")).toBe("trash");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ---- (d) [Deflect] is taxed per choosing -----------------------------------------------------------

  test("(d) naming the same [Deflect] unit for BOTH executions costs the Deflect value TWICE (809.1.c): with one [rainbow] the pair is not even offered and is rejected, while naming it once is fine", async () => {
    function deflectBoard(rainbow: number) {
      return scenario()
        .resources(P1, { energy: 4, power: { rainbow } })
        .battlefield("bfA", { controller: P2 })
        .battlefield("bfB", { controller: P2 })
        .unit(P2, "bfA", POUTY_PORO, "poro")
        .unit(P2, "bfB", { might: 2, name: "Outpost" }, "outpost")
        .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
        .hand(P1, TEMPTATION, "tempt");
    }
    const one = await deflectBoard(1).build();
    expect(one.state("poro").keywords).toContain("Deflect");
    const offered = one.p1.option("cast", "tempt")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect(offered).not.toContainEqual(["poro", "poro"]); // 357.3 — the second choosing could not be paid for
    expect(offered).toContainEqual(["poro", "home"]);
    const doubled = await one.p1.try((p) => p.cast("tempt", { repeat: 1, targets: ["poro", "poro"] }));
    expect(doubled.ok).toBe(false);

    const single = await deflectBoard(1).build();
    await single.p1.cast("tempt", { repeat: 1, targets: ["poro", "home"] });
    expect(single.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // 4 energy + ONE rainbow
  });

  test("(d) with two [rainbow] in the pool the doubled choosing is legal and BOTH pips are spent", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { rainbow: 2 } })
      .battlefield("bfA", { controller: P2 })
      .battlefield("bfB", { controller: P2 })
      .unit(P2, "bfA", POUTY_PORO, "poro")
      .unit(P2, "bfB", { might: 2, name: "Outpost" }, "outpost")
      .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
      .hand(P1, TEMPTATION, "tempt")
      .build();
    await game.p1.cast("tempt", { repeat: 1, targets: ["poro", "poro"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toHaveLength(1);
  });
});
