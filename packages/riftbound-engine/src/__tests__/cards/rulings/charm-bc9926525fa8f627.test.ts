/**
 * Ruling bc9926525fa8f627 — Charm (OGN-043 → ogn-043-298) × Not So Fast (SFD-045 → sfd-045-221)
 *   Charm ([1][calm], Action): "Move an enemy unit."
 *   Not So Fast ([2][calm], Reaction): "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *
 * Q: Can you counter Charm with Not So Fast?
 * A: Yes. Your opponent's Charm targets (chooses) the unit it moves — YOUR unit, i.e. "friendly" from your point of view — so it
 *    is an enemy spell that chooses a friendly unit: a legal object for Not So Fast.
 * Rules: 355.5 / 355.9.b (a spell "chooses" its targets; friendly/enemy are relative to Not So Fast's controller), 425 (counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const NOT_SO_FAST = "sfd-045-221";
const DISCIPLINE = "ogn-058-298"; // [2] Reaction "Give a unit +2 [Might] this turn. Draw 1." — P2 aiming it at P2's OWN unit (contrast)

/**
 * P2's turn ("your opponent plays Charm"). P1: Sentinel (3) holding bf1, Not So Fast in hand with exactly [2][calm].
 * P2: Brute (4) in base, Charm (+ Discipline for the contrast) in hand, [3][calm]. bf2 is empty/uncontrolled.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Sentinel" }, "sentinel")
    .unit(P2, "base", { might: 4, name: "Brute" }, "brute")
    .hand(P1, NOT_SO_FAST, "nsf")
    .hand(P2, CHARM, "charm")
    .hand(P2, DISCIPLINE, "discipline");
}

/** P2 casts Charm on P1's Sentinel (→ bf2 if a destination is asked) and passes → P1 holds priority. */
async function charmOnSentinel(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("charm", { targets: "sentinel" });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("battlefield-bf2");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", controller: P2, targets: ["sentinel"] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling bc9926525fa8f627 — Not So Fast counters an opposing Charm", () => {
  test("Charm on the chain CHOSE P1's Sentinel (friendly to P1, the spell is P2's = enemy) → Not So Fast is castable and is offered exactly Charm as its object", async () => {
    const game = await charmOnSentinel();
    expect(game.p1.can("cast", "nsf")).toBe(true);
    const offered = (game.p1.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["charm"]);
  });

  test("casting it: [2][calm] paid, Not So Fast resolves first and counters Charm — Charm goes to the trash without effect and the Sentinel never moves", async () => {
    const game = await charmOnSentinel();
    await game.p1.cast("nsf", { targets: "charm" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm", "nsf"]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // Not So Fast resolves
    expect(game.zoneOf("nsf")).toBe("trash");
    const charmItem = game.chain().find((c) => c.cardId === "charm");
    if (charmItem) {
      expect(charmItem.countered).toBe(true); // still listed but marked countered …
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("charm")).toBe("trash"); // … and removed without resolving
    expect(game.locationOf("sentinel")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control — uncountered, Charm does move the Sentinel off bf1", async () => {
    const game = await charmOnSentinel();
    await game.p1.passPriority();
    await game.settle();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("sentinel")).not.toBe("bf1");
  });

  test("perspective contrast — an enemy spell that chooses an ENEMY unit (P2's Discipline on P2's own Brute) is no object for P1's Not So Fast", async () => {
    const game = await board().build();
    await game.p2.cast("discipline", { targets: "brute" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "nsf")).toBe(false);
    const r = await game.p1.try((p) => p.cast("nsf", { targets: "discipline" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("nsf")).toBe("hand");
  });
});
