/**
 * Ruling 1bb176def85dba2e — Spectral Matron (OGN-226 → ogn-226-298) · 4 Might [4][order][order]
 *   "When you play me, you may play a unit costing no more than [3] and no more than [rainbow] from your trash,
 *    ignoring its cost."
 *   × Cruel Patron (OGN-208 → ogn-208-298) · 6 Might [4] "As an additional cost to play me, kill a friendly unit."
 *
 * Q: Can Matron play a 4-energy Cruel Patron, given her "no more than 3 and 1 power" condition?
 * A: No. The limit checks the card's PRINTED cost; Patron's printed 4 exceeds 3. That Matron would set the paid
 *    cost to 0 does not waive the limit.
 * Rules: 131.4 (cost = printed cost for checks), 359.3 (play from trash ignoring cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const SPECTRAL_MATRON = "ogn-226-298";
const CRUEL_PATRON = "ogn-208-298";
const SHIPYARD_SKULKER = "ogn-175-298"; // vanilla 3-cost unit — a legal Matron pick, for contrast

function board(withSkulker: boolean) {
  const s = scenario()
    .battlefield("bf1", { controller: null })
    .trash(P1, CRUEL_PATRON, "patron")
    .hand(P1, SPECTRAL_MATRON, "matron")
    .resources(P1, { energy: 4, power: { order: 2 } });
  return withSkulker ? s.trash(P1, SHIPYARD_SKULKER, "skulker") : s;
}

/** Play Matron to base, opt into her trigger, and let it resolve up to the "play which card" offer (if any). */
async function playMatron(withSkulker: boolean): Promise<Game> {
  const game = await board(withSkulker).build();
  expect(game.state("patron").energyCost).toBe(4); // printed
  await game.p1.play("matron", { to: "base" });
  expect(game.zoneOf("matron")).toBe("base");
  if (game.decision()?.kind === "yes-no") {
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "matron" } });
    await game.p1.yes();
  }
  await game.settle();
  return game;
}

describe("Ruling 1bb176def85dba2e — Spectral Matron checks PRINTED cost: a 4-cost Cruel Patron can't be played off her trigger", () => {
  test("Patron + a 3-cost Skulker in trash: the trigger offers ONLY the Skulker — Patron (printed 4) is not a choice", async () => {
    const game = await playMatron(true);
    // rule 383.3.b (ruling 64025589c9493414) — the trash unit is the trigger's TARGET, named at
    // finalization: with Patron ineligible the lone legal candidate is auto-bound and no prompt is raised.
    const d = game.decision();
    if (d?.kind === "pick") {
      const offered = d.options.map((o) => o.card ?? o.key);
      expect(offered).toContain("skulker");
      expect(offered).not.toContain("patron");
      await game.p1.pick("skulker");
    }
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.zoneOf("patron")).toBe("trash");
    expect(game.p1.energy()).toBe(0); // Matron took all 4; Skulker was free
    expect(game.violations()).toEqual([]);
  });

  test("Patron alone in trash: nothing qualifies — no play happens, Patron stays in the trash, no friendly unit is killed", async () => {
    const game = await playMatron(false);
    // Either no offer at all, or an offer that does not include Patron.
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card ?? o.key)).not.toContain("patron");
      if (d.allowDecline) {
        await game.p1.decline();
      }
      await game.settle();
    }
    expect(game.zoneOf("patron")).toBe("trash");
    expect(game.zoneOf("matron")).toBe("base"); // not sacrificed to a Patron play
    expect(game.p1.units()).toEqual(["matron"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nor can Patron be forced through by naming it: picking 'patron' at the offer is rejected", async () => {
    const game = await playMatron(true);
    if (game.decision()?.kind === "pick") {
      const r = await game.p1.try((p) => p.pick("patron"));
      expect(r.ok).toBe(false);
    }
    await game.settle();
    expect(game.zoneOf("patron")).toBe("trash");
    expect(game.p1.units().sort()).toEqual(["matron", "skulker"]);
  });
});
