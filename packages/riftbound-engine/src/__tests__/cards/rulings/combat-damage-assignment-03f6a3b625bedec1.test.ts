/**
 * Ruling 03f6a3b625bedec1 — (no specific card) combat damage assignment
 *
 * Q: May a defender pile ALL its combat damage on one attacker (to avoid killing another attacker with a death trigger),
 *    or must it spread damage to kill everything once lethal is reached?
 * A: Damage is assigned unit by unit: lethal must be reached on a unit before any damage goes to the next; only the LAST
 *    unit in the chosen order may take excess. With enough damage to kill several attackers, they all die — you cannot
 *    concentrate everything on one to dodge a death trigger.
 * Rules: 465.2.c.3 (full lethal to one unit before the next; assigner picks the order), 465.2.c.4 (no overkill while
 *        another unit lacks lethal), 142.4 (lethal damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** 2-Might attacker with "[Deathknell] — Draw 1." — the death trigger the defender would like to avoid. */
const MOURNER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "self" }, type: "triggered" }],
  cardType: "unit",
  domain: "order",
  energyCost: 2,
  keywords: ["Deathknell"],
  might: 2,
  name: "Test Mourner",
  rulesText: "[Deathknell] — Draw 1.",
} as const;

/** P1's turn. P2 holds bf1 with a Wall of the given Might. P1: Mourner (2, Deathknell draw) + a 3-Might Bruiser in base. */
function board(wallMight: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: wallMight, name: "Wall" }, "wall")
    .unit(P1, "base", MOURNER, "mourner")
    .unit(P1, "base", { might: 3, name: "Bruiser" }, "bruiser");
}

/** Both attack bf1 and both players pass Focus (combat damage step begins). Answers P1's own assignment if it is asked. */
async function attackAndPass(wallMight: number): Promise<Game> {
  const game = await board(wallMight).build();
  await game.p1.move(["mourner", "bruiser"], "bf1");
  expect(game.state("mourner").combatRole).toBe("attacker");
  expect(game.state("bruiser").combatRole).toBe("attacker");
  await game.p1.passFocus();
  await game.p2.passFocus();
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    if (d?.kind === "distribute" && d.seat === P1) {
      await game.p1.distribute({ wall: d.total });
    }
  }
  return game;
}

describe("Ruling 03f6a3b625bedec1 — the defender must assign lethal unit-by-unit; it can't dump everything on one attacker", () => {
  test("6-Might Wall vs Mourner (2) + Bruiser (3): 6 ≥ 2+3 covers lethal on BOTH — P2 only gets to say WHERE the spare point lands (the ruling's 'only the LAST unit in the chosen order may take excess'), and both attackers die either way, so the Deathknell P2 wanted to dodge fires", async () => {
    const game = await attackAndPass(6);
    const handBefore = game.p1.hand().length;
    // 2 + 3 = 5 of the 6 is forced; the 6th point may only pile onto whichever unit P2 served last,
    // which is a genuine choice between {mourner 3, bruiser 3} and {mourner 2, bruiser 4}
    // (465.2.c.3 / 465.2.c.4 / 355.10.d.2). Neither line spares anybody.
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2, total: 6 });
    expect((await game.p2.try((p) => p.distribute({ bruiser: 3, mourner: 3 }))).ok).toBe(true);
    await game.settle();
    expect(game.zoneOf("mourner")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore + 1); // [Deathknell] — Draw 1
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // took 5 < 6, healed after combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("4-Might Wall (4 < 2+3, a real choice): P2 IS asked to distribute 4, buckets report lethal 2 / 3 — and 'all 4 on the Bruiser' (overkill while the Mourner lacks lethal) is REJECTED, as is all 4 on the Mourner", async () => {
    const game = await attackAndPass(4);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 4 });
    const lethal = d?.kind === "distribute" ? Object.fromEntries(d.buckets.map((b) => [b.card ?? b.key, b.lethal])) : {};
    expect(lethal).toMatchObject({ bruiser: 3, mourner: 2 });
    expect((await game.p2.try((p) => p.distribute({ bruiser: 4, mourner: 0 }))).ok).toBe(false);
    expect((await game.p2.try((p) => p.distribute({ bruiser: 0, mourner: 4 }))).ok).toBe(false);
    expect((await game.p2.try((p) => p.distribute({ bruiser: 1, mourner: 3 }))).ok).toBe(false); // Mourner overkilled, Bruiser short
    expect((await game.p2.try((p) => p.distribute({ bruiser: 2, mourner: 1 }))).ok).toBe(false); // must assign all 4
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2 });
  });

  test("…the legal ways: exactly lethal on the first unit, remainder on the LAST one — Bruiser 3 then 1 on the Mourner (Mourner lives, no Deathknell)…", async () => {
    const game = await attackAndPass(4);
    const handBefore = game.p1.hand().length;
    await game.p2.distribute({ bruiser: 3, mourner: 1 });
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash"); // 5 ≥ 4
    expect(game.state("mourner")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // survived 1, healed
    expect(game.p1.hand()).toHaveLength(handBefore); // no Deathknell
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // the surviving attacker conquers
  });

  test("…or Mourner 2 first, then the remaining 2 (short of lethal) on the Bruiser as the last unit — Mourner dies (Deathknell draws), Bruiser survives and conquers", async () => {
    const game = await attackAndPass(4);
    const handBefore = game.p1.hand().length;
    await game.p2.distribute({ bruiser: 2, mourner: 2 });
    await game.settle();
    expect(game.zoneOf("mourner")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.state("bruiser")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
