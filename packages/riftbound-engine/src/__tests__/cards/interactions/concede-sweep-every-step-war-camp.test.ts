/**
 * Interaction: Trifarian War Camp (ogn-294-298) · Battlefield · "Units here have +1 [Might]."
 *   × Tianna Crownguard (sfd-060-221) · Unit · Calm · [7] · 4 Might
 *     "[Deflect] … While I'm at a battlefield, opponents can't gain points."
 *   × Void Seeker (ogn-024-298) · Spell · Fury · [3]+[fury] · "[Action] — Deal 4 to a unit at a
 *     battlefield. Draw 1."
 *
 * Rules: 650 (a player may concede at ANY time — priority, Focus and who owns the open Decision are all
 * irrelevant), 651 / 651.1 (the conceder is removed; if only one other player remains, that player WINS),
 * 652 (the Removal-of-a-Player steps run only "if the game continues"), 652.2.c (a removed battlefield's
 * continuous effects cease immediately — the CR's own example is literally "Units here have +1 [M]"),
 * 652.4 (counter all spells and abilities controlled by the conceder), 196 (the game ends when a player
 * wins), 358.5 (an abandoned action is abandoned whole), 319.6 / 319.7 (cleanup after a board change).
 *
 * Question: concede P2 at EVERY step of a scripted game — before and after each move, mid-prompt,
 * mid-chain, while the opponent holds priority, during combat damage assignment, and at the turn
 * boundary. P2 owns Trifarian War Camp, controls Tianna Crownguard at a battlefield, and has a Void
 * Seeker on the chain. P1 stands on 3 points.
 *   (a) Is the concede accepted from a seat holding neither priority nor the open Decision?
 *   (b) Does P2's battlefield leave the game with its +1 [Might] ceasing immediately — and can that
 *       retroactively kill an already-damaged unit?
 *   (c) Are P2's chain items countered, or do they resolve first?
 *   (d) Does P1 win even though Tianna's "opponents can't gain points" was live and P1 stands on 3?
 *   (e) Is every resulting end-state invariant-clean?
 *
 * Expected: (a) yes at every fork (650). (d) yes — 651.1 is not a point gain, so Tianna is irrelevant:
 * P1 wins on 3, immediately (196). (e) empty decision cursor, no violations, no turn-counter drift.
 * (b)/(c) are 652 steps, which by 652's own wording run only when the game CONTINUES — so they are
 * exercised in a three-seat game below, where P2's removal leaves two players. There the Void Seeker is
 * correctly countered and P2's permanents leave the game, but the War Camp is NOT removed and its +1
 * [Might] keeps propping up a lethally damaged unit — see the BUG facets.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, P3, scenario } from "../../../harness";
import type { Game, Seat } from "../../../harness";

const WAR_CAMP = "ogn-294-298";
const TIANNA = "sfd-060-221";
const VOID_SEEKER = "ogn-024-298";

/**
 * bfCamp is P2's contributed battlefield (War Camp) holding P2's Camper and P1's already-damaged
 * Wounded (2 Might + 1 from the Camp, 2 damage — alive only because of the Camp).
 */
function board(active: Seat, players: 2 | 3 = 2) {
  return scenario({ players })
    .active(active)
    .victoryScore(8)
    .points(P1, 3)
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bfCamp", { controller: P2, def: WAR_CAMP, inert: false, owner: P2 })
    .battlefield("bfB", { controller: P1, owner: P1 })
    .battlefield("bfC", { controller: P2, owner: P2 })
    .unit(P2, "bfCamp", { might: 2, name: "Camper" }, "camper")
    .unit(P1, "bfCamp", { might: 2, name: "Wounded" }, "wounded", { damage: 2 })
    .unit(P1, "bfB", { might: 2, name: "DefA" }, "defA")
    .unit(P1, "bfB", { might: 2, name: "DefB" }, "defB")
    .unit(P1, "bfB", { might: 2, name: "DefC" }, "defC")
    .unit(P2, "bfC", TIANNA, "tianna")
    .unit(P2, "bfC", { might: 2, name: "Grunt1" }, "grunt1")
    .unit(P2, "bfC", { might: 2, name: "Grunt2" }, "grunt2")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 5, name: "Striker" }, "striker")
    .hand(P2, VOID_SEEKER, "seeker")
    .autoProcedures(false);
}

