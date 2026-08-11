/**
 * Ruling 1b7233fb2fb0df66 — Fight or Flight (OGN-168 → ogn-168-298) · Spell · Chaos · [2] · [Hidden] [Action]
 *     "Move a unit from a battlefield to its base."
 *   × Leona, Determined (OGN-238 → ogn-238-298) · Champion unit · 4 Might — "[Shield] When I attack, stun an
 *     enemy unit here."
 *
 * Q: Leona attacks and her "When I attack" trigger targets a unit at that battlefield. If Fight or Flight then
 *    moves Leona — or her target — home before the trigger resolves, does the stun still land?
 * A: No. Her ability needs both units to be "here" (the same battlefield) when it RESOLVES. The reveal goes on
 *    the initial chain above her trigger and resolves first; her trigger then finds one of the two elsewhere
 *    and does nothing. Combat continues regardless. Only a Fight or Flight at Leona's own battlefield matters.
 * Rules: 471.2.b ("here" = the battlefield the bound item was triggered at, re-checked on resolution),
 *        359.3.e.7 (an object that is no longer legal is skipped), 355.5 (targets fixed at finalization),
 *        344 (initial chain), 811 (Hidden lets an Action be revealed at Reaction speed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const LEONA = "ogn-238-298";

/**
 * P1's turn. P2 holds bf1 with Target (3) and Other (2) and has Fight or Flight hidden there; P2 also holds
 * bf2 with Far Away (2) and a second hidden Fight or Flight. Leona ready in P1's base.
 */
function board() {
  return scenario()
    .turn(3)
    .victoryScore(20)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Target" }, "tgt")
    .unit(P2, "bf1", { might: 2, name: "Other" }, "other")
    .unit(P2, "bf2", { might: 2, name: "Far Away" }, "far")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .facedown(P2, "bf2", FIGHT_OR_FLIGHT, "fof2")
    .unit(P1, "base", LEONA, "leona");
}

/** Leona attacks bf1; P1 locks her stun on Target at finalization, then passes priority to P2. */
async function attackWithStunDeclared(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("leona", "bf1");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "leona" } });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key).toSorted() : []).toEqual(["other", "tgt"]);
  await game.p1.pick("tgt");
  expect(game.chain()[0]).toMatchObject({ cardId: "leona", targets: ["tgt"], triggered: true });
  expect(game.state("tgt").isStunned).toBe(false); // nothing has resolved yet
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ kind: "action", seat: P2 });
  return game;
}

/** Reveal a hidden Fight or Flight and name the unit it pushes home (asked as a pick after the reveal). */
async function revealMoving(game: Game, fof: string, unit: string): Promise<void> {
  await game.p2.reveal(fof);
  const d = game.decision();
  if (d?.kind === "pick") {
    await game.p2.pick(unit);
  }
}

/** Drain the chain by passing priority (stops at any non-priority prompt). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 1b7233fb2fb0df66 — Fight or Flight breaks Leona's 'here' before her stun resolves", () => {
  test("setup: the attack puts Leona's trigger on the initial chain naming Target, and P2 may react with the Hidden card even though it is an [Action]", async () => {
    const game = await attackWithStunDeclared();
    expect(game.chain().map((c) => c.cardId)).toEqual(["leona"]);
    expect(game.p2.can("reveal", "fof")).toBe(true);
  });

  test("THE TARGET is moved home: Fight or Flight resolves first, then Leona's trigger finds Target elsewhere — no stun anywhere", async () => {
    const game = await attackWithStunDeclared();
    await revealMoving(game, "fof", "tgt");
    expect(game.chain().map((c) => c.cardId)).toEqual(["leona", "fof"]);
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("tgt")).toBe("base");
    expect(game.state("tgt").isStunned).toBe(false);
    expect(game.state("other").isStunned).toBe(false); // the trigger does not re-aim at the unit left behind
    expect(game.state("leona").combatRole).toBe("attacker"); // combat continues
    expect(game.violations()).toEqual([]);
  });

  test("LEONA is moved home instead: she is no longer 'here' when her own trigger resolves, so Target is not stunned either", async () => {
    const game = await attackWithStunDeclared();
    await revealMoving(game, "fof", "leona");
    expect(game.chain().map((c) => c.cardId)).toEqual(["leona", "fof"]);
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("leona")).toBe("base");
    expect(game.locationOf("tgt")).toBe("bf1");
    expect(game.state("tgt").isStunned).toBe(false);
    expect(game.state("other").isStunned).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("control — no Fight or Flight: the trigger resolves with both units still here and Target IS stunned (Other is not)", async () => {
    const game = await attackWithStunDeclared();
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("tgt")).toMatchObject({ isStunned: true, location: "bf1" });
    expect(game.state("other").isStunned).toBe(false);
  });

  test("control — only the copy at Leona's battlefield matters: a Fight or Flight revealed at bf2 moving Far Away leaves the stun intact", async () => {
    const game = await attackWithStunDeclared();
    await revealMoving(game, "fof2", "far");
    await drainChain(game);
    expect(game.locationOf("far")).toBe("base");
    expect(game.locationOf("tgt")).toBe("bf1");
    expect(game.state("tgt").isStunned).toBe(true);
  });

  test("a stun that fizzled cannot be re-aimed later: after Target is pushed home nothing offers P1 a fresh pick, and Target arrives home unstunned", async () => {
    const game = await attackWithStunDeclared();
    await revealMoving(game, "fof", "tgt");
    await drainChain(game);
    expect(game.decision()?.kind).not.toBe("pick");
    expect((await game.p1.try((p) => p.pick("other"))).ok).toBe(false);
    expect(game.state("tgt").isStunned).toBe(false);
  });
});
