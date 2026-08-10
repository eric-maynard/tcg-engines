/**
 * Ruling ba104cb2e2dd0e79 — Hidden Blade (OGN-213 → ogn-213-298) · Spell · Order · 2+[order] · [Hidden] [Action]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Yasuo, Remorseful (ogn-076-298) · Unit · 6 Might "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Void Gate (OGN-296 → ogn-296-298) · Battlefield "Spells and abilities deal 1 Bonus Damage to units here."
 *
 * Q: Yasuo's attack trigger is on the chain and the opponent kills Yasuo with Hidden Blade before it resolves. Does the
 *    ability still deal damage based on Yasuo's Might?
 * A: No. With Yasuo gone his Might cannot be determined; the ability deals NULL damage (not 0). That distinction
 *    matters at Void Gate: null damage gets no +1 Bonus Damage.
 * Rules: 359.3.f-ish (missing information → instruction does nothing), 437 (damage; bonus damage modifies an
 *        instance of damage — there is none), 811 (Hidden Blade from facedown).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const YASUO_REMORSEFUL = "ogn-076-298";
const VOID_GATE = "ogn-296-298";

/** P1's turn. P2 holds bf1 (optionally the real Void Gate) with an 8-Might Wall and a Hidden Blade facedown there since an earlier turn. Yasuo ready in P1's base. */
function board(voidGate: boolean) {
  return scenario()
    .battlefield("bf1", voidGate ? { controller: P2, def: VOID_GATE, inert: false } : { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Wall" }, "wall")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo");
}

/** Yasuo attacks bf1; his trigger goes on the chain choosing the Wall; stop at the first priority window. */
async function yasuoAttacks(voidGate: boolean): Promise<Game> {
  const game = await board(voidGate).build();
  await game.p1.move("yasuo", "bf1");
  for (let i = 0; i < 6; i++) {
    const d: Decision | null = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.find((o) => (o.card ?? o.key) === "wall")?.key ?? (d.options[0]?.key as string));
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
  return game;
}

/** P2 answers by flipping Hidden Blade onto Yasuo; it resolves first (LIFO): Yasuo dies, P1 draws 2. Yasuo's trigger is left on the chain. */
async function bladeKillsYasuoInResponse(game: Game): Promise<void> {
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "blade")).toBe(true);
  const p1Hand = game.p1.hand().length;
  await game.p2.reveal("blade", { answers: ["yasuo"] });
  if (game.decision()?.kind === "pick" && game.actingSeat() === P2) {
    await game.p2.pick("yasuo");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "blade"]);
  await game.acting().passPriority();
  await game.acting().passPriority(); // Hidden Blade resolves
  expect(game.zoneOf("blade")).toBe("trash");
  expect(game.zoneOf("yasuo")).toBe("trash");
  expect(game.p1.hand()).toHaveLength(p1Hand + 2); // "its controller draws 2"
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", triggered: true })]);
}

async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling ba104cb2e2dd0e79 — Yasuo removed by Hidden Blade before his trigger resolves: null damage", () => {
  test("Hidden Blade resolves first and kills Yasuo; his trigger then resolves with its source gone and deals NO damage to the Wall", async () => {
    const game = await yasuoAttacks(false);
    await bladeKillsYasuoInResponse(game);
    await drainChain(game);
    expect(game.state("wall").damage).toBe(0);
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("baseline (no response): the trigger deals Yasuo's 6 to the Wall", async () => {
    const game = await yasuoAttacks(false);
    await drainChain(game);
    expect(game.state("wall").damage).toBe(6);
  });

  test("nuance at Void Gate: it is NULL damage, not 0 — the Wall takes nothing (no '+1 Bonus Damage' on a non-existent instance)", async () => {
    const game = await yasuoAttacks(true);
    await bladeKillsYasuoInResponse(game);
    await drainChain(game);
    expect(game.state("wall").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("Void Gate baseline (no response): the ability's 6 is a real instance and gets the +1 → the Wall takes 7", async () => {
    const game = await yasuoAttacks(true);
    await drainChain(game);
    expect(game.state("wall").damage).toBe(7);
  });
});