async function resolveCombatNow(game: Game): Promise<void> {
  const key = game
    .acting()
    .legal()
    .map((o) => o.key)
    .find((k) => k.startsWith("resolveFullCombat"));
  await game.acting().choose(key!);
}

/** Every fork we concede at: who is the turn player, and how to reach that step. */
const FORKS: {
  name: string;
  active: Seat;
  /** true when P2 holds neither priority nor the open Decision at the fork. */
  p2Idle: boolean;
  reach: (game: Game) => Promise<void>;
}[] = [
  { active: P2, name: "conceder's own open main phase, nothing done yet", p2Idle: false, reach: async () => {} },
  { active: P1, name: "opponent's open main phase — conceder holds neither priority nor the Decision", p2Idle: true, reach: async () => {} },
  {
    active: P2,
    name: "after the conceder moved a unit",
    p2Idle: false,
    reach: async (game) => {
      await game.p2.move("raider", "bfC");
    },
  },
  {
    active: P2,
    name: "mid-chain — the conceder's own Void Seeker is on the chain and they hold priority",
    p2Idle: false,
    reach: async (game) => {
      await game.p2.cast("seeker", { targets: "defA" });
    },
  },
  {
    active: P2,
    name: "mid-chain — the conceder passed and the OPPONENT holds priority",
    p2Idle: true,
    reach: async (game) => {
      await game.p2.cast("seeker", { targets: "defA" });
      await game.p2.passPriority();
    },
  },
  {
    active: P2,
    name: "showdown open at bfB with the conceder holding Focus",
    p2Idle: false,
    reach: async (game) => {
      await game.p2.move("raider", "bfB");
    },
  },
  {
    active: P2,
    name: "showdown closed, combat pending at bfB (damage not yet resolved)",
    p2Idle: false,
    reach: async (game) => {
      await game.p2.move("raider", "bfB");
      await game.p2.passFocus();
      await game.p1.passFocus();
    },
  },
  {
    active: P2,
    name: "mid combat damage assignment — the CONCEDER holds the distribute prompt",
    p2Idle: false,
    reach: async (game) => {
      await game.p2.move("raider", "bfB");
      await game.p2.passFocus();
      await game.p1.passFocus();
      await resolveCombatNow(game);
      expect(game.decision()?.kind).toBe("distribute");
      expect(game.decision()?.seat).toBe(P2);
    },
  },
  {
    active: P1,
    name: "mid combat damage assignment — the OPPONENT holds the distribute prompt",
    p2Idle: true,
    reach: async (game) => {
      await game.p1.move("striker", "bfC");
      await game.p1.passFocus();
      await game.p2.passFocus();
      await resolveCombatNow(game);
      expect(game.decision()?.kind).toBe("distribute");
      expect(game.decision()?.seat).toBe(P1);
    },
  },
  {
    active: P2,
    name: "turn boundary — the conceder has just ended their turn",
    p2Idle: true,
    reach: async (game) => {
      await game.p2.endTurn();
    },
  },
];

