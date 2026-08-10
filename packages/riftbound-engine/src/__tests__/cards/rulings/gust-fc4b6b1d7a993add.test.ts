/**
 * Ruling fc4b6b1d7a993add — Gust (OGN-169 → ogn-169-298) · [Reaction] · [1][chaos] · "Return a unit at a battlefield with
 *   3 [Might] or less to its owner's hand."
 *   × Blastcone Fae (OGN-097 → ogn-097-298) · 2 Might · [Hidden] "When you play me, give a unit -2 [Might] this turn, to a
 *   minimum of 1 [Might]."
 *
 * Q: Can you Gust a Blastcone Fae that was just played from face-down before it gives your unit -2?
 * A: You can Gust it, but that does not stop the ability: the trigger is on the chain and its TARGET (your unit) is still
 *    legal — the ability doesn't care where the Fae is when it resolves. (From-hidden abilities pick their targets from
 *    that battlefield; there is no implicit "here" on the source.) Moving the TARGETED unit away instead does void it.
 * Rules: 811 (play from hidden; targets chosen at that battlefield), 359.3.e.5 (targets re-checked on resolution),
 *        359 (an ability resolves independently of its source leaving the board), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLASTCONE_FAE = "ogn-097-298";
const GUST = "ogn-169-298";
const FLASH = "ogs-011-024"; // [Reaction] "Move up to 2 friendly units to base." — P2's way to move the TARGET instead

type PickD = Extract<Decision, { kind: "pick" }>;

/** P2's turn. P1 holds bf1 with a Keeper (3) and has Blastcone Fae face down there. P2: Raider (5) in base, Gust + Flash
 * in hand, [3] + [chaos]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Keeper" }, "keeper")
    .facedown(P1, "bf1", BLASTCONE_FAE, "fae")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P2, GUST, "gust")
    .hand(P2, FLASH, "flash");
}

/** Raider attacks bf1; P2 passes Focus; P1 flips the Fae (free) and aims its trigger at the Raider; P1 passes → P2's priority. */
async function faeFlippedOnRaider(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "fae")).toBe(true);
  await game.p1.reveal("fae");
  expect(game.locationOf("fae")).toBe("bf1");
  expect(game.p1.energy()).toBe(0); // for [0]
  // The from-hidden trigger picks its target among the units AT bf1 (finalization).
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect((d as PickD).options.map((o) => o.card ?? o.key)).toEqual(expect.arrayContaining(["keeper", "raider"]));
  await game.p1.pick("raider");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fae", controller: P1, targets: ["raider"], triggered: true })]);
  expect(game.state("raider").might).toBe(5); // nothing applied yet
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling fc4b6b1d7a993add — Gusting the freshly flipped Blastcone Fae does not stop its -2", () => {
  test("P2 CAN Gust the Fae (2 Might, at a battlefield) in response; LIFO bounces the Fae to P1's hand first — but the trigger stays on the chain", async () => {
    const game = await board().build();
    await faeFlippedOnRaider(game);
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "fae" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fae", "gust"]);
    for (let i = 0; i < 4 && game.zoneOf("gust") === "chain"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("fae")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["fae"]);
  });

  test("the trigger then resolves: its target (the Raider, still at bf1) is legal regardless of where the Fae went ⇒ Raider 5 → 3 this turn", async () => {
    const game = await board().build();
    await faeFlippedOnRaider(game);
    await game.p2.cast("gust", { targets: "fae" });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fae")).toBe("hand");
    expect(game.state("raider")).toMatchObject({ might: 3, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("nuance — moving the TARGET instead voids it: P2 Flashes the Raider home in response; the Fae's trigger resolves with an illegal target and the Raider keeps 5 Might", async () => {
    const game = await board().build();
    await faeFlippedOnRaider(game);
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: ["raider"] });
    expect(game.chain().at(-1)).toMatchObject({ cardId: "flash", controller: P2 });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("raider")).toBe("base");
    expect(game.state("raider").might).toBe(5);
    expect(game.locationOf("fae")).toBe("bf1"); // the Fae itself stayed
    expect(game.violations()).toEqual([]);
  });
});
