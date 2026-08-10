/**
 * Ruling d7566ff8b75b707e — Hidden Blade (OGN-213 → ogn-213-298) · Action · [2][order] · [Hidden]
 *   "Kill a unit at a battlefield. Its controller draws 2."
 *   × Thrill of the Hunt (UNL-184 → unl-184-219) · Reaction · [2][R]
 *   "Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost."
 *
 * Q: If my opponent answers my Hidden Blade with Thrill of the Hunt, can I still target the same unit?
 * A: No. Hidden Blade's target is locked when it is finalized. Thrill resolves first: the unit is banished and re-played —
 *    a NEW object — so when Hidden Blade resolves its target is illegal and it mistargets: no kill, no draw, no re-targeting.
 * Rules: 355.14.b (targets locked at finalize), 124 (zone change = new object), 359.3.e.9 (mistarget → instruction skipped).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const THRILL_OF_THE_HUNT = "unl-184-219";

/**
 * P1's turn. P2 holds bf1 with Prey (3) and a Holder (1) (so bf1 stays P2's while Prey is away); bf2 is uncontrolled.
 * P1: Hidden Blade in hand with exactly [2][order]. P2: Thrill of the Hunt with exactly [2][R].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Prey" }, "prey")
    .unit(P2, "bf1", { might: 1, name: "Holder" }, "holder")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, THRILL_OF_THE_HUNT, "thrill");
}

/** Hidden Blade at Prey (target locked); P1 passes; P2 answers with Thrill of the Hunt on Prey. */
async function bladeThenThrill(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("blade", { targets: "prey" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["prey"] })]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "thrill")).toBe(true);
  await game.p2.cast("thrill", { targets: "prey" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "thrill"]);
  return game;
}

/** Both pass → Thrill resolves: Prey is banished and P2 (its owner) plays it back — to bf1 again. */
async function thrillResolvesBackToBf1(game: Game): Promise<void> {
  await game.p2.passPriority();
  await game.p1.passPriority();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P2 }); // "its owner plays it to any battlefield"
  const dests = d?.kind === "pick" ? d.options.map((o) => o.zone ?? o.key) : [];
  expect(dests).toEqual(expect.arrayContaining(["battlefield-bf1", "battlefield-bf2"]));
  expect(dests).not.toContain("base");
  await game.p2.pick(d?.kind === "pick" ? (d.options.find((o) => (o.zone ?? o.key) === "battlefield-bf1")?.key ?? "battlefield-bf1") : "battlefield-bf1");
  expect(game.zoneOf("thrill")).toBe("trash");
}

describe("Ruling d7566ff8b75b707e — Thrill of the Hunt makes Hidden Blade's locked target a new object: the Blade mistargets", () => {
  test("Thrill resolves first (LIFO): Prey is banished and re-played by its owner to a battlefield (even the SAME bf1), free; Hidden Blade is still on the chain aimed at the old object", async () => {
    const game = await bladeThenThrill();
    await thrillResolvesBackToBf1(game);
    expect(game.zoneOf("prey")).toBe("battlefield-bf1");
    expect(game.p2.banishment()).toEqual([]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  });

  test("Hidden Blade then resolves and MISTARGETS: Prey is not killed, P2 draws nothing, P1 is not offered a new target; the Blade just goes to the trash", async () => {
    const game = await bladeThenThrill();
    await thrillResolvesBackToBf1(game);
    const p2Hand = game.p2.hand().length;
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.decision()?.kind).not.toBe("pick"); // no re-targeting prompt
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("prey")).toBe("battlefield-bf1");
    expect(game.state("prey").damage).toBe(0);
    expect(game.p2.hand()).toHaveLength(p2Hand); // "its controller draws 2" never happens
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("contrast — no Thrill: Hidden Blade resolves on its locked target: Prey dies and P2 (its controller) draws 2", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "prey" });
    const p2Hand = game.p2.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("prey")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
  });
});
