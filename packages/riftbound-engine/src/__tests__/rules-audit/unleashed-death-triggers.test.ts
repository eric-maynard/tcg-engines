/**
 * Rules Audit: Death triggers & Deathknell (Unleashed)
 *
 * Covers:
 *   - Rule 813 (Deathknell, glossary §809-ish in 2026-03-30 / "[Deathknell] —
 *     [Text]" = "When I die, get the effect"): the parser emits Deathknell as
 *     a `{ type: "keyword", keyword: "Deathknell", effect }` entry; the engine
 *     synthesizes a real `triggered` ability on the `die` event so it fires in
 *     play.
 *   - Rule 540.x / "when I die" self-triggers: a unit that has just died (and
 *     moved to the trash) still fires its own on-death triggered abilities.
 *   - "When ANOTHER unit dies" / enemy-/friendly-units `die` triggers fire from
 *     board cards as normal.
 *   - Integration: a unit killed during the Combat Damage Step fires its
 *     Deathknell via `resolveFullCombat`.
 *
 * Methodology: minimal state -> one input (a `die` event, or a combat move) ->
 * assert the rules-correct side effect (the Deathknell/death effect ran).
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  applyMove,
  createBattlefield,
  createCard,
  createMinimalGameState,
  fireTrigger,
  getCardMeta,
  getCardsInZone,
  passChainPriority,
} from "./helpers";

// A Deathknell that deals 1 damage to the dying unit itself (observable on
// The card's `damage` meta even after it has moved to the trash).
const DEATHKNELL_SELF_DAMAGE = {
  effect: { amount: 1, target: { type: "self" }, type: "damage" },
  keyword: "Deathknell",
  type: "keyword" as const,
};

// A board ability: "When an enemy unit dies, [I take 1 damage]."
const ON_ENEMY_DIE_SELF_DAMAGE = {
  effect: { amount: 1, target: { type: "self" }, type: "damage" },
  trigger: { event: "die", on: "enemy-units" },
  type: "triggered" as const,
};

// -----------------------------------------------------------------------------
// Rule 813: [Deathknell] — [Text] synthesizes a "when I die" triggered ability.
// -----------------------------------------------------------------------------

describe("Rule 813: Deathknell synthesizes a 'when I die' triggered ability", () => {
  it("a dying unit with [Deathknell] fires its carried effect from the trash", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // The unit has already died: it sits in the trash. (Cleanup moves a
    // Lethally-damaged unit to the trash *before* the die event fires.)
    createCard(engine, "carrion", {
      abilities: [DEATHKNELL_SELF_DAMAGE],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "trash",
    });

    const fired = fireTrigger(engine, { cardId: "carrion", owner: P1, type: "die" });
    expect(fired).toBe(1);
    // Side effect: the Deathknell's "deal 1 to self" landed on the trashed card.
    expect(getCardMeta(engine, "carrion")?.damage ?? 0).toBe(1);
  });

  it("does NOT fire for a non-die event", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "carrion", {
      abilities: [DEATHKNELL_SELF_DAMAGE],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "trash",
    });
    const fired = fireTrigger(engine, { playerId: P1, type: "end-of-turn" });
    expect(fired).toBe(0);
    expect(getCardMeta(engine, "carrion")?.damage ?? 0).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Rule 540.x: a trashed (just-died) card only contributes its OWN self-die
// Triggers — it does not fire board-presence ("any unit"/"enemy") triggers
// From the graveyard.
// -----------------------------------------------------------------------------

describe("Rule 540.x: trashed cards only fire self-scoped die triggers", () => {
  it("a unit in the trash does not fire its 'when an enemy unit dies' trigger", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // A card with an enemy-die trigger sitting in the trash (already dead).
    createCard(engine, "watcher-corpse", {
      abilities: [ON_ENEMY_DIE_SELF_DAMAGE],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "trash",
    });
    // An enemy unit dies.
    createCard(engine, "enemy", {
      cardType: "unit",
      might: 1,
      owner: P2,
      zone: "trash",
    });

    const fired = fireTrigger(engine, { cardId: "enemy", owner: P2, type: "die" });
    expect(fired).toBe(0);
    expect(getCardMeta(engine, "watcher-corpse")?.damage ?? 0).toBe(0);
  });

  it("the same trigger DOES fire while the card is on the board", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "watcher", {
      abilities: [ON_ENEMY_DIE_SELF_DAMAGE],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "enemy", {
      cardType: "unit",
      might: 1,
      owner: P2,
      zone: "trash",
    });

    const fired = fireTrigger(engine, { cardId: "enemy", owner: P2, type: "die" });
    expect(fired).toBe(1);
    expect(getCardMeta(engine, "watcher")?.damage ?? 0).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// Rule 540.x: "when I die" plain triggered abilities (not Deathknell) also fire
// From the trash.
// -----------------------------------------------------------------------------

describe("Rule 540.x: a 'when I die' (on: self) triggered ability fires from the trash", () => {
  it("fires the carried effect for the dying unit", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "phoenix", {
      abilities: [
        {
          effect: { amount: 1, target: { type: "self" }, type: "damage" },
          trigger: { event: "die", on: "self" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      might: 4,
      owner: P1,
      zone: "trash",
    });
    const fired = fireTrigger(engine, { cardId: "phoenix", owner: P1, type: "die" });
    expect(fired).toBe(1);
    expect(getCardMeta(engine, "phoenix")?.damage ?? 0).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// Integration (rule 604.x Combat Damage + 813 Deathknell): a unit killed in
// Combat fires its Deathknell after moving to the trash.
// -----------------------------------------------------------------------------

describe("Integration: Deathknell fires for a unit killed in combat", () => {
  it("resolveFullCombat fires the dying defender's Deathknell", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    // Attacker: 5 might (survives the 2 it takes back).
    createCard(engine, "attacker", {
      cardType: "unit",
      might: 5,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    // Defender: 2 might + Deathknell "deal 1 to self". Takes 5 -> dies.
    createCard(engine, "defender", {
      abilities: [DEATHKNELL_SELF_DAMAGE],
      cardType: "unit",
      might: 2,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    // Defender died -> moved to trash.
    expect(getCardsInZone(engine, "trash", P2)).toContain("defender");
    // Deathknell fired after combat damage was applied: the real engine routes
    // Counter writes through `meta.__counters` (operations-impl), so the
    // Defender's `damage` counter is the 5 it took in combat PLUS the 1 its
    // Own Deathknell ("deal 1 to self") dealt. (The death cleanup only resets
    // `meta.damage`, not `meta.__counters.damage`, so we can still see both.)
    const defenderMeta = getCardMeta(engine, "defender") as
      | { __counters?: Record<string, number> }
      | undefined;
    expect(defenderMeta?.__counters?.damage ?? 0).toBe(6);
    // Attacker survived.
    expect(getCardsInZone(engine, "battlefield-bf-1", P1)).toContain("attacker");
  });
});

// -----------------------------------------------------------------------------
// Rule 520 (kill units with damage >= might) via NON-combat damage: a spell
// `damage` effect routes through the `__counters.damage` bag in the real
// Engine. `performCleanup` historically only read `meta.damage`, so spell
// Damage never killed units (and therefore never fired their `die` triggers).
// `performCleanup` now reads max(meta.damage, __counters.damage), so spell
// Kills happen and on-death triggers fire.
// -----------------------------------------------------------------------------

describe("Rule 520: spell damage kills units and fires their die triggers", () => {
  it("a damage spell that deals lethal damage moves the target to the trash and fires its Deathknell", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P2 });
    // Enemy unit: 2 might + Deathknell "deal 1 to self" (observable post-mortem).
    createCard(engine, "grunt", {
      abilities: [DEATHKNELL_SELF_DAMAGE],
      cardType: "unit",
      might: 2,
      owner: P2,
      zone: "battlefield-bf-1",
    });
    // P1's spell: deal 3 to an enemy unit (lethal vs the 2-might grunt).
    createCard(engine, "lightning", {
      abilities: [
        {
          effect: { amount: 3, target: { controller: "enemy", type: "unit" }, type: "damage" },
          type: "spell",
        },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });

    const played = applyMove(engine, "playSpell", { cardId: "lightning", playerId: P1 });
    expect(played.success).toBe(true);
    // Resolve the chain: active player passes, then the opponent passes -> the
    // Top item resolves and the post-resolution cleanup runs (rule 543.3/520).
    passChainPriority(engine, P1);
    passChainPriority(engine, P2);

    // The grunt took lethal spell damage -> killed, moved to trash (rule 520).
    expect(getCardsInZone(engine, "trash", P2)).toContain("grunt");
    expect(getCardsInZone(engine, "battlefield-bf-1", P2)).not.toContain("grunt");
    // Its Deathknell fired after it hit the trash: the 3 spell damage plus the
    // 1 from "deal 1 to self" => __counters.damage === 4. (Death cleanup
    // Resets `meta.damage` and now also clears `__counters.damage`; the
    // Deathknell's self-damage lands afterward.)
    const gruntMeta = getCardMeta(engine, "grunt") as
      | { __counters?: Record<string, number>; damage?: number }
      | undefined;
    expect(gruntMeta?.__counters?.damage ?? 0).toBe(1);
  });

  it("a damage spell below the target's might does NOT kill it", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P2 });
    createCard(engine, "bruiser", {
      cardType: "unit",
      might: 5,
      owner: P2,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "spark", {
      abilities: [
        {
          effect: { amount: 2, target: { controller: "enemy", type: "unit" }, type: "damage" },
          type: "spell",
        },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });
    applyMove(engine, "playSpell", { cardId: "spark", playerId: P1 });
    passChainPriority(engine, P1);
    passChainPriority(engine, P2);
    // 2 < 5 => survives.
    expect(getCardsInZone(engine, "battlefield-bf-1", P2)).toContain("bruiser");
    expect(getCardsInZone(engine, "trash", P2)).not.toContain("bruiser");
  });
});

// -----------------------------------------------------------------------------
// Rule 540.x via the sandbox counter/buff moves: `addDamage` / `addCounter` /
// `modifyBuff` change a card's combat math; a change that brings a unit's
// Damage >= its might must run state-based cleanup AND fire the unit's `die`
// Triggers (Deathknell etc.) — previously these moves either ran no cleanup
// (`addDamage`) or ran cleanup without firing death triggers.
// -----------------------------------------------------------------------------

describe("Rule 540.x: sandbox counter/buff moves fire die triggers on a state-based kill", () => {
  it("`addDamage` of lethal amount kills the unit and fires its Deathknell", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    // 2-might unit + Deathknell "deal 1 to self" (observable post-mortem).
    createCard(engine, "grunt", {
      abilities: [DEATHKNELL_SELF_DAMAGE],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "addDamage", { amount: 2, cardId: "grunt" });

    // Lethal damage (2 >= 2) → state-based kill → moved to trash.
    expect(getCardsInZone(engine, "trash", P1)).toContain("grunt");
    expect(getCardsInZone(engine, "battlefield-bf-1", P1)).not.toContain("grunt");
    // Deathknell fired: the 2 damage from `addDamage` + the 1 from "deal 1 to
    // Self" land on the `__counters.damage` bag (death cleanup resets
    // `meta.damage` and `__counters.damage`, then the Deathknell adds 1).
    const meta = getCardMeta(engine, "grunt") as
      | { __counters?: Record<string, number> }
      | undefined;
    expect(meta?.__counters?.damage ?? 0).toBe(1);
  });

  it("`addDamage` below the unit's might does NOT kill it (no die trigger)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "bruiser", {
      abilities: [DEATHKNELL_SELF_DAMAGE],
      cardType: "unit",
      might: 5,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "addDamage", { amount: 2, cardId: "bruiser" });

    // 2 < 5 → survives, stays on the battlefield, Deathknell has not fired.
    expect(getCardsInZone(engine, "battlefield-bf-1", P1)).toContain("bruiser");
    expect(getCardsInZone(engine, "trash", P1)).not.toContain("bruiser");
    const meta = getCardMeta(engine, "bruiser") as
      | { __counters?: Record<string, number> }
      | undefined;
    // Only the 2 sandbox damage — no extra Deathknell self-damage.
    expect(meta?.__counters?.damage ?? 0).toBe(2);
  });

  it("`addCounter` with counterType 'damage' of lethal amount kills the unit and fires its Deathknell", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "scout", {
      abilities: [DEATHKNELL_SELF_DAMAGE],
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "addCounter", { cardId: "scout", counterType: "damage", delta: 3 });

    expect(getCardsInZone(engine, "trash", P1)).toContain("scout");
    const meta = getCardMeta(engine, "scout") as
      | { __counters?: Record<string, number> }
      | undefined;
    expect(meta?.__counters?.damage ?? 0).toBe(1); // Deathknell's "deal 1 to self"
  });

  it("`modifyBuff` runs cleanup-and-fire-deaths (a unit already at lethal damage is killed and fires its Deathknell)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    // 2-might unit. We seed damage that stays lethal even after the +1 buff
    // (3 >= 2+1) directly on its `__counters.damage` bag (so no prior cleanup
    // Ran), leaving it un-reaped; the cleanup pass that `modifyBuff` triggers
    // Must kill it and fire its Deathknell.
    createCard(engine, "primed", {
      abilities: [DEATHKNELL_SELF_DAMAGE],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    const internal = engine as unknown as {
      internalState: { cardMetas: Record<string, Record<string, unknown>> };
    };
    const meta = internal.internalState.cardMetas["primed"] ?? {};
    (meta as { __counters?: Record<string, number> }).__counters = { damage: 3 };
    internal.internalState.cardMetas["primed"] = meta;

    // The +1 buff brings effective Might to 3; 3 damage is still lethal. The
    // Cleanup-and-fire-deaths pass runs after the buff is applied.
    applyMove(engine, "modifyBuff", { cardId: "primed", deltaMight: 1 });

    expect(getCardsInZone(engine, "trash", P1)).toContain("primed");
    const after = getCardMeta(engine, "primed") as
      | { __counters?: Record<string, number> }
      | undefined;
    expect(after?.__counters?.damage ?? 0).toBe(1); // Deathknell's "deal 1 to self"
  });
});
