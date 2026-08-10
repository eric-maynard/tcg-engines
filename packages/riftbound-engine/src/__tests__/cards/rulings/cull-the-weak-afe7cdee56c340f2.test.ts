/**
 * Ruling afe7cdee56c340f2 — Cull the Weak (OGN-209 → ogn-209-298) · [2][order] · "Each player kills one of their units."
 *   × Thrill of the Hunt (UNL-184 → unl-184-219) · Reaction · [2][fury] · "Banish a friendly unit, then its owner plays it to any
 *     battlefield, ignoring its cost."   (Cull sfd-134-221 in the scrape is a name collision.)
 *
 * Q: I Cull the Weak a Rengar player; can they Thrill of the Hunt "the target" to save it?
 * A: They may respond with Thrill (it resolves first: the unit is banished and re-played to a battlefield as a new object), but
 *    Cull the Weak does not target — each player chooses a unit to kill only when it RESOLVES. If the re-played unit is still their
 *    only unit, they must kill it anyway ("do as much as you can"); they cannot choose "no unit".
 * Rules: 355 (no targets chosen at play), 359.3.e.11 (do as much as you can), 336–340 (LIFO), 419.4 (played via effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const THRILL = "unl-184-219";

/** P1's turn: Cull in hand with [2][order], a Pawn (1) in base. P2: Cub (2) in base (+ optionally a Spare 3), Thrill with [2][fury]; bf1/bf2 exist. */
function board(withSpare: boolean) {
  const s = scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 1, name: "Pawn" }, "pawn")
    .unit(P2, "base", { might: 2, name: "Cub" }, "cub")
    .hand(P1, CULL_THE_WEAK, "cull")
    .hand(P2, THRILL, "thrill");
  return withSpare ? s.unit(P2, "bf2", { might: 3, name: "Spare" }, "spare") : s;
}

/** P1 casts Cull; P2 responds with Thrill on the Cub and re-plays it to bf2; stop when Cull is about to resolve / resolving. */
async function cullAnsweredByThrill(withSpare: boolean): Promise<Game> {
  const game = await board(withSpare).build();
  await game.p1.cast("cull");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
  expect(game.chain()[0]?.targets ?? []).toEqual([]); // Cull the Weak chooses nothing when played
  await game.p1.passPriority();
  expect(game.p2.can("cast", "thrill")).toBe(true);
  await game.p2.cast("thrill", { targets: "cub" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cull", "thrill"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Thrill resolves first (LIFO)
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P2 }); // "its owner plays it to any battlefield"
  expect(game.zoneOf("cub")).toBe("banishment");
  await game.p2.pick("battlefield-bf2");
  expect(game.zoneOf("cub")).toBe("battlefield-bf2");
  expect(game.zoneOf("thrill")).toBe("trash");
  expect(game.chain().map((c) => c.cardId)).toContain("cull"); // Cull still waiting underneath
  return game;
}

describe("Ruling afe7cdee56c340f2 — Thrill of the Hunt dodges nothing: Cull the Weak chooses on resolution", () => {
  test.failing("BUG: Cub is P2's ONLY unit: after Thrill re-plays it to bf2, Cull resolves and P2 must still kill a unit — the Cub dies anyway (and P1 kills the Pawn)", async () => {
    const game = await cullAnsweredByThrill(false);
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).pass();
      } else if (d?.kind === "pick") {
        // Whoever is asked has exactly their own unit(s) and no way to decline.
        expect(d.allowDecline).toBe(false);
        const mine = d.seat === P2 ? ["cub"] : ["pawn"];
        expect(d.options.map((o) => o.card ?? o.key)).toEqual(mine);
        await game.seat(d.seat).pick(mine[0] as string);
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.zoneOf("cub")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.p2.units()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test.failing("BUG: with a second unit (Spare) P2 is not locked into the Cub: on resolution P2 is asked to choose among BOTH and may kill the Spare — the re-played Cub survives at bf2", async () => {
    const game = await cullAnsweredByThrill(true);
    let p2Asked = false;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).pass();
      } else if (d?.kind === "pick" && d.seat === P2) {
        p2Asked = true;
        expect(d.allowDecline).toBe(false);
        expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["cub", "spare"]);
        await game.p2.pick("spare");
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("pawn");
      } else {
        break;
      }
    }
    await game.settle();
    expect(p2Asked).toBe(true);
    expect(game.zoneOf("spare")).toBe("trash");
    expect(game.zoneOf("cub")).toBe("battlefield-bf2");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("cull")).toBe("trash");
  });
});
