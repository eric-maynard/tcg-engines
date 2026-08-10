/**
 * Ruling 8a9319a9ced6d544 — Whirlwind (OGN-187 → ogn-187-298, [3][chaos] "Starting with the next player, each player
 *   may return a unit to its owner's hand.") × King's Edict (OGN-237 → ogn-237-298, [6][order][order] "Starting with
 *   the next player, each other player chooses a unit you don't control that hasn't been chosen for this spell. Kill
 *   those units.") × Baron Nashor (UNL-147 → unl-147-219, 12 Might, "I can't be chosen by enemy spells and abilities.")
 *
 * Q: Can Whirlwind or King's Edict hit Baron?
 * A: Yes, both. Neither spell targets — PLAYERS make choices during resolution (355.10.e), which is not "being chosen
 *    by an enemy spell". In a 1v1, King's Edict means the opponent must pick Baron and he dies.
 * Rules: 355.10.e (player choices at resolution are not targeting), 757 / 355.9.b ("can't be chosen").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WHIRLWIND = "ogn-187-298";
const KINGS_EDICT = "ogn-237-298";
const BARON = "unl-147-219";
const CHARM = "ogn-043-298"; // "Move an enemy unit." — a TARGETING enemy spell, for contrast

/** P1's turn; P2's Baron Nashor stands at P2's bf1 (his only unit); P1 has an Ally in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", BARON, "baron")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally");
}

describe("Ruling 8a9319a9ced6d544 — Baron's 'can't be chosen by enemy spells' does not stop Whirlwind or King's Edict (player choices, not targeting)", () => {
  test("contrast: a targeting enemy spell (Charm) cannot choose Baron at all", async () => {
    const game = await board().resources(P1, { energy: 1, power: { calm: 1 } }).hand(P1, CHARM, "charm").build();
    expect(game.state("baron").keywords).toContain("Untargetable");
    const r = await game.p1.try((p) => p.cast("charm", { targets: "baron" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("charm")).toBe("hand");
  });

  test("Whirlwind: nothing is chosen on cast; on resolution P2 (next player) chooses first and may decline, then P1 may choose Baron — he returns to P2's hand", async () => {
    const game = await board().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, WHIRLWIND, "ww").build();
    expect(game.p1.option("cast", "ww")?.fields.map((f) => f.arg) ?? []).not.toContain("targets"); // no play-time target
    await game.p1.cast("ww");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", controller: P1 })]);
    await game.acting().passPriority();
    await game.acting().passPriority();
    // "Starting with the next player": P2 decides first
    const d2 = game.decision();
    expect(d2).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "ww" } });
    expect(d2?.kind === "pick" ? d2.allowDecline : undefined).toBe(true); // "may"
    await game.p2.decline();
    // then P1 — and Baron IS a legal choice for the enemy player resolving the spell
    const d1 = game.decision();
    expect(d1).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "ww" } });
    const offered = d1?.kind === "pick" ? d1.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("baron");
    expect(offered).toContain("ally"); // "a unit" — any unit
    await game.p1.pick("baron");
    await game.settle();
    expect(game.zoneOf("baron")).toBe("hand");
    expect(game.p2.hand()).toContain("baron");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("King's Edict: the OPPONENT (P2) is the one who chooses 'a unit you don't control' — Baron is a legal choice for that player; picking him kills him", async () => {
    const game = await board()
      .unit(P2, "base", { might: 1, name: "Minion" }, "minion")
      .resources(P1, { energy: 6, power: { order: 2 } })
      .hand(P1, KINGS_EDICT, "edict")
      .build();
    expect(game.p1.option("cast", "edict")?.fields.map((f) => f.arg) ?? []).not.toContain("targets");
    await game.p1.cast("edict");
    await game.acting().passPriority();
    await game.acting().passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "edict" } });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["baron", "minion"]); // Baron included; P1's Ally never eligible
    expect(d?.kind === "pick" ? d.allowDecline : undefined).toBe(false); // "chooses" — compulsory
    await game.p2.pick("baron");
    await game.settle();
    expect(game.zoneOf("baron")).toBe("trash");
    expect(game.zoneOf("minion")).toBe("base");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.zoneOf("edict")).toBe("trash");
  });

  test("King's Edict in a 1v1 with Baron as P2's ONLY unit: P2 simply must pick Baron — he is killed", async () => {
    const game = await board().resources(P1, { energy: 6, power: { order: 2 } }).hand(P1, KINGS_EDICT, "edict").build();
    await game.p1.cast("edict");
    await game.acting().passPriority();
    await game.acting().passPriority();
    const d = game.decision();
    if (d?.kind === "pick") {
      // asked as a forced single option …
      expect(d).toMatchObject({ seat: P2, source: { cardId: "edict" } });
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["baron"]);
      await game.p2.pick("baron");
    } // … or locked by the engine as the only legal choice — either way:
    await game.settle();
    expect(game.zoneOf("baron")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.zoneOf("edict")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
