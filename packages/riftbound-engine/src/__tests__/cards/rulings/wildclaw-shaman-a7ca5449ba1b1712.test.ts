/**
 * Ruling a7ca5449ba1b1712 — Wildclaw Shaman (OGN-147 → ogn-147-298) · [4] · 3 Might "When you play me, you may spend a buff to
 *     buff me and ready me."
 *   × a buffed friendly Poro (Stalwart Poro ogn-052-298 stands in for the VEN-089 Poro) × Gust (OGN-169 → ogn-169-298) · Reaction
 *     "Return a unit at a battlefield with 3 Might or less to its owner's hand."
 *
 * Q: Does the Shaman's spend-a-buff → buff+ready effect go on the chain so the opponent can Gust in response?
 * A: Yes — it is a triggered ability, so it creates a chain. While it is on the chain the Shaman is still 3 Might (Gust-able if
 *    at a battlefield) and the Poro still has its buff: the buff is removed on RESOLUTION (not as a cost). On resolution: buff
 *    removed from the other unit, Shaman buffed and readied. No targeting is involved.
 * Rules: 383 (triggered abilities use the chain), 702.2 (spending buffs), 340 (respond then resolve).
 * Model note (CR 383.3.a/.b, 204.3.a, 740.4.a.2): it IS a chain item P2 can Gust in response to — but "spend a buff TO …" is the
 *    trigger's BASE COST, so the Poro's buff is spent when P1 opts in at FINALIZATION (383.3.b.1 / 404.1), before P2's window,
 *    not on resolution. RULING-CONFLICT only on that timing nuance (the ruling says "the buff removal happens on resolution, not
 *    as a cost" — pre-Unleashed); everything else in the ruling holds. The Poro un-buffed is a 2, so Gust may take it too.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WILDCLAW_SHAMAN = "ogn-147-298";
const STALWART_PORO = "ogn-052-298";
const GUST = "ogn-169-298";

/** P1's turn. P1 holds bf1 with a BUFFED Stalwart Poro (2+1) and has the Shaman + [4]. P2: Gust + [1][chaos]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 1, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", STALWART_PORO, "poro", { buffed: true })
    .unit(P2, "base", { might: 2, name: "Bystander" }, "foe")
    .hand(P1, WILDCLAW_SHAMAN, "shaman")
    .hand(P2, GUST, "gust");
}

function gustTargets(game: Game): string[] {
  const f = game.p2.option("cast", "gust")?.fields.find((x) => x.arg === "targets" || x.name === "targets");
  return [...new Set((f?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/** Shaman played TO bf1; P1 opts in to its "you may"; P1 passes so P2 holds priority with the trigger on the chain. */
async function shamanPlayedTriggerPending(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("shaman", { to: "bf1" });
  expect(game.zoneOf("shaman")).toBe("battlefield-bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shaman", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "shaman" } });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling a7ca5449ba1b1712 — Wildclaw Shaman's play trigger is a chain item; Gust can answer it", () => {
  test("the effect is a TRIGGERED chain item (no targets chosen); while it is pending the Shaman is still an exhausted, unbuffed 3 — but the Poro's buff is ALREADY spent (CR 383.3.b.1: the base cost, paid at finalization — contra the ruling's 'on resolution')", async () => {
    const game = await shamanPlayedTriggerPending();
    expect(game.chain()[0]?.targets ?? []).toEqual([]); // nothing targeted
    expect(game.state("shaman")).toMatchObject({ isBuffed: false, isExhausted: true, might: 3 });
    expect(game.state("poro")).toMatchObject({ isBuffed: false, might: 2 });
  });

  test("P2 may respond with Gust — both the 3-Might Shaman and the (now 2-Might) Poro at a battlefield are legal targets; Gusting the Shaman bounces it before its trigger resolves", async () => {
    const game = await shamanPlayedTriggerPending();
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(gustTargets(game)).toEqual(["poro", "shaman"]);
    await game.p2.cast("gust", { targets: "shaman" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["shaman", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves first (LIFO)
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("shaman")).toBe("hand");
    expect(game.p1.hand()).toContain("shaman");
    // The Shaman's trigger is still on the chain, to resolve (for whatever it can still do) afterwards.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shaman", triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("shaman")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("no response: the trigger resolves — (the Poro's buff long spent) the Shaman is buffed (3 → 4) and READIED", async () => {
    const game = await shamanPlayedTriggerPending();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("poro")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.state("shaman")).toMatchObject({ isBuffed: true, isReady: true, might: 4, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });
});
