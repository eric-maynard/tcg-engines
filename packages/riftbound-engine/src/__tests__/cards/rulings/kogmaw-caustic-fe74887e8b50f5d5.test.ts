/**
 * Ruling fe74887e8b50f5d5 — Kog'Maw, Caustic (OGN-190 → ogn-190-298) · Champion Unit · Chaos · [3][chaos] · 1 Might
 *   "[Deathknell] — Deal 4 to all units at my battlefield."
 *   × Might of Demacia - Starter (ogs-023-024) "When you conquer, if you have 4+ units at that battlefield, draw 2."
 *     — a Conquer trigger, to observe that conquering comes AFTER the Deathknell chain.
 *
 * Q: How do the (new) Deathknell rules affect Kog'Maw?
 * A: It now works: the game remembers the battlefield Kog'Maw died at, so "my battlefield" is valid from the trash.
 *    Sequence: Deathknells pend as units take lethal damage → all units heal → units die, Deathknells finalize →
 *    after the cleanup a chain holds the Deathknells (NOT conquer abilities yet) → normal priority → they resolve
 *    → only when the chain is empty is control established and Conquer effects happen.
 * Rules: 808 (Deathknell, last-known battlefield), 466.1–466.2 (combat cleanup: heal, deaths, then the triggered
 *        chain), 466.5 / 469 (control & conquer once that chain is done).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW = "ogn-190-298";
const MIGHT_OF_DEMACIA = "ogs-023-024";
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Sting (deal 1)",
  timing: "action",
} as const;

describe("Ruling fe74887e8b50f5d5 — Kog'Maw's Deathknell remembers its battlefield; the Deathknell chain resolves before control/conquer", () => {
  test("killed by a spell while at bf1: from the trash its Deathknell still knows 'my battlefield' — every unit at bf1 (friend and foe) takes 4, units elsewhere take nothing", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", KOGMAW, "kog")
      .unit(P2, "bf1", { might: 5, name: "Packmate" }, "packmate")
      .unit(P1, "bf1", { might: 6, name: "Interloper" }, "interloper")
      .unit(P1, "bf2", { might: 2, name: "Faraway" }, "faraway")
      .hand(P1, STING, "sting")
      .build();
    await game.p1.cast("sting", { targets: "kog" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Sting resolves; Kog'Maw dies in the cleanup
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P2, triggered: true })]);
    await game.settle();
    expect(game.state("packmate")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.state("interloper")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.state("faraway").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  /** P1 (Garen legend) attacks P2's bf1 (Kog'Maw + a 1-Might Pal) with A, B, C (5 each) and little D (2). */
  function combatBoard() {
    return scenario()
      .turn(3)
      .legend(P1, MIGHT_OF_DEMACIA, "garen")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", KOGMAW, "kog")
      .unit(P2, "bf1", { might: 1, name: "Pal" }, "pal")
      .unit(P1, "base", { might: 5, name: "A" }, "a")
      .unit(P1, "base", { might: 5, name: "B" }, "b")
      .unit(P1, "base", { might: 5, name: "C" }, "c")
      .unit(P1, "base", { might: 2, name: "D" }, "d");
  }

  /** Attack, pass Focus both ways, let the defender's 2 damage be assigned → combat cleanup done, Deathknell chain up. */
  async function toDeathknellChain(): Promise<Game> {
    const game = await combatBoard().build();
    await game.p1.move(["a", "b", "c", "d"], "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    for (let i = 0; i < 4 && game.decision()?.kind === "distribute"; i++) {
      await game.settle({ maxSteps: 1 }); // forced/greedy combat-damage assignment
    }
    return game;
  }

  test("combat: after damage the cleanup kills Kog'Maw and Pal, HEALS the survivors, and puts the Deathknell on a chain — at this point bf1 is still P2's, nothing is conquered or scored, and no Conquer trigger is on the chain", async () => {
    const game = await toDeathknellChain();
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["kog"]); // Deathknell only — no 'garen' conquer item yet
    for (const id of ["a", "b", "c", "d"]) {
      expect(game.state(id)).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    }
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("normal (non-showdown) priority on that chain — both players get to act — then it resolves: 4 to every unit at bf1 (A, B, C survive on 4 damage; 2-Might D dies)", async () => {
    const game = await toDeathknellChain();
    const seats = new Set<string>();
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      seats.add(game.actingSeat() as string);
      await game.acting().passPriority();
    }
    expect([...seats].sort()).toEqual([P1, P2]);
    await game.settle();
    for (const id of ["a", "b", "c"]) {
      expect(game.state(id)).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    }
    expect(game.zoneOf("d")).toBe("trash");
  });

  test("only once the chain is empty is control established: P1 conquers bf1 (1 point) — and the Conquer trigger is evaluated NOW, with 3 units left (D already dead to the Deathknell), so Garen's '4+ units' draw does not happen", async () => {
    const game = await toDeathknellChain();
    const hand = game.p1.hand().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.units("bf1").sort()).toEqual(["a", "b", "c"]);
    expect(game.p1.hand()).toHaveLength(hand); // no draw 2
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
