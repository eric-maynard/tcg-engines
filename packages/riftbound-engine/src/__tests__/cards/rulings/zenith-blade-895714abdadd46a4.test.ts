/**
 * Ruling 895714abdadd46a4 — Zenith Blade (OGN-262 → ogn-262-298) · Action [3][rainbow][rainbow]
 *     "Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield."
 *   × Radiant Dawn (OGN-261 → ogn-261-298, Leona legend) "When you stun one or more enemy units, buff a friendly unit."
 *
 * Q: Can I Zenith Blade an ALREADY-stunned unit just for the move, and does Radiant Dawn still buff?
 * A: The already-stunned unit is a legal target and the move still happens, but the stun instruction does nothing to a
 *    unit that is already stunned — so nothing was stunned and Radiant Dawn does NOT trigger.
 * Rules: 423 (Stun), 383 (trigger condition must actually occur), 359.3 (instructions independent: the move is not gated
 *        on the stun doing anything).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZENITH_BLADE = "ogn-262-298";
const RADIANT_DAWN = "ogn-261-298";

/** P1's turn with exactly [3] + rainbow×2, Radiant Dawn as legend, Backup (3) in base. P2's Brute (5) holds bf1 — stunned or not. */
function board(alreadyStunned: boolean) {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .legend(P1, RADIANT_DAWN, "leona")
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute", alreadyStunned ? { stunned: true } : undefined)
    .unit(P1, "base", { might: 3, name: "Backup" }, "backup")
    .hand(P1, ZENITH_BLADE, "zb");
}

/** Cast Zenith Blade [brute, backup], let it resolve, take the (only) destination if asked. */
async function zenith(game: Game): Promise<void> {
  expect(game.p1.can("cast", "zb")).toBe(true);
  const field = game.p1.option("cast", "zb")?.fields.find((f) => f.name === "targets");
  expect((field?.options ?? []).some((v) => Array.isArray(v) && v[0] === "brute")).toBe(true); // Brute is a legal target either way
  await game.p1.cast("zb", { targets: ["brute", "backup"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.zone ?? o.key) === "battlefield-bf1" || o.key === "bf1")) {
      await game.p1.pick("battlefield-bf1");
    } else if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "backup")) {
      await game.p1.pick("backup");
    } else {
      break;
    }
  }
  expect(game.zoneOf("zb")).toBe("trash");
}

describe("Ruling 895714abdadd46a4 — Zenith Blade on an already-stunned unit: move yes, Radiant Dawn no", () => {
  test("control: on an UNSTUNNED Brute the stun happens, Backup moves to bf1, and Radiant Dawn triggers — P1 buffs a friendly unit", async () => {
    const game = await board(false).build();
    await zenith(game);
    expect(game.state("brute").isStunned).toBe(true);
    expect(game.locationOf("backup")).toBe("bf1");
    // Radiant Dawn's trigger: on the chain and/or asking which friendly unit to buff.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        expect(d.options.map((o) => o.card ?? o.key)).toContain("backup");
        await game.p1.pick("backup");
      } else if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d?.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.state("backup").isBuffed).toBe(true);
    expect(game.state("backup").might).toBe(4);
  });

  test("already-stunned Brute is still a legal target and the optional move still happens: Backup ends at bf1 (showdown opens there)", async () => {
    const game = await board(true).build();
    expect(game.state("brute").isStunned).toBe(true);
    await zenith(game);
    expect(game.state("brute")).toMatchObject({ isStunned: true, location: "bf1" });
    expect(game.locationOf("backup")).toBe("bf1");
  });

  test("…but the stun 'did nothing', so Radiant Dawn does NOT trigger: no Leona item on the chain, no buff prompt, no friendly unit buffed", async () => {
    const game = await board(true).build();
    await zenith(game);
    await game.acceptTriggerOrder();
    expect(game.chain().some((c) => c.cardId === "leona")).toBe(false);
    const d = game.decision();
    expect(d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "leona").toBe(false);
    await game.settle();
    expect(game.state("backup").isBuffed).toBe(false);
    expect(game.state("backup").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
