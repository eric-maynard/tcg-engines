/**
 * MULTIPLAYER — priority, teams and player removal with more than two seats.
 *
 * Every defect this file pins has the same shape: engine code that assumed
 * exactly two players, or that "the other player" is one well-defined seat.
 * With two seats the wrong answer and the right answer coincide, which is why
 * none of it showed up until three- and four-seat games were played.
 *
 *  - PRIORITY (rules 336-340): a chain item resolves only after EVERY player
 *    in turn order has passed. Priority is a turn-order construct; it is not
 *    the showdown's Relevant-Player list (rule 462, the participants) and it
 *    is not Focus (rule 347.2.b) — inside a showdown the two rotations run at
 *    the same time and can sit on different seats.
 *  - TEAMS (rules 489.8 / 740.1.a): a teammate is friendly, never an opponent
 *    and never an enemy — for the Final Point's "every battlefield scored"
 *    check (471.1.b.1 + 489.8.b), for "enemy unit" targeting, and for the
 *    destinations a move may pick. Control is still never shared (489.8.c).
 *  - REMOVAL (rules 651-652): a conceding player's battlefield is REPLACED by
 *    a token battlefield in the same slot rather than dropped, and the seats
 *    that remain keep playing with Focus, Priority and the turn resuming at
 *    the seat AFTER the one that left (652.5.a.1 / 652.5.b.1 / 652.5.c.1).
 *
 * Sibling ruling files: `cards/rulings/ffa-focus-turn-order-874744f03bfaa101`,
 * `cards/rulings/team-conquest-810b179d872001d3`,
 * `cards/rulings/token-not-played-91af2468caa0cf8c`,
 * `cards/rulings/charm-bcd85efd39649dcd`.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, P3, P4, scenario } from "../../harness";

/** [Action] +1 Might — something cheap to put on the chain from any seat. */
const RALLY = {
  abilities: [
    {
      effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

/** [Reaction] deal 1 to an ENEMY unit — the targeting side of "not a teammate". */
const SNIPE = {
  abilities: [
    {
      effect: { amount: 1, target: { controller: "enemy", type: "unit" }, type: "damage" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Snipe",
  rulesText: "[Reaction] Deal 1 to an enemy unit.",
  timing: "reaction",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const chainSeat = (game: Game) => game.gameState.interaction?.chain?.activePlayer;

describe("rules 336-340 — chain priority walks every seat in turn order", () => {
  /** Three seats, nobody in combat: a plain chain in the neutral-open state. */
  const threeSeatsNoShowdown = () =>
    scenario({ players: 3 })
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .hand(P1, RALLY, "a1");

  test("3P, no showdown at all: the item survives the first two passes and resolves on the third", async () => {
    const game = await threeSeatsNoShowdown().build();
    await game.p1.cast("a1", { targets: "mine" });
    expect(game.chain()).toHaveLength(1);
    expect(chainSeat(game)).toBe(P1);

    await game.p1.passPriority();
    expect(game.chain()).toHaveLength(1);
    expect(chainSeat(game)).toBe(P2);

    await game.p2.passPriority();
    // The seat that was skipped before the fix. Nothing about this chain
    // involves P3 — that is exactly the point of rules 336-340.
    expect(game.chain()).toHaveLength(1);
    expect(chainSeat(game)).toBe(P3);

    await game.seat(P3).passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("mine").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("3P: the third seat may actually ACT on the priority it now receives", async () => {
    const game = await threeSeatsNoShowdown()
      .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
      .hand(P3, SNIPE, "s3")
      .build();
    await game.p1.cast("a1", { targets: "mine" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.seat(P3).can("cast", "s3")).toBe(true);
    await game.seat(P3).cast("s3", { targets: "theirs" });
    // Adding to the chain re-opens the round: two items, priority back on P3.
    expect(game.chain()).toHaveLength(2);
    expect(chainSeat(game)).toBe(P3);
  });

  test("4P: all four seats pass before the item resolves, in turn order", async () => {
    const game = await scenario({ players: 4 })
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .hand(P1, RALLY, "a1")
      .build();
    await game.p1.cast("a1", { targets: "mine" });
    const seen: (string | undefined)[] = [chainSeat(game)];
    for (const seat of [P1, P2, P3] as const) {
      await game.seat(seat).passPriority();
      seen.push(chainSeat(game));
      expect(game.chain()).toHaveLength(1);
    }
    expect(seen).toEqual([P1, P2, P3, P4]);
    await game.seat(P4).passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("mine").might).toBe(3);
  });

  test("4P: teammates are not exempt — an ALLY still has to pass before the item resolves", async () => {
    const game = await scenario({ players: 4 })
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .hand(P1, RALLY, "a1")
      .build();
    expect(game.gameState.teams).toEqual({ [P1]: 0, [P2]: 1, [P3]: 0, [P4]: 1 });
    await game.p1.cast("a1", { targets: "mine" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    // P3 is P1's teammate. Priority is not a team resource (489.8.c).
    expect(chainSeat(game)).toBe(P3);
    expect(game.chain()).toHaveLength(1);
  });

  /**
   * Three seats mid-combat. P1 contests P2's bf1 with a raider; P3 has no unit
   * there and is not a participant of the showdown (rule 462) — but is still a
   * player, so both rotations must reach them.
   */
  const threeSeatsInShowdown = () =>
    scenario({ players: 3 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf3", { controller: P3 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P3, "bf3", { might: 4, name: "Onlooker" }, "onlooker")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, RALLY, "a1");

  test("in a showdown, priority and Focus are different rotations and sit on different seats", async () => {
    const game = await threeSeatsInShowdown().build();
    await game.p1.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1 });

    await game.p1.cast("a1", { targets: "raider" });
    // Focus stays with the player who opened the chain while the chain runs;
    // priority is the rotation that is moving.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(chainSeat(game)).toBe(P3);
    expect(game.chain()).toHaveLength(1);

    await game.seat(P3).passPriority();
    expect(game.chain()).toEqual([]);
    // rule 346 — the chain emptied inside the showdown, so Focus moves on one.
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
  });

  test("the showdown's participant list does NOT narrow priority (rule 462 vs 336-340)", async () => {
    const game = await threeSeatsInShowdown().build();
    await game.p1.move("raider", "bf1");
    // A combat showdown's Relevant Players are the two combatants...
    expect(showdown(game)?.relevantPlayers).toEqual([P1, P2]);
    await game.p1.cast("a1", { targets: "raider" });
    // ...while the chain's are every seat in the game.
    expect(game.gameState.interaction?.chain?.relevantPlayers).toEqual([P1, P2, P3]);
  });

  test("2P is unchanged: one pass each still resolves the item", async () => {
    const game = await scenario()
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .hand(P1, RALLY, "a1")
      .build();
    await game.p1.cast("a1", { targets: "mine" });
    await game.p1.passPriority();
    expect(game.chain()).toHaveLength(1);
    expect(chainSeat(game)).toBe(P2);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("mine").might).toBe(3);
  });
});

describe("rules 489.8 / 740.1.a — a teammate is not an opponent", () => {
  /** 2v2: P1+P3 vs P2+P4 (Magma Chamber seating). */
  const twoVsTwo = () => scenario({ players: 4 });

  test("targeting: an 'enemy unit' spell is not offered a teammate's unit", async () => {
    const game = await twoVsTwo()
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .unit(P3, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P4, "base", { might: 2, name: "OtherFoe" }, "foe2")
      .hand(P1, SNIPE, "s1")
      .build();
    const offered = (
      (game.p1.option("cast", "s1")?.fields.find((f) => f.arg === "targets")?.options as
        | string[][]
        | undefined) ?? []
    )
      .map((o) => o[0])
      .sort();
    expect(offered).toEqual(["foe", "foe2"]);
    expect(offered).not.toContain("ally");
  });

  test("targeting in a FREE-FOR-ALL (`teams: false`): every other seat is an enemy again", async () => {
    const game = await scenario({ players: 4, teams: false })
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .unit(P3, "base", { might: 2, name: "Third" }, "third")
      .hand(P1, SNIPE, "s1")
      .build();
    const offered = (
      (game.p1.option("cast", "s1")?.fields.find((f) => f.arg === "targets")?.options as
        | string[][]
        | undefined) ?? []
    )
      .map((o) => o[0])
      .sort();
    expect(offered).toEqual(["foe", "third"]);
  });

  test("battlefield control is never shared, teammate or not (489.8.c)", async () => {
    const game = await twoVsTwo()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf3", { controller: P3 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P3, "bf3", { might: 2, name: "AllyHolder" }, "allyholder")
      .build();
    expect(game.p1.battlefields({ controlled: true })).toEqual(["bf1"]);
    expect(game.seat(P3).battlefields({ controlled: true })).toEqual(["bf3"]);
    expect(game.gameState.battlefields.bf3?.controller).toBe(P3);
  });

  test("the ally case from ruling bcd85efd39649dcd stays fixed: a teammate's battlefield is not a legal destination", async () => {
    const game = await twoVsTwo()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P4 })
      .unit(P2, "bf1", { might: 2, name: "Victim" }, "victim")
      .unit(P4, "bf2", { might: 1, name: "Mate" }, "mate")
      .hand(P1, "ogn-043-298", "charm") // Charm — "Move an enemy unit."
      .build();
    await game.p1.cast("charm", { targets: "victim" });
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    // P2 and P4 are allies, so bf2 is not somewhere P2's unit may be sent.
    expect(keys).not.toContain("battlefield-bf2");
  });

  test("Final Point (471.1.b.1 + 489.8.b): an ally's battlefield is ignored by 'every battlefield scored this turn'", async () => {
    const game = await twoVsTwo()
      .turn(4)
      .active(P1)
      .victoryScore(11)
      .points(P1, 9)
      .battlefield("bfA", { controller: null })
      .battlefield("bfB", { controller: P2 })
      .battlefield("bfC", { controller: P3 }) // P1's TEAMMATE holds this one
      .unit(P2, "bfB", { might: 1, name: "Picket" }, "picket")
      .unit(P3, "bfC", { might: 2, name: "AllyHolder" }, "allyholder")
      .unit(P1, "base", { might: 5, name: "Vanguard" }, "u1")
      .unit(P1, "base", { might: 5, name: "Rearguard" }, "u2")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .build();
    await game.p1.move("u1", "bfA");
    await game.settle();
    await game.settle();
    expect(game.p1.points()).toBe(10);

    const handBefore = game.p1.hand().length;
    await game.p1.move("u2", "bfB");
    await game.settle();
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.hand().length).toBe(handBefore); // no 471.1.b consolation draw
    expect(game.p1.points()).toBe(11);
    expect(game.isOver()).toBe(true);
    expect(game.seat(P3).points()).toBe(0); // the ally never rides along
  });

  test("Final Point still bites for a battlefield an OPPONENT holds", async () => {
    const game = await twoVsTwo()
      .turn(4)
      .active(P1)
      .victoryScore(11)
      .points(P1, 9)
      .battlefield("bfA", { controller: null })
      .battlefield("bfB", { controller: P2 })
      .battlefield("bfC", { controller: P4 }) // an OPPONENT's, so it counts
      .unit(P2, "bfB", { might: 1, name: "Picket" }, "picket")
      .unit(P4, "bfC", { might: 2, name: "FoeHolder" }, "foeholder")
      .unit(P1, "base", { might: 5, name: "Vanguard" }, "u1")
      .unit(P1, "base", { might: 5, name: "Rearguard" }, "u2")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .build();
    await game.p1.move("u1", "bfA");
    await game.settle();
    await game.settle();
    const handBefore = game.p1.hand().length;
    await game.p1.move("u2", "bfB");
    await game.settle();
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(10); // no winning point
    expect(game.p1.hand().length).toBe(handBefore + 1); // the 471.1.b draw instead
    expect(game.isOver()).toBe(false);
  });
});

describe("rules 651-652 — a player concedes and the rest keep playing", () => {
  test("652.2.a: the conceding player's battlefield is replaced by a token battlefield in the same slot", async () => {
    const game = await scenario({ players: 3 })
      .battlefield("bf1", { owner: P1 })
      .battlefield("bf3", { controller: P3, owner: P3 })
      .unit(P3, "bf3", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 2, name: "Thug" }, "thug")
      .build();
    expect(game.state("bf3").isToken).toBe(false);

    await game.seat(P3).concede();
    await game.settle();

    expect(game.isOver()).toBe(false); // two seats remain, so 651.2 runs
    expect(game.has("bf3")).toBe(true); // 652.2.b — the slot stays
    expect(game.state("bf3").isToken).toBe(true); // …as a token with no abilities
    expect(game.gameState.battlefields.bf3?.controller).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  test("652.1: the conceding player's units are gone but the other seats' boards are untouched", async () => {
    const game = await scenario({ players: 3 })
      .battlefield("bf1", { owner: P1 })
      .battlefield("bf3", { controller: P3, owner: P3 })
      .unit(P3, "bf3", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 2, name: "Thug" }, "thug")
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .build();
    await game.seat(P3).concede();
    await game.settle();
    expect(game.zoneOf("guard")).not.toBe("bf3");
    expect(game.zoneOf("thug")).toBe("base");
    expect(game.zoneOf("mine")).toBe("base");
  });

  test("651.2 in a 2v2: one seat conceding leaves three players and a live member on each team", async () => {
    const game = await scenario({ players: 4 })
      .battlefield("bf2", { controller: P2, owner: P2 })
      .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
      .unit(P4, "base", { might: 2, name: "Mate" }, "mate")
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .build();
    await game.seat(P2).concede();
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.gameState.removedPlayers).toEqual([P2]);
    // P4 is still on team 1, so the team is not eliminated with its member.
    expect(game.zoneOf("mate")).toBe("base");
    expect(game.state("bf2").isToken).toBe(true);
    expect(game.gameState.battlefields.bf2?.controller).toBeNull();
  });

  test("652.5.c: a seat that concedes mid-chain stops being waited on, and priority resumes AFTER them", async () => {
    const game = await scenario({ players: 4 })
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .hand(P1, RALLY, "a1")
      .build();
    await game.p1.cast("a1", { targets: "mine" });
    await game.p1.passPriority();
    expect(chainSeat(game)).toBe(P2);

    await game.p2.concede();
    // 652.5.c.1 — the NEXT seat in order, not the head of the list.
    expect(chainSeat(game)).toBe(P3);
    expect(game.chain()).toHaveLength(1);

    await game.seat(P3).passPriority();
    expect(game.chain()).toHaveLength(1);
    await game.seat(P4).passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("mine").might).toBe(3);
  });

  test("652.5.c: a chain opened AFTER the concession never seats the player who left", async () => {
    const game = await scenario({ players: 4 })
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .hand(P1, RALLY, "a1")
      .build();
    await game.p2.concede();
    await game.p1.cast("a1", { targets: "mine" });
    expect(game.gameState.interaction?.chain?.relevantPlayers).toEqual([P1, P3, P4]);
    await game.p1.passPriority();
    expect(chainSeat(game)).toBe(P3);
    await game.seat(P3).passPriority();
    await game.seat(P4).passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("mine").might).toBe(3);
  });

  test("2P is unchanged: a concession ends the game at once and the opponent wins (651.1)", async () => {
    const game = await scenario().build();
    await game.p2.concede();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});

describe("rules 740.1.a / 489.8.e — the flat trigger `on` strings read teams too", () => {
  /** "When an opponent plays a unit, draw 1." — the `on: "opponent"` branch. */
  const WATCHER = {
    abilities: [
      {
        effect: { amount: 1, type: "draw" },
        trigger: { event: "play-unit", on: "opponent" },
        type: "triggered",
      },
    ],
    cardType: "unit",
    domain: "mind",
    energyCost: 0,
    might: 2,
    name: "Test Watcher",
    rulesText: "When an opponent plays a unit, draw 1.",
  } as const;

  const VANILLA = "ogn-175-298";

  const watcherBoard = (opts: { teams?: false } = {}) =>
    scenario({ players: 4, ...(opts.teams === false ? { teams: false as const } : {}) })
      .unit(P1, "base", WATCHER, "watcher")
      .deck(P1, [VANILLA, VANILLA, VANILLA], ["d1", "d2", "d3"]);

  test("an ALLY playing a unit is not an opponent playing one — no draw", async () => {
    const game = await watcherBoard()
      .active(P3)
      .resources(P3, { energy: 3, power: { body: 3 } })
      .hand(P3, VANILLA, "u3")
      .build();
    const before = game.p1.hand().length;
    await game.seat(P3).play("u3");
    await game.settle();
    expect(game.p1.hand().length).toBe(before); // P3 is P1's teammate
  });

  test("an OPPONENT playing a unit still fires it", async () => {
    const game = await watcherBoard()
      .active(P2)
      .resources(P2, { energy: 3, power: { body: 3 } })
      .hand(P2, VANILLA, "u2")
      .build();
    const before = game.p1.hand().length;
    await game.p2.play("u2");
    await game.settle();
    expect(game.p1.hand().length).toBe(before + 1);
  });

  test("in a FREE-FOR-ALL the same seat IS an opponent — the change is team-scoped, not a blanket narrowing", async () => {
    const game = await watcherBoard({ teams: false })
      .active(P3)
      .resources(P3, { energy: 3, power: { body: 3 } })
      .hand(P3, VANILLA, "u3")
      .build();
    const before = game.p1.hand().length;
    await game.seat(P3).play("u3");
    await game.settle();
    expect(game.p1.hand().length).toBe(before + 1);
  });

  test("2P is unchanged: the only other seat is an opponent", async () => {
    const game = await scenario()
      .active(P2)
      .unit(P1, "base", WATCHER, "watcher")
      .deck(P1, [VANILLA, VANILLA], ["d1", "d2"])
      .resources(P2, { energy: 3, power: { body: 3 } })
      .hand(P2, VANILLA, "u2")
      .build();
    const before = game.p1.hand().length;
    await game.p2.play("u2");
    await game.settle();
    expect(game.p1.hand().length).toBe(before + 1);
  });
});
