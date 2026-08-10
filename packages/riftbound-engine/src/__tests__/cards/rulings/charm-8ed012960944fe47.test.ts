/**
 * Ruling 8ed012960944fe47 — Charm (OGN-043 → ogn-043-298) · Spell · Calm · 1+[calm] · "Move an enemy unit."
 *   × Discipline (OGN-058 → ogn-058-298) · [2] [Reaction] "Give a unit +2 [Might] this turn. Draw 1."
 *   × Defy (OGN-045 → ogn-045-298) · 1+[calm] [Reaction] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: Opponent Charms my unit; I respond with Discipline and draw Defy off it — can I Defy the Charm before it resolves?
 * A: Yes. Discipline (top) resolves first and draws Defy; Charm is still on the chain. The controller of the newest
 *    remaining item (the opponent) gets priority first; if they pass, I get priority in a Closed state and may play the
 *    Reaction Defy to counter Charm.
 * Rules: 336–340 (LIFO; 340.4 priority to the controller of the newest remaining item), 307 (Closed state), Reaction timing, 425.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const DISCIPLINE = "ogn-058-298";
const DEFY = "ogn-045-298";

/**
 * P2's turn with exactly 1+[calm]. P1's U (3) holds bf1; P2 holds bf2. P1: Discipline in hand, Defy on TOP of the deck,
 * [3] + [calm] (= Discipline 2 + Defy 1+[calm]).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "U" }, "u")
    .hand(P2, CHARM, "charm")
    .hand(P1, DISCIPLINE, "disc")
    .deck(P1, [DEFY], ["defy"]);
}

/** Charm at U (→ bf2), P2 passes; P1 Disciplines U; both pass → Discipline resolves. Charm remains. */
async function charmThenDisciplineResolves(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("charm", { targets: "u" });
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("battlefield-bf2");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
  await game.p2.passPriority();
  expect(game.p1.can("cast", "disc")).toBe(true);
  await game.p1.cast("disc", { targets: "u" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm", "disc"]); // Charm bottom, Discipline top
  expect(game.p1.hand()).toEqual([]); // Defy not drawn yet
  await game.p1.passPriority();
  await game.p2.passPriority(); // Discipline resolves
  return game;
}

describe("Ruling 8ed012960944fe47 — a Defy drawn off Discipline can still counter the Charm underneath", () => {
  test("Discipline resolves first (LIFO): U gets +2 and P1 draws Defy — while Charm is STILL on the chain and U hasn't moved", async () => {
    const game = await charmThenDisciplineResolves();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("u")).toMatchObject({ might: 5, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toEqual(["defy"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
  });

  test("after Discipline resolves, priority goes FIRST to the opponent (controller of Charm, the newest remaining item) — P1 cannot jump in yet", async () => {
    const game = await charmThenDisciplineResolves();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.can("cast", "defy")).toBe(false); // not P1's priority
  });

  test("the opponent passes → P1 has priority in a Closed state and Defy (Reaction) is legal on Charm (cost 1, one domain); it counters Charm — U never moves, everything spent, no refund to P2", async () => {
    const game = await charmThenDisciplineResolves();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "defy")).toBe(true);
    await game.p1.cast("defy", { targets: "charm" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.state("u")).toMatchObject({ location: "bf1", might: 5, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf2?.contested ?? false).toBe(false);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — if P1 does NOT Defy, Charm resolves and drags U to bf2", async () => {
    const game = await charmThenDisciplineResolves();
    await game.p2.passPriority();
    await game.p1.passPriority();
    for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
      await game.seat(game.decision()!.seat).pick("battlefield-bf2");
    }
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("u")).toBe("bf2");
    expect(game.p1.hand()).toEqual(["defy"]);
  });
});
