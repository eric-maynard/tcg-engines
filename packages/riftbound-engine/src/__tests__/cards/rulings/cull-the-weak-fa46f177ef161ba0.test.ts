/**
 * Ruling fa46f177ef161ba0 — Cull the Weak (OGN-209 → ogn-209-298) · Spell · Order · 2+[order] "Each player kills one of their units."
 *   (scraped under Cull sfd-134-221 — a name collision; the question is about Cull the Weak)
 *   × Thrill of the Hunt (UNL-184 → unl-184-219) · [Reaction] · 2+[rainbow]
 *     "Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost."
 *
 * Q: Opponent plays Cull the Weak; can I react with Thrill of the Hunt on the unit I'd have to kill, banishing and
 *    replaying it to save it?
 * A: You may, but it likely still dies. Cull the Weak doesn't target — nothing is chosen until it resolves. LIFO: Thrill
 *    resolves first (unit banished and replayed to a battlefield as a new object); then Cull resolves and each player must
 *    kill a unit they control NOW — if the replayed unit is your only unit, you must choose it. (Thrill only "saves" it if
 *    you have another unit to feed to Cull.)
 * Rules: 355.10 (non-targeting choices happen at resolution), 339 (LIFO), 359.3.e.11 (do as much as you can), 124 (new object).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const THRILL = "unl-184-219";

/**
 * P2's turn. P2: Cull the Weak + 2+[order], one Grunt in base. P1: Thrill + 2+[rainbow]; P1 holds bf1 (Anchor optional)
 * with the Pet — the unit P1 wants to save.
 */
function board(opts: { extraP1Unit?: boolean } = {}) {
  const s = scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { order: 1 } })
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Pet" }, "pet", { damage: 1 })
    .unit(P2, "base", { might: 2, name: "Grunt" }, "grunt")
    .hand(P2, CULL_THE_WEAK, "cull")
    .hand(P1, THRILL, "thrill");
  return opts.extraP1Unit ? s.unit(P1, "base", { might: 1, name: "Spare" }, "spare") : s;
}

/** P2 casts Cull; P1 answers with Thrill on the Pet; everyone passes → Thrill resolves; P1 replays the Pet to bf1. */
async function cullThenThrill(game: Game): Promise<void> {
  await game.p2.cast("cull");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P2 })]);
  expect(game.chain()[0]?.targets ?? []).toEqual([]); // Cull the Weak targets nothing
  await game.p2.passPriority();
  expect(game.p1.can("cast", "thrill")).toBe(true);
  await game.p1.cast("thrill", { targets: "pet" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cull", "thrill"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Thrill (top) resolves first
  // The owner replays the banished Pet; pick bf1 if a destination is asked.
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const keys = d.options.map((o) => o.key);
      await game.p1.pick(keys.includes("battlefield-bf1") ? "battlefield-bf1" : (keys[0] as string));
    } else if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else {
      break;
    }
  }
}

describe("Ruling fa46f177ef161ba0 — Thrill of the Hunt in response to Cull the Weak doesn't save your only unit", () => {
  test("LIFO: Thrill resolves first — the Pet is banished and replayed to bf1 as a fresh object (damage gone) while Cull the Weak still waits, unchosen", async () => {
    const game = await board().build();
    await cullThenThrill(game);
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.zoneOf("pet")).toBe("battlefield-bf1");
    expect(game.state("pet").damage).toBe(0); // new object (124)
    expect(game.chain().map((c) => c.cardId)).toEqual(["cull"]);
    expect(game.zoneOf("grunt")).toBe("base");
  });

  test("then Cull resolves: each player kills a unit they control NOW — the replayed Pet is P1's only unit, so it dies anyway (P2 loses the Grunt)", async () => {
    const game = await board().build();
    await cullThenThrill(game);
    await game.settle();
    for (let i = 0; i < 4 && game.decision()?.kind === "pick"; i++) {
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.seat(d.seat).pick((d.options[0]?.card ?? d.options[0]?.key) as string);
        await game.settle();
      }
    }
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.zoneOf("pet")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // Thrill was paid for nothing gained
    expect(game.violations()).toEqual([]);
  });

  test("contrast — with a second P1 unit around, P1 CHOOSES at resolution (a real pick, no decline) and can feed the Spare to Cull: the replayed Pet survives", async () => {
    const game = await board({ extraP1Unit: true }).build();
    await cullThenThrill(game);
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    // Each player with a choice is asked; answer P2's (if asked) with the Grunt and P1's with the Spare.
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind !== "pick") {
        break;
      }
      if (d.seat === P1) {
        expect(d.allowDecline).toBe(false); // P1 MUST kill one
        expect(d.options.map((o) => o.card ?? o.key).toSorted()).toEqual(["pet", "spare"]);
        await game.p1.pick("spare");
      } else {
        await game.p2.pick("grunt");
      }
      await game.settle();
    }
    expect(game.zoneOf("spare")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.zoneOf("pet")).toBe("battlefield-bf1");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
