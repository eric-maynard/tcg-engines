/**
 * Interaction: Emperor's Divide (sfd-043-221) · Calm Action spell · 2 · "[Hidden] [Action] Move any number
 *     of friendly units at a battlefield to their base."  — here FACEDOWN at bf1
 *   × Black Market Broker (sfd-121-221) · 3-Might unit · "When you play a card from face down, play a
 *     Gold gear token exhausted."
 *   × Gust (ogn-169-298) · Chaos Reaction spell · 1 · "Return a unit at a battlefield with 3 [Might] or
 *     less to its owner's hand."
 *
 * Board: P1 controls bf1 with U1 (2 Might) and U2 (4 Might), Emperor's Divide facedown there (hidden on
 * an earlier turn), Broker in base. P2's turn: P2 attacks bf1 with a 7-Might unit → combat showdown.
 *   (a) P1 flips Divide choosing BOTH U1+U2; P2 responds with Gust on U1. Does U2 still move? Is
 *       anything substituted for U1? Does Broker still make a Gold?
 *   (b) P1 flips Divide choosing ZERO units. Legal? When is "how many" fixed — play or resolution?
 *   (c) P1's only unit at bf1 was already Gusted away in this showdown (P1 still controls bf1). Can
 *       P1 still flip Divide "for zero" to farm the Broker Gold?
 *
 * Rules: 355.5 / 355.13 / 355.15 (targets — including an "any number" count, possibly zero — are
 * chosen at finalization and locked), 811.1.d / 811.1.d.2 (from Hidden, targets must be at THAT
 * battlefield; a hidden spell with no valid target there cannot be played), 811.3 (from hand: normal
 * cost, no restriction), 811.6 (facedown card has Reaction), 359.3.e.5 / .e.8 / .e.10 (illegal targets
 * are skipped, the rest of a multi-target instruction still executes, a spell that does nothing still
 * counts as played), 419.4.a (play triggers fire when the played card RESOLVES), 465.1 (no defenders →
 * no damage step), 323.6 (no control loss while a showdown/combat is ongoing there).
 *
 * Expected: (a) Gust resolves first (U1 → P1's hand, a new object); Divide then moves only U2 to base,
 * nothing replaces U1; Divide resolved ⇒ "played from face down" ⇒ Broker makes one exhausted Gold;
 * bf1 has no defenders ⇒ no damage, P2 conquers (+1). (b) Legal; zero is a finalization-time choice
 * that cannot be revisited at resolution; resolves doing nothing; still played-from-facedown ⇒ Gold;
 * U1/U2 stay and defend. (c) Illegal from Hidden (811.1.d controls over 355.13) ⇒ no Gold; the same
 * card from HAND for [2] choosing zero would be legal (but is not "from face down").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EMPERORS_DIVIDE = "sfd-043-221";
const BROKER = "sfd-121-221";
const GUST = "ogn-169-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

const golds = (game: Game) => game.p1.gear().filter((id) => game.state(id).isToken && game.state(id).name === "Gold");

/** Flatten a seat's `targets` field for (verb, card) into the set of ids offered. */
function targetsOffered(game: Game, seat: "p1" | "p2", verb: string, alias: string): string[] {
  const field = game[seat].option(verb, alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * Turn 3, P2 active. P1: bf1 with U1 (2) + U2 (4), Divide facedown at bf1 since turn 1, Broker in base.
 * P2: 7-Might attacker in base, Gust in hand with exactly [1] to pay for it.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "U1" }, "u1")
    .unit(P1, "bf1", { might: 4, name: "U2" }, "u2")
    .unit(P1, "base", BROKER, "broker")
    .facedown(P1, "bf1", EMPERORS_DIVIDE, "ed", { hiddenOnTurn: 1 })
    .unit(P2, "base", { might: 7, name: "Attacker" }, "atk")
    .hand(P2, GUST, "gust");
}

/** P2 attacks bf1 (combat showdown, attacker has Focus) and passes Focus to P1. */
async function attacked(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("atk", "bf1");
  expect(game.actingSeat()).toBe(P2);
  await game.p2.passFocus();
  expect(game.actingSeat()).toBe(P1);
  return game;
}

/** Pass priority back and forth until the chain is empty or a non-priority prompt appears. */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain" || !d.passKey) {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

/** If the engine asks for Divide's targets only now (at resolution), answer with `keys` ([] = none). */
async function answerLatePick(game: Game, keys: string[]): Promise<void> {
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "ed") {
    await (keys.length > 0 ? game.p1.pick(...keys) : game.p1.decline());
  }
}

