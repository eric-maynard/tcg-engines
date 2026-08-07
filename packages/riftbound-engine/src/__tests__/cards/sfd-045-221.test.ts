/**
 * Not So Fast — sfd-045-221 · Spell · Calm · 2 energy + [calm] · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Counter an enemy spell or ability that chooses a friendly unit or gear.
 *
 * Rules: 813 ([Reaction] timing — may be added to a chain whenever you hold priority); 355.9.a.2
 * ("spell or ability" = an item on the chain); 355.9.b (both "enemy" and "friendly" are read
 * relative to Not So Fast's controller); 355.8 (no legal target on the chain → cannot be played
 * at all); 355.5 (a triggered ability chooses as it resolves — it still "chooses" prospectively);
 * 425.1.a (a countered item does nothing and is cleared; a countered ABILITY leaves its source
 * permanent alone and paid costs stay paid); chain resolves LIFO.
 *
 * Head-judge corner cases considered:
 *   - enemy spell at MY unit → legal; enemy spell at THEIR OWN unit → not legal ("friendly");
 *   - enemy spell that chooses my GEAR (Detonate) → legal via the gear branch; the follow-up
 *     "its controller draws 2" must not happen either;
 *   - enemy TRIGGERED ability ("When you play me, stun a unit") → counterable while on the chain;
 *     the unit that carried it stays on the board;
 *   - my own spell is never "enemy"; a spell that chooses nothing (draw) is never legal; an
 *     empty chain means Not So Fast is simply unplayable even on my turn (355.8);
 *   - Not So Fast chooses a SPELL, not a unit → the opponent's own Not So Fast cannot answer it,
 *     but Defy (counter a cheap spell) can: 3-item chain resolves LIFO and the original spell
 *     then lands;
 *   - cost: 2 + [calm] deducted on cast; 1 energy or no calm → not offered;
 *   - priority: only the priority holder may react (312.1) — P2 must wait for P1 to pass after
 *     P1's own cast (337.1.a: finalizing does not pass priority; the caster keeps it).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-045-221";
const VOID_SEEKER = "ogn-024-298"; // Action spell, 3+fury: Deal 4 to a unit at a battlefield. Draw 1.
const CLEAVE = "ogn-004-298"; // 1 energy: give a unit Assault 3 this turn (any unit)
const DETONATE = "sfd-005-221"; // 1+fury: Kill a gear. Its controller draws 2.
const SHIELDBEARER = "ogn-051-298"; // 3-cost unit: When you play me, stun a unit.
const DEFY = "ogn-045-298"; // Reaction 1+calm: Counter a spell that costs no more than [4] and no more than [rainbow].
const HEART = "sfd-052-221"; // Heart of Dark Ice — a plain gear to aim Detonate at
const FLURRY = "ogn-133-298"; // Reaction, 1 energy: Deal 1 to all units at battlefields (chooses nothing)
const DISCIPLINE = "ogn-058-298"; // Reaction, 2 energy: Give a unit +2 Might this turn. Draw 1.

function board(p2Energy = 2, p2Calm = 1) {
  return scenario()
    .resources(P1, { energy: 8, power: { calm: 1, fury: 2 } })
    .resources(P2, { energy: p2Energy, power: { calm: p2Calm } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "bf1", { might: 5, name: "P1 Bruiser" }, "mine")
    .unit(P2, "bf1", { might: 5, name: "P2 Bruiser" }, "theirs")
    .gear(P2, HEART, "theirGear")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P2, CARD, "nsf");
}

describe("Not So Fast (sfd-045-221)", () => {
  test("cost + Reaction timing: on P1's turn, in response to Void Seeker at P2's unit, P2 pays 2 energy + 1 calm and NSF stacks on top", async () => {
    const game = await board().build();
    await game.p1.cast("vs", { targets: "theirs" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "nsf")).toBe(true);
    await game.p2.cast("nsf", { targets: "vs" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["vs", "nsf"]);
  });

  test("unaffordable: with 1 energy + calm, or 2 energy and no calm, NSF is not offered even against a legal target", async () => {
    for (const [e, c] of [[1, 1], [2, 0]] as const) {
      const game = await board(e, c).build();
      await game.p1.cast("vs", { targets: "theirs" });
      await game.p1.passPriority();
      expect(game.p2.can("cast", "nsf")).toBe(false);
    }
  });

  test("counters an enemy SPELL that chose a friendly unit: Void Seeker does nothing (no damage, no draw), both spells to trash (425.1.a)", async () => {
    const game = await board().build();
    const p1Deck = game.p1.deck().length;
    await game.p1.cast("vs", { targets: "theirs" });
    await game.p1.passPriority();
    await game.p2.cast("nsf", { targets: "vs" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("theirs").damage).toBe(0);
    expect(game.p1.deck()).toHaveLength(p1Deck);
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("trash");
  });

  test("priority — right after P1 casts (before passing) P1 still holds priority (337.1.a), so P2 must NOT yet be offered Not So Fast (312.1)", async () => {
    // Expected: P2's menu has no playSpell until P1 passes. Actual: the Reaction is enumerated for
    // P2 immediately (harness invariant singleDecisionCursor also flags it).
    const game = await board().build();
    await game.p1.cast("vs", { targets: "theirs" });
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.can("cast", "nsf")).toBe(false);
    expect(game.violations()).toEqual([]);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "nsf")).toBe(true);
  });

  test("counters an enemy spell that chose a friendly GEAR: Detonate is countered — the gear survives and nobody draws 2", async () => {
    const game = await board().hand(P1, DETONATE, "det").build();
    const p2Deck = game.p2.deck().length;
    await game.p1.cast("det", { targets: "theirGear" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "nsf")).toBe(true);
    const targets = game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options;
    expect(targets).toEqual([["det"]]);
    await game.p2.cast("nsf", { targets: "det" });
    await game.settle();
    expect(game.zoneOf("theirGear")).toBe("base");
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.zoneOf("det")).toBe("trash");
  });

  test("counters an enemy triggered ABILITY that would choose a unit (Solari Shieldbearer's stun): nothing is stunned, the Shieldbearer itself stays", async () => {
    const game = await board().hand(P1, SHIELDBEARER, "solari").build();
    await game.p1.play("solari", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "solari", triggered: true })]);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "nsf")).toBe(true);
    await game.p2.cast("nsf", { targets: "solari" });
    await game.settle({ policy: "first" }); // if the stun prompt still appeared, "first" would stun something
    expect(game.zoneOf("solari")).toBe("base");
    expect(game.state("theirs").isStunned).toBe(false);
    expect(game.state("mine").isStunned).toBe(false);
    expect(game.state("solari").isStunned).toBe(false);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  test("NOT legal: the enemy spell chose the ENEMY's own unit ('friendly' is relative to NSF's controller, 355.9.b)", async () => {
    const game = await board().hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "mine" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "nsf")).toBe(false);
    const r = await game.p2.try((p) => p.cast("nsf", { targets: "cleave" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 1 } });
  });

  test("NOT legal: an enemy spell that chooses nothing (Flurry of Blades hits 'all units') and an empty chain (own turn) — not playable (355.8)", async () => {
    const game = await board().hand(P1, FLURRY, "flurry").build();
    await game.p1.cast("flurry");
    await game.p1.passPriority();
    expect(game.chain().map((i) => i.cardId)).toEqual(["flurry"]);
    expect(game.p2.can("cast", "nsf")).toBe(false);
    await game.settle();
    expect(game.state("theirs").damage).toBe(1); // it really resolved un-countered
    const ownTurn = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { calm: 1 } })
      .unit(P2, "base", { might: 2 }, "u")
      .hand(P2, CARD, "nsf")
      .build();
    expect(ownTurn.chain()).toEqual([]);
    expect(ownTurn.p2.can("cast", "nsf")).toBe(false);
  });

  test("NOT legal: your OWN spell is never an 'enemy spell' — P1 holding NSF cannot counter P1's Cleave on P2's unit… nor P1's Void Seeker on P1's unit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { calm: 1, fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "bf1", { might: 5 }, "mine")
      .unit(P2, "bf1", { might: 5 }, "theirs")
      .hand(P1, VOID_SEEKER, "vs")
      .hand(P1, CARD, "myNsf")
      .build();
    await game.p1.cast("vs", { targets: "mine" }); // friendly unit chosen, but by a FRIENDLY spell
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "myNsf")).toBe(false);
  });

  test("NSF chooses a SPELL, not a unit: P1's own Not So Fast cannot answer P2's Not So Fast", async () => {
    const game = await board().hand(P1, CARD, "p1Nsf").build();
    await game.p1.cast("vs", { targets: "theirs" });
    await game.p1.passPriority();
    await game.p2.cast("nsf", { targets: "vs" });
    expect(game.actingSeat()).toBe(P2); // 337.1.a / 337.4 — the player who added the item keeps priority
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "p1Nsf")).toBe(false);
    await game.settle();
    expect(game.state("theirs").damage).toBe(0);
  });

  test("…but Defy can: Void Seeker → NSF → Defy(NSF) resolves LIFO — NSF is countered, Void Seeker then deals 4 and draws", async () => {
    const game = await board().hand(P1, DEFY, "defy").build();
    const p1Deck = game.p1.deck().length;
    await game.p1.cast("vs", { targets: "theirs" });
    await game.p1.passPriority();
    await game.p2.cast("nsf", { targets: "vs" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "defy")).toBe(true);
    await game.p1.cast("defy", { targets: "nsf" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["vs", "nsf", "defy"]);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 0, fury: 1 } }); // 3+fury, then 1+calm
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("theirs").damage).toBe(4);
    expect(game.p1.deck()).toHaveLength(p1Deck - 1); // Void Seeker's "Draw 1" happened
  });

  test("two enemy spells on the chain (Void Seeker at P2's unit, then Discipline at P1's own unit): countering Void Seeker leaves Discipline to resolve", async () => {
    const game = await board().hand(P1, DISCIPLINE, "disc").build();
    await game.p1.cast("vs", { targets: "theirs" });
    await game.p1.cast("disc", { targets: "mine" }); // Reaction — legal on top of P1's own spell
    expect(game.chain().map((i) => i.cardId)).toEqual(["vs", "disc"]);
    await game.p1.passPriority();
    await game.p2.cast("nsf", { targets: "vs" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["vs", "disc", "nsf"]);
    await game.settle();
    expect(game.state("mine").might).toBe(7); // Discipline resolved (+2 this turn)
    expect(game.state("theirs").damage).toBe(0); // Void Seeker countered
    expect(game.p1.hand()).toHaveLength(1); // only Discipline's draw, not Void Seeker's
  });

  test("with [Void Seeker→P2's unit, Discipline→P1's unit] on the chain only Void Seeker may be chosen — Discipline chose an ENEMY unit (355.9.b / 355.8)", async () => {
    // Expected: the target list is exactly [vs] and casting at disc is refused. Actual: disc is
    // enumerated as a valid variant, the cast is accepted and paid, and NSF then fizzles on resolution.
    const game = await board().hand(P1, DISCIPLINE, "disc").build();
    await game.p1.cast("vs", { targets: "theirs" });
    await game.p1.cast("disc", { targets: "mine" });
    await game.p1.passPriority();
    const targets = game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options;
    expect(targets).toEqual([["vs"]]);
    const r = await game.p2.try((p) => p.cast("nsf", { targets: "disc" }));
    expect(r.ok).toBe(false);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 1 } });
  });

  test("parsed ability: a reaction-timed counter whose target is an ENEMY chain item choosing a FRIENDLY unit or gear", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "calm", energyCost: 2, powerCost: ["calm"], timing: "reaction" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: {
        target: {
          controller: "enemy",
          filter: { chooses: { controller: "friendly", types: ["unit", "gear"] } },
          type: "spell-or-ability",
        },
        type: "counter",
      },
      timing: "reaction",
      type: "spell",
    });
  });
});
