/**
 * Ruling 8651691b8ee8b8c9 — En Garde (OGN-046 → ogn-046-298) × Gust (OGN-169 → ogn-169-298)
 *   × Irelia, Fervent (SFD-057 → sfd-057-221) × Blade Dancer (SFD-195 → sfd-195-221)
 *
 *   En Garde — Reaction [1]: "Give a friendly unit +1 [Might] this turn, then an additional +1 … if alone there."
 *   Gust — Reaction [1]: "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   Irelia, Fervent — 4 Might, [Deflect]: "When you choose or ready me, give me +1 [Might] this turn."
 *   Blade Dancer (legend): "When you choose a friendly unit, you may exhaust me and pay [rainbow] to ready it."
 *
 * Q: Opponent's Irelia is at 3 Might. They En Garde her and use Blade Dancer on the choose. Can I Gust her
 *    before she readies / gets +1?
 * A: Yes. Casting En Garde puts Irelia's +1 trigger and Blade Dancer's ready trigger on the chain; you then get
 *    priority and Gust goes on top. LIFO: Gust resolves first while she is still 3 Might → returned to hand.
 *    The two triggers and En Garde then resolve with their unit gone and do nothing (359.3.e.12 / 359.3.e.5).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EN_GARDE = "ogn-046-298";
const GUST = "ogn-169-298";
const IRELIA = "sfd-057-221";
const BLADE_DANCER = "sfd-195-221";

/**
 * P1 (the opponent in the question) is the turn player: Blade Dancer ready, 1 energy + 1 rainbow, En Garde in
 * hand, an EXHAUSTED Irelia alone at bf1 sitting at 3 Might (a lingering -1 this turn). P2 (me) holds Gust with
 * 1 energy + 1 rainbow (Gust's [1] plus Irelia's [Deflect] surcharge).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .resources(P2, { energy: 1, power: { rainbow: 1 } })
    .legend(P1, BLADE_DANCER, "bd")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", IRELIA, "irelia", { exhausted: true, mightModifier: -1 })
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, EN_GARDE, "engarde")
    .hand(P2, GUST, "gust");
}

/** P1 casts En Garde on Irelia and opts into Blade Dancer (exhaust + [rainbow]); returns once P1 holds chain priority. */
async function enGardeWithLegend(game: Game): Promise<void> {
  expect(game.state("irelia").might).toBe(3);
  expect(game.state("irelia").isExhausted).toBe(true);
  await game.p1.cast("engarde", { targets: "irelia" });
  expect(game.p1.energy()).toBe(0);
  // Blade Dancer's "you may exhaust me and pay [rainbow]" is asked of P1 as the trigger is finalized.
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      expect(d).toMatchObject({ canAccept: true, source: { cardId: "bd" } });
      await game.p1.yes();
    } else if (d?.kind === "order" && d.seat === P1) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.state("bd").isExhausted).toBe(true);
  expect(game.p1.power("rainbow")).toBe(0);
  const ids = game.chain().map((c) => c.cardId);
  expect(ids[0]).toBe("engarde");
  expect(ids.slice(1).sort()).toEqual(["bd", "irelia"]);
  // Nothing has resolved: she is still exhausted and still 3 Might.
  expect(game.state("irelia")).toMatchObject({ isExhausted: true, might: 3 });
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

describe("Ruling 8651691b8ee8b8c9 — Gust answers En Garde + Blade Dancer before Irelia readies or grows", () => {
  test("after En Garde is played, both triggers sit on the chain above it and P2 gets priority with Gust legal on the 3-Might Irelia", async () => {
    const game = await board().build();
    await enGardeWithLegend(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    const offered = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered.flatMap((v) => (Array.isArray(v) ? v : [v]))).toContain("irelia");
    await game.p2.cast("gust", { targets: "irelia" });
    // Gust [1] + Deflect [rainbow] paid.
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain().at(-1)).toMatchObject({ cardId: "gust", controller: P2 });
    expect(game.chain()).toHaveLength(4);
  });

  test("LIFO: Gust resolves first and returns Irelia (still 3 Might, still exhausted) to P1's hand", async () => {
    const game = await board().build();
    await enGardeWithLegend(game);
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "irelia" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("irelia")).toBe("hand");
    expect(game.p1.hand()).toContain("irelia");
    // The triggers and En Garde are still waiting below.
    expect(game.chain().map((c) => c.cardId)[0]).toBe("engarde");
    expect(game.chain()).toHaveLength(3);
  });

  test("the remaining triggers and En Garde then resolve with Irelia gone and do nothing: she stays in hand, En Garde is trashed, the legend stays exhausted and nothing is refunded", async () => {
    const game = await board().build();
    await enGardeWithLegend(game);
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "irelia" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("irelia")).toBe("hand");
    expect(game.zoneOf("engarde")).toBe("trash");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.state("bd").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — P2 does NOT Gust: the triggers resolve (Irelia readied by Blade Dancer, +1 chosen, +1 readied) and En Garde adds +2 (alone) — she ends ready and well above Gust range", async () => {
    const game = await board().build();
    await enGardeWithLegend(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("irelia")).toBe("battlefield-bf1");
    expect(game.state("irelia").isReady).toBe(true);
    expect(game.state("irelia").might).toBeGreaterThan(3);
    expect(game.zoneOf("engarde")).toBe("trash");
  });
});