describe("Concede sweep × Trifarian War Camp / Tianna / Void Seeker — accepted at every step", () => {
  test("premise: the War Camp is holding Wounded up (2 base + 1 = 3 Might vs 2 damage) and Tianna's point denial is live", async () => {
    const game = await board(P2).build();
    expect(game.state("wounded").baseMight).toBe(2);
    expect(game.state("wounded").staticMightBonus).toBe(1);
    expect(game.state("wounded").might).toBe(3);
    expect(game.state("wounded").damage).toBe(2);
    expect(game.state("tianna").rulesText).toContain("opponents can't gain points");
    expect(game.locationOf("tianna")).toBe("bfC");
  });

  test("premise: Tianna really does deny P1 points — conquering an uncontested battlefield leaves P1 on 3 (054.1)", async () => {
    const game = await scenario()
      .active(P1)
      .victoryScore(8)
      .points(P1, 3)
      .battlefield("bfOpen", { controller: null, owner: P1 })
      .battlefield("bfC", { controller: P2, owner: P2 })
      .unit(P2, "bfC", TIANNA, "tianna")
      .unit(P1, "base", { might: 3, name: "Striker" }, "striker")
      .build();
    await game.p1.move("striker", "bfOpen");
    await game.settle();
    expect(game.gameState.battlefields.bfOpen?.controller).toBe(P1);
    expect(game.p1.points()).toBe(3);
  });

  for (const fork of FORKS) {
    test(`(a)+(d)+(e) concede accepted at: ${fork.name}`, async () => {
      const game = await board(fork.active).build();
      await fork.reach(game);
      const turnBefore = game.turnNumber();
      if (fork.p2Idle) {
        expect(game.actingSeat()).not.toBe(P2);
      }

      // (a) rule 650 — accepted regardless of priority / Focus / who owns the Decision.
      const result = await game.p2.concede();
      expect(result.ok).toBe(true);

      // (d) rule 651.1 — winning because you are the last player left is not a point gain, so
      // Tianna's "opponents can't gain points" never enters into it. P1 wins on 3.
      expect(game.isOver()).toBe(true);
      expect(game.winner()).toBe(P1);
      expect(game.gameState.status).toBe("finished");
      expect(game.p1.points()).toBe(3);

      // (c) in a duel the game does not continue, so nothing of P2's ever resolves: no Void Seeker
      // damage, no Void Seeker draw, no combat damage.
      expect(game.state("defA").damage).toBe(0);
      expect(game.p1.units("bfB").sort()).toEqual(["defA", "defB", "defC"]);

      // (e) rule 196 / 358.5 — no dangling prompt, no half-performed action, no turn drift.
      expect(game.decision()).toBeNull();
      expect(game.actingSeat()).toBeUndefined();
      expect(game.turnNumber()).toBe(turnBefore);
      expect(game.violations()).toEqual([]);
    });
  }

  // ---- 652: what happens when the game CONTINUES (three seats) -------------------------------------

  test("(c) three seats: P2's chain items are COUNTERED — the Void Seeker never deals its 4 and never draws (652.4)", async () => {
    const game = await board(P2, 3).build();
    await game.p2.cast("seeker", { targets: "defA" });
    await game.p2.concede();
    expect(game.isOver()).toBe(false);
    expect(game.chain()[0]?.cardId).toBe("seeker");
    expect(game.chain()[0]?.countered).toBe(true);
    expect(game.state("defA").damage).toBe(0);
    expect(game.seat(P2).hand()).toHaveLength(0);
  });

  test("(b) three seats: every permanent the conceder controlled leaves the game and their battlefield is released (652.1)", async () => {
    const game = await board(P2, 3).build();
    await game.p2.cast("seeker", { targets: "defA" });
    await game.p2.concede();
    expect(game.has("camper")).toBe(false);
    expect(game.has("tianna")).toBe(false);
    expect(game.gameState.battlefields.bfCamp?.controller).toBeNull();
    expect(game.gameState.battlefields.bfC?.controller).toBeNull();
    // The game goes on for the remaining seats.
    expect(game.gameState.status).toBe("playing");
    expect(game.decision()?.seat).toBe(P3);
    expect(game.violations()).toEqual([]);
  });

  test("(b) three seats: the conceder's Trifarian War Camp is REPLACED by an abilityless token battlefield in the same slot (652.2, 652.2.a, 652.2.b)", async () => {
    // rule 652.2.a with 652.2.b and ruling 91af2468caa0cf8c — "remove" here is a REPLACE, and the
    // replacement takes the slot itself: the slot id survives (the units and hidden cards there do
    // not move), the printed War Camp does not — what stands there is a token with no abilities.
    const game = await board(P2, 3).build();
    expect(game.state("bfCamp").isToken).toBe(false);
    await game.p2.concede();
    expect(game.has("bfCamp")).toBe(true);
    expect(game.state("bfCamp").isToken).toBe(true);
    // "with no abilities" is what the token means: nothing here is +1 any more (652.2.c).
    expect(game.state("wounded").staticMightBonus).toBe(0);
  });

  test("(b) three seats: the removed battlefield's continuous +1 [Might] ceases, so an already-lethally-damaged unit dies (652.2.c, 319.6/319.7)", async () => {
    // The CR's own 652.2.c example: with the War Camp gone, Wounded drops to 2 Might with 2 damage
    // marked and dies in the cleanup that follows the board change.
    const game = await board(P2, 3).build();
    await game.p2.concede();
    expect(game.state("wounded").staticMightBonus).toBe(0);
    expect(game.state("wounded").might).toBe(2);
    expect(game.zoneOf("wounded")).toBe("trash");
  });
});