describe("Emperor's Divide from facedown × Gust × Black Market Broker", () => {
  // ── (a) both chosen, Gust snipes U1 ─────────────────────────────────────────────────────

  test("(a) with Focus in the combat showdown P1 may flip the facedown Divide for [0]; it opens a chain (811.6, 811.1.c.3)", async () => {
    const game = await attacked();
    expect(game.p1.can("reveal", "ed")).toBe(true);
    await game.p1.reveal("ed", { answers: [["u1", "u2"]] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // played ignoring its cost
    expect(game.chain()[0]).toMatchObject({ cardId: "ed", controller: P1, triggered: false });
    expect(game.zoneOf("ed")).toBe("chain");
  });

  test.failing("BUG: (a) the 'any number' targets (U1+U2, both at bf1 per 811.1.d.2) are chosen at FINALIZATION and visible on the chain item before anyone responds (355.5, 355.13)", async () => {
    // Expected: the hidden play asks for / accepts its targets as it is played and the chain item
    // records [u1, u2]. Actual: the reveal takes no targets; the engine only asks at resolution.
    const game = await attacked();
    await game.p1.reveal("ed", { answers: [["u1", "u2"]] });
    const item = game.chain().find((c) => c.cardId === "ed");
    expect([...(item?.targets ?? [])].sort()).toEqual(["u1", "u2"]);
  });

  test("(a) P2 may respond with Gust — it offers only U1 (2 Might ≤ 3), never U2 (4) or the 7-Might attacker — and Gust sits on top of Divide", async () => {
    const game = await attacked();
    await game.p1.reveal("ed", { answers: [["u1", "u2"]] });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(targetsOffered(game, "p2", "cast", "gust")).toEqual(["u1"]);
    await game.p2.cast("gust", { targets: "u1" });
    const names = game.chain().map((c) => c.name);
    expect(names[0]).toBe("Emperor's Divide");
    expect(names.at(-1)).toBe("Gust");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // Gust: [1], no power pip
  });

  test("(a) resolution: Gust first (U1 → P1's hand), then Divide moves ONLY U2 to base — U1's part is ignored and nothing is substituted (359.3.e.5/.e.8, 355.15)", async () => {
    const game = await attacked();
    await game.p1.reveal("ed", { answers: [["u1", "u2"]] });
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "u1" });
    await drainChain(game);
    await answerLatePick(game, ["u2"]);
    await drainChain(game);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("u1")).toBe("hand");
    expect(game.state("u1").owner).toBe(P1);
    expect(game.zoneOf("u2")).toBe("base");
    expect(game.zoneOf("ed")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("battlefield-bf1"); // the enemy attacker was never a candidate
    expect(game.zoneOf("broker")).toBe("base"); // nor a base unit
    expect(game.chain()).toHaveLength(0);
  });

  test("(a) Divide resolved ⇒ it WAS played from face down ⇒ Broker gives P1 exactly one exhausted Gold token in base", async () => {
    const game = await attacked();
    await game.p1.reveal("ed", { answers: [["u1", "u2"]] });
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "u1" });
    await drainChain(game);
    await answerLatePick(game, ["u2"]);
    await drainChain(game);
    const mine = golds(game);
    expect(mine).toHaveLength(1);
    expect(game.state(mine[0]!)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, zone: "base" });
  });

  test("(a) Broker's play trigger fires only when Divide RESOLVES (419.4.a) — while P2 still holds a reaction window the chain is just [Divide] and no Gold exists", async () => {
    // Expected: chain == [Emperor's Divide] right after the flip; the Broker trigger becomes pending
    // only once Divide finishes resolving. Actual: the trigger is put on the chain at the flip and
    // resolves (minting the Gold) before Divide does.
    const game = await attacked();
    await game.p1.reveal("ed", { answers: [["u1", "u2"]] });
    expect(game.chain().map((c) => c.name)).toEqual(["Emperor's Divide"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Divide resolves now → trigger → Gold
    await answerLatePick(game, ["u1", "u2"]);
    await drainChain(game);
    expect(golds(game)).toHaveLength(1);
  });

  test("(a) aftermath: bf1 has no defender left ⇒ no combat damage is dealt (465.1) and P2 conquers bf1 for 1 point", async () => {
    const game = await attacked();
    await game.p1.reveal("ed", { answers: [["u1", "u2"]] });
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "u1" });
    await drainChain(game);
    await answerLatePick(game, ["u2"]);
    await game.settle();
    expect(game.state("atk").damage).toBe(0);
    expect(game.state("u2").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) zero chosen ─────────────────────────────────────────────────────────────────────

  test("(b) flipping Divide choosing ZERO units is legal (355.13): it goes on the chain for [0] and resolves moving nobody; U1 and U2 are still defending bf1", async () => {
    const game = await attacked();
    const r = await game.p1.try((p) => p.reveal("ed"));
    expect(r.ok).toBe(true);
    expect(game.chain()[0]).toMatchObject({ cardId: "ed" });
    await drainChain(game);
    await answerLatePick(game, []); // "zero"
    await drainChain(game);
    expect(game.zoneOf("ed")).toBe("trash");
    expect(game.zoneOf("u1")).toBe("battlefield-bf1");
    expect(game.zoneOf("u2")).toBe("battlefield-bf1");
    expect(game.state("u1").combatRole).toBe("defender");
    expect(game.state("u2").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("(b) a zero-target Divide still counts as 'a card played from face down' (359.3.e.10) ⇒ Broker Gold, exhausted, in P1's base", async () => {
    const game = await attacked();
    await game.p1.reveal("ed");
    await drainChain(game);
    await answerLatePick(game, []);
    await drainChain(game);
    const mine = golds(game);
    expect(mine).toHaveLength(1);
    expect(game.state(mine[0]!)).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.can("activate", mine[0]!)).toBe(false); // exhausted: no [A] this turn
  });

  test.failing("BUG: (b) the count is a PLAY-TIME choice locked by 355.15 — after both players pass, Divide must resolve without asking P1 anything (no resolution-time target pick to revise after seeing P2's response)", async () => {
    // Expected: zero was declared at finalization; passing priority twice resolves Divide outright.
    // Actual: the engine defers the whole "which / how many" choice to a RES-time pick.
    const game = await attacked();
    await game.p1.reveal("ed");
    await drainChain(game);
    const d = game.decision();
    expect(d?.kind === "pick" && d.source?.cardId === "ed").toBe(false);
    expect(game.zoneOf("ed")).toBe("trash");
  });

  test("(b) then combat proceeds normally: 7 vs 2+4 — both defenders take lethal, the attacker survives and P2 conquers", async () => {
    const game = await attacked();
    await game.p1.reveal("ed");
    await drainChain(game);
    await answerLatePick(game, []);
    await game.settle();
    expect(game.zoneOf("u1")).toBe("trash");
    expect(game.zoneOf("u2")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  // ── (c) no friendly unit left at bf1 ────────────────────────────────────────────────────

  /** P1's ONLY unit at bf1 is U1; P2 attacks and, holding Focus, Gusts U1 away before P1 can act. */
  async function emptiedBf1(): Promise<Game> {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "U1" }, "u1")
      .unit(P1, "base", BROKER, "broker")
      .facedown(P1, "bf1", EMPERORS_DIVIDE, "ed", { hiddenOnTurn: 1 })
      .hand(P1, EMPERORS_DIVIDE, "edHand")
      .unit(P2, "base", { might: 7, name: "Attacker" }, "atk")
      .hand(P2, GUST, "gust")
      .build();
    await game.p2.move("atk", "bf1");
    await game.p2.cast("gust", { targets: "u1" });
    await drainChain(game);
    expect(game.zoneOf("u1")).toBe("hand");
    if (game.actingSeat() === P2) {
      await game.p2.passFocus();
    }
    expect(game.actingSeat()).toBe(P1);
    return game;
  }

  test("(c) setup: after Gust, P1 has no unit at bf1 but still CONTROLS it — no control loss while the showdown is ongoing (323.6) — and holds Focus", async () => {
    const game = await emptiedBf1();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    expect(game.zoneOf("ed")).toBe("facedown-bf1"); // still hidden there (P1 controls bf1)
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("(c) with no friendly unit at bf1 the facedown Divide CANNOT be played — a hidden spell with no valid target under the that-battlefield restriction is unplayable (811.1.d) — so Broker gets nothing", async () => {
    // Expected: revealHidden:ed is not legal; attempting it is rejected; no Gold is ever made.
    // Actual: the engine lets the flip through "for zero" and the Broker mints a Gold.
    const game = await emptiedBf1();
    expect(game.p1.can("reveal", "ed")).toBe(false);
    expect((await game.p1.try((p) => p.reveal("ed"))).ok).toBe(false);
    await drainChain(game);
    await answerLatePick(game, []);
    await drainChain(game);
    expect(game.zoneOf("ed")).toBe("facedown-bf1");
    expect(golds(game)).toHaveLength(0);
  });

  test("(c) contrast: the same card from HAND for [2] at Action timing (P1 has Focus) choosing zero IS legal (811.3, 355.13) — but it is not 'from face down', so still no Gold", async () => {
    const game = await emptiedBf1();
    expect(game.p1.can("cast", "edHand")).toBe(true);
    const field = game.p1.option("cast", "edHand")?.fields.find((f) => f.name === "targets");
    expect(field?.options).toEqual([[]]); // the only legal target set is the empty one
    await game.p1.cast("edHand", { targets: [] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["edHand"]); // no Broker trigger
    await drainChain(game);
    expect(game.zoneOf("edHand")).toBe("trash");
    expect(golds(game)).toHaveLength(0);
    expect(game.zoneOf("ed")).toBe("facedown-bf1");
  });
});
