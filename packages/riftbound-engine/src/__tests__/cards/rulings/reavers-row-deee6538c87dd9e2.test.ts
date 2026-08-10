/**
 * Ruling deee6538c87dd9e2 — Reaver's Row (OGN-285 → ogn-285-298, Battlefield)
 *     "When you defend here, you may move a friendly unit here to base."
 *   × Gust (OGN-169 → ogn-169-298) · [Reaction] · [1] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   (Bullet Time OGN-268 is cited only as a templating analogy.)
 *
 * Q: When an enemy unit moves into Reaver's Row, can I play Gust as a reaction before deciding whether to retreat a unit?
 * A: Yes. Reaver's Row puts a trigger on the chain (its friendly-unit target is chosen as it goes on the chain); while it
 *    waits there you may play Reactions such as Gust. [Ruling: the move-or-not "may" is decided at resolution.]
 * Rules: 383.4.f (defend trigger), 402.2 (targets chosen at finalization), 336/343 (Reactions on a chain),
 *        383.3.a / 204.3.a (CR: a leading "you may" is an opt-in decided at FINALIZATION — engine model `may-at-finalization`).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const GUST = "ogn-169-298";

/** P2's turn. P1 holds Reaver's Row (live) with Big (4) and Small (2); P1 has Gust + [1]. P2's Raider (3) attacks from base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 1 })
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 4, name: "Big" }, "big")
    .unit(P1, "row", { might: 2, name: "Small" }, "small")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, GUST, "gust");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider moves in; P1 opts in and targets Small; the Row trigger now sits on the chain and P1 holds priority. */
async function rowTriggerOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "row");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "row", defendingPlayer: P1 });
  // RULING-CONFLICT: riftjudge deee6538c87dd9e2 says only the target is chosen now and the "you may" (move or not) is
  // decided during resolution; CR 383.3.a / 204.3.a say a leading "you may" is an opt-in answered at FINALIZATION
  // (declined ⇒ no chain item) — engine follows CR: opt-in first, then the target, both timing FIN.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row", pendingChoiceType: "opt-in" }, timing: "FIN" });
  await game.p1.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "row" }, timing: "FIN" });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["big", "small"]);
  await game.p1.pick("small");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, targets: ["small"], triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.locationOf("small")).toBe("row"); // nothing moved yet
  return game;
}

describe("Ruling deee6538c87dd9e2 — Gust can be played in response to Reaver's Row's defend trigger", () => {
  test("the enemy move puts Reaver's Row's trigger on the chain targeting a friendly unit there; a priority window (closed state) opens before it resolves", async () => {
    await rowTriggerOnChain();
  });

  test("while the trigger waits, P1 may cast Gust (a Reaction) — here on the 3-Might Raider; LIFO: Gust resolves first and bounces the Raider, then the Row trigger resolves and moves Small to base", async () => {
    const game = await rowTriggerOnChain();
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "raider" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["row", "gust"]);
    expect(game.p1.energy()).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Gust resolves
    expect(game.zoneOf("raider")).toBe("hand");
    expect(game.p2.hand()).toContain("raider");
    expect(game.chain().map((c) => c.cardId)).toEqual(["row"]);
    await game.settle(); // Row trigger resolves; the attacker-less combat then closes
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("small")).toBe("base");
    expect(game.locationOf("big")).toBe("row");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("having opted in at finalization, nothing further is asked when the trigger resolves — the chosen unit simply moves (383.3.a.1: mandatory once opted in)", async () => {
    // RULING-CONFLICT: riftjudge deee6538c87dd9e2 says "when the trigger resolves, you decide whether to move the targeted
    // unit back or not"; CR 383.3.a says the may was already exercised at finalization — engine follows CR (no RES prompt).
    const game = await board().script(P1, [], { strict: true }).build();
    await game.p2.move("raider", "row");
    await game.p1.yes();
    await game.p1.pick("small");
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves — strict P1: any "move it?" prompt would throw UNSCRIPTED_DECISION
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("small")).toBe("base");
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
  });

  test("and declining at finalization means no chain item at all — the showdown proceeds straight to the attacker's Focus with both defenders in place", async () => {
    const game = await board().build();
    await game.p2.move("raider", "row");
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("small")).toBe("row");
    expect(game.locationOf("big")).toBe("row");
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    // Gust is of course still playable later in the showdown once P1 has Focus/priority.
    await game.p2.passFocus();
    expect(game.p1.can("cast", "gust")).toBe(true);
  });
});
