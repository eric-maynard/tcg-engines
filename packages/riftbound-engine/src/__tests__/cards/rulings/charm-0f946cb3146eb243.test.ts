/**
 * Ruling 0f946cb3146eb243 — Charm (OGN-043 → ogn-043-298, 1 + [calm]) "Move an enemy unit."
 *   × Not So Fast (sfd-045-221, Reaction, 2 + [calm]) "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Defy (ogn-045-298, Reaction, 1 + [calm]) "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: Opponent Charms my unit; I Not So Fast it; they Defy my Not So Fast; can I Not So Fast the Charm AGAIN?
 * A: Yes. Each Not So Fast is its own chain item. Chain: Charm → NSF#1 → Defy → NSF#2 (top). LIFO: NSF#2 counters
 *    Charm first; then Defy counters NSF#1 (now irrelevant); Charm is countered and the move never happens.
 * Rules: 340.1 (newest item resolves first), 425.1.a (countered → does nothing, to trash), 336 (Reactions on a chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const NOT_SO_FAST = "sfd-045-221";
const DEFY = "ogn-045-298";

/**
 * P2's turn. P1's Mine (3) holds bf1; bf2 is P2's (a Charm destination). P2: Charm + Defy, exactly 2 energy + 2 calm.
 * P1: two Not So Fast, exactly 4 energy + 2 calm.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 4, power: { calm: 2 } })
    .resources(P2, { energy: 2, power: { calm: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
    .hand(P2, CHARM, "charm")
    .hand(P2, DEFY, "defy")
    .hand(P1, NOT_SO_FAST, "nsf1")
    .hand(P1, NOT_SO_FAST, "nsf2");
}

/** Charm(mine → bf2) · NSF#1(charm) · Defy(nsf1) — P2 has just passed with Defy on top; P1 holds priority. */
async function upToDefy(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("charm", { targets: "mine" });
  const d = game.decision();
  if (d?.kind === "pick" && d.semantics === "destination") {
    await game.p2.pick(d.options.find((o) => o.key === "battlefield-bf2")?.key as string);
  }
  await game.p2.passPriority();
  await game.p1.cast("nsf1", { targets: "charm" });
  await game.p1.passPriority();
  expect(game.p2.can("cast", "defy")).toBe(true);
  await game.p2.cast("defy", { targets: "nsf1" });
  await game.p2.passPriority();
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm", "nsf1", "defy"]);
  expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 });
  return game;
}

describe("Ruling 0f946cb3146eb243 — a second Not So Fast on the Charm resolves before their Defy matters", () => {
  test("YES you can: with Charm · NSF#1 · Defy on the chain, P1's second Not So Fast is legal and Charm is (still) its legal target; the chain becomes Charm → NSF#1 → Defy → NSF#2", async () => {
    const game = await upToDefy();
    expect(game.p1.can("cast", "nsf2")).toBe(true);
    const field = game.p1.option("cast", "nsf2")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toContain("charm");
    await game.p1.cast("nsf2", { targets: "charm" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm", "nsf1", "defy", "nsf2"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.locationOf("mine")).toBe("bf1"); // nothing has resolved yet
  });

  test("LIFO (340.1): NSF#2 resolves first and COUNTERS Charm — Charm leaves the chain for the trash while NSF#1 and Defy are still pending", async () => {
    const game = await upToDefy();
    await game.p1.cast("nsf2", { targets: "charm" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // NSF#2 resolves
    expect(game.zoneOf("nsf2")).toBe("trash");
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["nsf1", "defy"]);
    expect(game.locationOf("mine")).toBe("bf1");
  });

  test("then Defy counters NSF#1 (irrelevant by now); everything ends in the trash, the chain is empty, and Mine NEVER moved (425.1.a)", async () => {
    const game = await upToDefy();
    await game.p1.cast("nsf2", { targets: "charm" });
    for (let i = 0; i < 10 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    for (const c of ["charm", "nsf1", "defy", "nsf2"]) {
      expect(game.zoneOf(c)).toBe("trash");
    }
    expect(game.locationOf("mine")).toBe("bf1");
    expect(game.state("mine").controller).toBe(P1);
    expect(game.cardsAt("bf2")).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast ('the only way around it'): if P1 does NOT play the second Not So Fast, Defy counters NSF#1 and Charm resolves — Mine is moved to bf2", async () => {
    const game = await upToDefy();
    for (let i = 0; i < 10 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("nsf1")).toBe("trash");
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("mine")).toBe("bf2");
    expect(game.zoneOf("nsf2")).toBe("hand");
  });
});
