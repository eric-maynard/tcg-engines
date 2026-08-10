/**
 * Ruling 6e70e8270a3e263d — Soraka, Wanderer (SFD-173 → sfd-173-221) · [4][order] · 4 Might · "I must be assigned combat damage last. If another
 *     unit you control here would die, if it has less Might than me, instead heal it, exhaust it, and recall it."
 *   × Stupefy (ogn-095-298) · Reaction · [1] · "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *   × Smoke Screen (ogn-093-298) · Reaction · [2][mind] · "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: How does Soraka's replacement work in combat when she and several lower-Might units would die simultaneously?
 * A: If Soraka survives, she saves EVERY other qualifying (lower-Might) unit here — no limit; all are healed, exhausted, recalled. If she dies to
 *    the same combat damage, (per this ruling) her effect does not apply at all. You may Stupefy / Smoke Screen your own unit before damage
 *    so that it has less Might than Soraka and gets saved.
 * Rules: 371–373 (replacement effects; each simultaneous death considered), 465.2.c.6 (assignment order — Soraka last), 456 (recall ≠ move).
 *        NOTE: CR 370.4 (current text) names Soraka as APPLYING to units dying simultaneously with her — the engine follows 370.4, so the
 *        ruling's "she doesn't see them die" case is recorded below as a disagreement.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SORAKA = "sfd-173-221";
const STUPEFY = "ogn-095-298";
const SMOKE_SCREEN = "ogn-093-298";

/** P2's turn. P1 holds bf1 with Soraka (4), Sprout (1) and Sapling (2). P2's lone attacker of the given Might comes from base. */
function board(attackerMight: number) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SORAKA, "soraka")
    .unit(P1, "bf1", { might: 1, name: "Sprout" }, "sprout")
    .unit(P1, "bf1", { might: 2, name: "Sapling" }, "sapling")
    .unit(P2, "base", { might: attackerMight, name: "Attacker" }, "attacker");
}

async function attackAndResolve(attackerMight: number): Promise<Game> {
  const game = await board(attackerMight).build();
  await game.p2.move("attacker", "bf1");
  await game.settle();
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 6e70e8270a3e263d — Soraka's combat replacement: saves all weaker allies here if she lives; self-debuffing an ally makes it eligible", () => {
  test("Soraka survives (3 incoming: Sprout and Sapling are assigned lethal first, Soraka last takes 0): BOTH weaker units are saved — healed, exhausted, recalled to base — not just one", async () => {
    const game = await attackAndResolve(3);
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
    for (const saved of ["sprout", "sapling"]) {
      expect(game.zoneOf(saved)).toBe("base");
      expect(game.state(saved)).toMatchObject({ damage: 0, isExhausted: true });
    }
    expect(game.p1.trash()).toEqual([]);
    expect(game.zoneOf("attacker")).toBe("trash"); // took 4 + 1 + 2
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0); // recalls are not moves
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT (ruling 6e70e8270a3e263d): the ruling claims a Soraka who dies in the same damage step
  // "doesn't see" her allies die, so nobody is saved. rule 370.4 says the opposite in so many words, and uses
  // THIS card as its printed example: "A Game Object can apply its Replacement Effects to any qualifying
  // events that occur simultaneously with it leaving the zone that its Replacement Effect is active in. …
  // Soraka's replacement can be applied to any qualifying event that occurs simultaneously with her leaving
  // the board, including to units that die simultaneously with her." The engine follows 370.4; the ruling is
  // stale. With 7 incoming, Soraka still saves both weaker allies and only she goes to the trash.
  test("rule 370.4: a simultaneously-dying Soraka still saves her weaker allies (conflicts with ruling 6e70e8270a3e263d)", async () => {
    const game = await attackAndResolve(7);
    expect(game.zoneOf("soraka")).toBe("trash");
    for (const saved of ["sprout", "sapling"]) {
      expect(game.zoneOf(saved)).toBe("base");
      expect(game.state(saved)).toMatchObject({ damage: 0, isExhausted: true });
    }
    expect(game.p1.trash()).toEqual(["soraka"]);
  });

  test("nuance: an EQUAL-Might ally (Sergeant 4 = Soraka 4) is not saved on its own… but Stupefy on your own Sergeant before damage (→ 3 < 4) lets Soraka save it", async () => {
    const mk = () =>
      scenario()
        .active(P2)
        .resources(P1, { energy: 1 })
        .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", SORAKA, "soraka")
        .unit(P1, "bf1", { might: 4, name: "Sergeant" }, "sergeant")
        .unit(P2, "base", { might: 4, name: "Attacker" }, "attacker")
        .hand(P1, STUPEFY, "stupefy")
        .build();
    // Without the trick: Sergeant (4 ≮ 4) takes the 4 and dies for real.
    const plain = await mk();
    await plain.p2.move("attacker", "bf1");
    await plain.settle();
    expect(plain.zoneOf("sergeant")).toBe("trash");
    expect(plain.zoneOf("soraka")).toBe("battlefield-bf1");
    // With Stupefy on the Sergeant during the showdown: 3 < 4 → healed, exhausted, recalled instead.
    const game = await mk();
    await game.p2.move("attacker", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("stupefy", { targets: "sergeant" });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("sergeant").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("sergeant")).toBe("base");
    expect(game.state("sergeant")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1"); // took the leftover 1
    expect(game.zoneOf("attacker")).toBe("trash"); // 4 + 3 back at it
    expect(game.violations()).toEqual([]);
  });

  test("same trick with Smoke Screen (−4, min 1) on a 6-Might Bruiser: 6 → 2 < 4, so Soraka saves it", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SORAKA, "soraka")
      .unit(P1, "bf1", { might: 6, name: "Bruiser" }, "bruiser")
      .unit(P2, "base", { might: 5, name: "Attacker" }, "attacker")
      .hand(P1, SMOKE_SCREEN, "smoke")
      .build();
    await game.p2.move("attacker", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("smoke", { targets: "bruiser" });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("bruiser").might).toBe(2);
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("base");
    expect(game.state("bruiser")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.state("soraka")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // took the leftover 3 (< 4), healed in cleanup
    expect(game.zoneOf("attacker")).toBe("trash");
  });
});
