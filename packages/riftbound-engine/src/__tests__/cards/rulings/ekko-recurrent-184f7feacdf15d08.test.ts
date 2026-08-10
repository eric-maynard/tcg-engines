/**
 * Ruling 184f7feacdf15d08 — Ekko, Recurrent (OGN-110 → ogn-110-298, 5 Might)
 *   "[Accelerate] [Deathknell] — Recycle me to ready your runes."
 *   × Zaun Warrens (OGN-298 → ogn-298-298, Battlefield) "When you conquer here, discard 1, then draw 1."
 *
 * Q: When does Ekko's Deathknell trigger during combat — before or after the (special) cleanup?
 * A: After combat damage and after units have healed in the Combat Cleanup. The Deathknell item resolves (Ekko is
 *    recycled, runes readied) BEFORE the winner establishes control, so it resolves before Zaun Warrens' conquer
 *    trigger is even put on the chain.
 * Rules: 323.4 / 428.1.a.1.b (Deathknell noted as pending on lethal damage), 466.1.a.1 (3c. Heal all units),
 *        466.2 (resolve the chain from combat damage + cleanup before determining the result), 466.5–466.6
 *        (establish control → conquer triggers afterwards), 383.3.b ("Recycle me" is the trigger's base cost), 808.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EKKO = "ogn-110-298";
const ZAUN_WARRENS = "ogn-298-298";

/**
 * P1's turn. P2 holds Zaun Warrens (live text) with Ekko (5) defending; P2 has 2 EXHAUSTED mind runes.
 * P1's 6-Might Bruiser attacks: Ekko dies (6 ≥ 5), Bruiser survives with 5 damage → healed in cleanup.
 * P1 holds one Junk card so the Warrens' discard is observable.
 */
function board() {
  return scenario()
    .battlefield("zw", { controller: P2, def: ZAUN_WARRENS, inert: false })
    .unit(P2, "zw", EKKO, "ekko")
    .unit(P1, "base", { might: 6, name: "Bruiser" }, "bruiser")
    .runes(P2, "mind", 2, { exhausted: true })
    .hand(P1, { cardType: "unit", might: 1, name: "Junk" }, "junk");
}

/** Attack, both pass Focus → combat damage + cleanup run; stop at the first chain priority window. */
async function fightUntilDeathknell(game: Game): Promise<void> {
  await game.p1.move("bruiser", "zw");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.chain()).toEqual([]);
  await game.p1.passFocus();
  await game.p2.passFocus();
  // Drive any surfaced procedure / trigger-order offer until a chain item is pending.
  for (let i = 0; i < 6 && game.chain().length === 0; i++) {
    const d = game.decision();
    if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d?.kind === "action") {
      const proc = d.options.find((o) => o.verb === "resolveCombat");
      if (!proc) {
        break;
      }
      await game.seat(d.seat).choose(proc.key);
    } else {
      break;
    }
  }
}

describe("Ruling 184f7feacdf15d08 — Ekko's Deathknell lands after the combat heal and resolves before Zaun Warrens' conquer trigger", () => {
  test("after combat damage: Ekko's Deathknell is the ONLY chain item; the surviving attacker is already HEALED (cleanup 3c ran); Ekko was recycled as the trigger's cost; Zaun Warrens is not yet conquered and its trigger is not on the chain", async () => {
    const game = await board().build();
    await fightUntilDeathknell(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ekko", controller: P2, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "zw")).toBe(false);
    // Heal (3c) already happened before the Deathknell got its priority window.
    expect(game.locationOf("bruiser")).toBe("zw");
    expect(game.state("bruiser").damage).toBe(0);
    // 383.3.b — "Recycle me" is the base cost, paid as the item was put on the chain.
    expect(game.zoneOf("ekko")).toBe("mainDeck");
    expect(game.p2.runes({ ready: true })).toHaveLength(0); // effect not yet resolved
    // Control not yet established → no conquer, no point, no Warrens trigger.
    expect(game.gameState.battlefields.zw?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toEqual(["junk"]);
  });

  test("both pass: the Deathknell resolves (P2's runes are readied) and only THEN does P1 establish control — conquer scores 1 and Zaun Warrens' trigger is now the chain item", async () => {
    const game = await board().build();
    await fightUntilDeathknell(game);
    await game.p2.passPriority();
    await game.p1.passPriority();
    // Deathknell effect done.
    expect(game.p2.runes({ ready: true })).toHaveLength(2);
    // Drive a surfaced conquer procedure if the harness hands it back.
    for (let i = 0; i < 4 && !game.chain().some((c) => c.cardId === "zw"); i++) {
      const d = game.decision();
      if (d?.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else if (d?.kind === "action") {
        const proc = d.options.find((o) => o.verb === "conquer" || o.verb === "resolveCombat");
        if (!proc) {
          break;
        }
        await game.seat(d.seat).choose(proc.key);
      } else {
        break;
      }
    }
    expect(game.gameState.battlefields.zw?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zw", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "ekko")).toBe(false);
    // Warrens resolves: P1 discards Junk and draws 1.
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("junk");
    }
    await game.settle();
    expect(game.p1.trash()).toContain("junk");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
