/**
 * Interaction: Charm (ogn-043-298) · Spell · Calm · 1 + [calm] — "Move an enemy unit."
 *   × Jhin, Murderous Artist (unl-022-219) · Champion Unit · Fury · 4 + [fury] · 4 Might
 *     "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *      [Ganking] (I can move from battlefield to battlefield.)
 *      When I move, [Add] [1][rainbow]. (Abilities that add resources can't be reacted to.)"
 *   × an inline 1 + [fury] [Action] combat trick "Give a unit +3 [Might] this turn" (stand-in for any
 *     cheap Fury Action pump — only its cost and timing matter here).
 *
 * Rules: 809.1.c / 809.1.c.1 (Deflect = mandatory extra Power, any domain, on an OPPONENT's spell that
 * chooses the unit), 166.1 (Added resources go to the CONTROLLING player's pool), 429.2 / 429.2.a
 * (Add abilities resolve as soon as they finalize — no chain item, no priority), 420.3.a (only the
 * Standard Move exhausts), 464.2.c.1 (Attacker = whoever applied Contested — the arriving unit's
 * controller, even on the opponent's turn), 135.2.e.5.b ([rainbow] pays a Power pip of any domain),
 * 317.2.d / 316.3 (every player's pool empties in Expiration and again at the next Beginning),
 * 323.6 (a battlefield emptied of its controller's units in an Open state becomes uncontrolled).
 *
 * Question: P2's turn, Neutral Open. P1's Jhin sits alone at bfA (P1 controls it); P2 holds bfB with a
 * 5-Might unit. P1 pool 0/0, P1's hand: the 1+[fury] Action trick. P2 casts Charm on Jhin → bfB.
 *   (a) With P2 pool = 1 + [calm] only Jhin is NOT offered (Deflect tax unpayable); with 1 + [calm] +
 *       one more power he is, and all three are debited. P1's own spells never pay Deflect for Jhin.
 *   (b) On resolution Jhin moves bfA→bfB and P1 (his controller) — not caster P2 — gets 1 energy +
 *       1 rainbow at once; no chain item / window; Jhin is not exhausted.
 *   (c) Combat at bfB on P2's turn: P1 is the Attacker with Focus; the trick is enumerated for P1 and
 *       payable entirely from the Add (rainbow for the [fury] pip) → Jhin 7 kills the 5, survives, P1
 *       conquers bfB and scores on P2's turn. Without it: 4 into 5 → Jhin dies, bfB stays P2's.
 *   (d) Unspent, P1's floated 1/1 is gone by P1's own Main Phase; bfA went uncontrolled.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const JHIN = "unl-022-219";

/** Inline 1 + [fury] Action pump: "Give a unit +3 [Might] this turn." */
const FURY_TRICK = {
  abilities: [
    {
      effect: { amount: 3, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Fury Trick",
  powerCost: ["fury"],
  rulesText: "[Action] (Play on your turn or in showdowns.)\nGive a unit +3 [Might] this turn.",
  timing: "action",
};

type Pool = { energy: number; power: Record<string, number> };
const EXACT: Pool = { energy: 1, power: { calm: 1 } }; // Charm's printed cost only
const WITH_TAX: Pool = { energy: 1, power: { calm: 1, fury: 1 } }; // + 1 off-domain power for Deflect

/** P2's turn. Jhin (P1) alone at bfA which P1 controls; P2's 5-Might Brute holds bfB. P1: 0/0, trick in hand. */
function board(p2Pool: Pool = WITH_TAX) {
  return scenario()
    .active(P2)
    .resources(P2, p2Pool)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", JHIN, "jhin")
    .unit(P2, "bfB", { might: 5, name: "Brute" }, "brute")
    .hand(P1, FURY_TRICK, "trick")
    .hand(P2, CHARM, "charm");
}

function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const opt = game[seat].option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const bf = (game: Game, id: string) => game.gameState.battlefields[id];

/** P2 casts Charm on Jhin, names bfB as the destination (355.4), both pass → Charm resolves. */
async function charmJhinToBfB(game: Game): Promise<void> {
  await game.p2.cast("charm", { targets: "jhin" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { pendingChoiceType: "choose-destination" } });
  await game.p2.pick("battlefield-bfB");
  expect(game.locationOf("jhin")).toBe("bfA"); // nothing moves until Charm resolves
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("charm")).toBe("trash");
}

describe("Charm × Jhin, Murderous Artist — Deflect tax, whose Add, who attacks on the caster's turn", () => {
  // ── (a) Deflect on an opponent's Charm ───────────────────────────────────────────────────────

  test("(a) with exactly 1 + [calm] P2 cannot Charm Jhin at all — Deflect's extra power is a mandatory cost, so he is not enumerated and the cast is rejected (809.1.c)", async () => {
    const game = await board(EXACT).build();
    expect(game.p2.can("cast", "charm")).toBe(false); // Jhin is the only enemy unit and he is unaffordable
    expect(targetsOffered(game, "p2", "charm")).toEqual([]);
    await expect(game.p2.cast("charm", { targets: "jhin" })).rejects.toThrow();
    expect(game.zoneOf("charm")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } }); // nothing debited
  });

  test("(a) with 1 + [calm] + one power of ANY domain ([fury] here) Jhin is offered, and casting debits all three → P2 pool 0/0 (809.1.c.1)", async () => {
    const game = await board(WITH_TAX).build();
    expect(targetsOffered(game, "p2", "charm")).toEqual(["jhin"]);
    await game.p2.cast("charm", { targets: "jhin" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", controller: P2, targets: ["jhin"], triggered: false })]);
  });

  test("(a) Deflect never taxes Jhin's own controller: P1 targets Jhin with the 1 + [fury] trick for exactly 1 + [fury]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", JHIN, "jhin")
      .hand(P1, FURY_TRICK, "trick")
      .build();
    expect(targetsOffered(game, "p1", "trick")).toEqual(["jhin"]);
    await game.p1.cast("trick", { targets: "jhin" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("jhin").might).toBe(7);
  });

  // ── (b) whose pool receives the Add ─────────────────────────────────────────────────────────

  test("(b) when Charm resolves Jhin moves bfA→bfB and his CONTROLLER P1 receives [1] + [rainbow] immediately; caster P2 gets nothing (166.1, 429.2)", async () => {
    const game = await board().build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await charmJhinToBfB(game);
    expect(game.locationOf("jhin")).toBe("bfB");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    expect(game.turnPlayer()).toBe(P2);
  });

  test("(b) the Add opens no chain item and no priority window — the chain is empty right after Charm resolves and play proceeds straight to the bfB showdown (429.2.a)", async () => {
    const game = await board().build();
    await charmJhinToBfB(game);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("(b) Jhin is NOT exhausted — an effect move is not the Standard Move (420.3.a)", async () => {
    const game = await board().build();
    await charmJhinToBfB(game);
    expect(game.state("jhin").isExhausted).toBe(false);
    expect(game.state("jhin").isReady).toBe(true);
  });

  // ── (c) combat at bfB on P2's turn ──────────────────────────────────────────────────────────

  test("(c) bfB is Contested BY P1 (the arriving unit's controller): on P2's turn P1 is the Attacker and holds Focus, P2's Brute defends (464.2.c.1)", async () => {
    const game = await board().build();
    await charmJhinToBfB(game);
    expect(bf(game, "bfB")).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(showdown(game)).toMatchObject({
      active: true,
      attackingPlayer: P1,
      battlefieldId: "bfB",
      defendingPlayer: P2,
      focusPlayer: P1,
      isCombatShowdown: true,
    });
    expect(game.state("jhin").combatRole).toBe("attacker");
    expect(game.state("brute").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.turnPlayer()).toBe(P2);
  });

  test("(c) with Focus P1's 1 + [fury] Action trick IS enumerated — the pool holds exactly 1 energy + 1 rainbow and rainbow pays the [fury] pip (135.2.e.5.b)", async () => {
    const game = await board().build();
    await charmJhinToBfB(game);
    expect(game.p1.can("cast", "trick")).toBe(true);
    expect(targetsOffered(game, "p1", "trick").sort()).toEqual(["brute", "jhin"]);
    await game.p1.cast("trick", { targets: "jhin" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0); // the rainbow was spent on the [fury] pip
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "trick", controller: P1, targets: ["jhin"] })]);
  });

  test("(c) casting it: Jhin 4+3 = 7 kills the 5-Might Brute and survives (5 < 7); P1 conquers bfB and scores 1 DURING P2's turn; back to P2's open main phase", async () => {
    const game = await board().build();
    await charmJhinToBfB(game);
    await game.p1.cast("trick", { targets: "jhin" });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.state("jhin")).toMatchObject({ damage: 0, zone: "battlefield-bfB" }); // 5 marked, healed after combat
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 0 } });
    expect(game.zoneOf("trick")).toBe("trash");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) NOT casting it: Jhin 4 into Brute 5 → Jhin dies, Brute survives (healed), bfB stays P2's, nobody scores; P1 still floats 1 + [rainbow] for the rest of P2's turn", async () => {
    const game = await board().build();
    await charmJhinToBfB(game);
    await game.settle(); // both pass Focus → combat resolves
    expect(game.zoneOf("jhin")).toBe("trash");
    expect(game.state("brute")).toMatchObject({ damage: 0, zone: "battlefield-bfB" });
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points() + game.p2.points()).toBe(0);
    expect(game.p1.hand()).toEqual(["trick"]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  // ── (d) floated resources and bfA ───────────────────────────────────────────────────────────

  test("(d) bfA, emptied of P1's last unit in an Open state, becomes uncontrolled as soon as Charm resolves (323.6)", async () => {
    const game = await board().build();
    expect(bf(game, "bfA")?.controller).toBe(P1);
    await charmJhinToBfB(game);
    expect(game.p1.units("bfA")).toEqual([]);
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: null });
  });

  test("(d) unspent, the floated 1 + [rainbow] is emptied in P2's Expiration Step / P1's Beginning — P1 starts its own Main Phase at 0 energy / 0 power (317.2.d, 316.3)", async () => {
    const game = await board().build();
    await charmJhinToBfB(game);
    await game.settle(); // decline the trick: combat resolves, Jhin dies
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } }); // still floating on P2's turn
    await game.advanceTurn(); // P2 ends → P1's turn, settled into P1's main phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(bf(game, "bfA")?.controller).toBeNull();
    expect(bf(game, "bfB")?.controller).toBe(P2);
  });
});
