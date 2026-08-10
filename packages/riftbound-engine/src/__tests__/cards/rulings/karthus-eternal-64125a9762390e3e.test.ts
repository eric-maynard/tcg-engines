/**
 * Ruling 64125a9762390e3e — Karthus, Eternal (OGN-236 → ogn-236-298) "Your [Deathknell] effects trigger an additional time."
 *   × Ekko, Recurrent (OGN-110 → ogn-110-298) · 5 Might · "[Deathknell] — Recycle me to ready your runes."
 *
 * Q: With Karthus out, can Ekko's doubled Deathknell ready my runes twice (tap them in between for double value)?
 * A: No. Readying the runes requires recycling Ekko, and he can only be recycled once per death. The recycle is a
 *    condition of the effect (triggered abilities have no costs); the second trigger fails to recycle him and so does
 *    not ready anything.
 * Rules: 808 (Deathknell), 383.3.b ("[do X] to [get Y]" on a trigger), Karthus doubling = two separate trigger items.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KARTHUS = "ogn-236-298";
const EKKO = "ogn-110-298";

/** P1's turn. P1: Karthus (base), Ekko (base), 2 EXHAUSTED mind runes. P2 holds bf1 with an 8-Might Brute that kills Ekko in combat. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Brute" }, "brute")
    .unit(P1, "base", KARTHUS, "karthus")
    .unit(P1, "base", EKKO, "ekko")
    .runes(P1, "mind", 2, { exhausted: true });
}

/** Ekko attacks alone and dies; stop at the first priority window with his Deathknell item(s) on the chain. */
async function ekkoDies(game: Game): Promise<void> {
  await game.p1.move("ekko", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  for (let i = 0; i < 6 && game.chain().length === 0; i++) {
    const d = game.decision();
    if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d?.kind === "action" && !d.passKey && d.options[0]) {
      await game.seat(d.seat).choose(d.options[0].key);
    } else {
      break;
    }
  }
  await game.acceptTriggerOrder();
}

describe("Ruling 64125a9762390e3e — Karthus doubles Ekko's Deathknell, but Ekko recycles (and readies runes) only once", () => {
  test("Ekko's death with Karthus on board puts TWO Deathknell items on the chain; Ekko himself is recycled exactly once", async () => {
    const game = await board().build();
    await ekkoDies(game);
    const items = game.chain().filter((c) => c.cardId === "ekko" && c.triggered);
    expect(items).toHaveLength(2);
    expect(game.zoneOf("ekko")).toBe("mainDeck"); // recycled
    expect(game.p1.deck().filter((c) => c === "ekko")).toHaveLength(1);
  });

  /**
   * Resolve the Deathknell items one at a time; whenever P1's runes come up ready in a priority window, "float" them
   * (tap both for energy) before letting the next item resolve. Returns how many times the runes were readied.
   */
  async function resolveFloating(game: Game): Promise<number> {
    let readied = 0;
    for (let i = 0; i < 8 && game.chain().some((c) => c.cardId === "ekko"); i++) {
      if (game.actingSeat() === P1 && game.p1.runes({ ready: true }).length === 2) {
        readied += 1;
        await game.p1.tapRunes(2);
        expect(game.p1.runes({ ready: true })).toHaveLength(0);
      }
      await game.acting().passPriority();
    }
    await game.settle();
    if (game.p1.runes({ ready: true }).length === 2) {
      readied += 1;
      await game.p1.tapRunes(2);
    }
    return readied;
  }

  test("exactly ONE of the two items readies the runes (the one that recycled Ekko); P1 can float that once for 2 energy", async () => {
    const game = await board().build();
    await ekkoDies(game);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    const readied = await resolveFloating(game);
    expect(readied).toBeGreaterThanOrEqual(1);
    expect(game.p1.energy()).toBeGreaterThanOrEqual(2);
  });

  test("no double value: the other item cannot recycle Ekko again, so across both resolutions the runes ready once — 2 energy total, never 4", async () => {
    const game = await board().build();
    await ekkoDies(game);
    const readied = await resolveFloating(game);
    expect(game.chain()).toEqual([]);
    expect(readied).toBe(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.energy()).toBe(2); // only the one readying's worth
    expect(game.zoneOf("ekko")).toBe("mainDeck");
    expect(game.p1.deck().filter((c) => c === "ekko")).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
