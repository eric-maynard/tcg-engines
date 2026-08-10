/**
 * Ruling fd5d63aecfc479ab — Bullet Time (OGN-268 → ogn-268-298) · [Action] · Body/Chaos · [1]
 *     "Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *   × Defy (OGN-045 → ogn-045-298) · [Reaction] · Calm · [1][calm] "Counter a spell that costs no more than [4] and no more
 *     than [rainbow]."
 *
 * Q: If I recycle 8 runes into Bullet Time, is it 8 damage to EACH enemy unit there or 8 split among them?
 * A: 8 to each. Nuances: the Power isn't paid until the spell starts to resolve (opponents react blind); Defy can't wait
 *    to see the amount — it targets Bullet Time on the chain before any Power is paid (and then none ever is); you may
 *    tap/recycle runes while resolving Bullet Time to make the payment.
 * Rules: 204.3.b (amount paid on resolution), 437 ("deal N to all" = N to each), 346 / Defy (counter on the chain),
 *        444.2.c / 429.3 (Add abilities usable when told to pay).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BULLET_TIME = "ogn-268-298";
const DEFY = "ogn-045-298";

/**
 * P1: exactly [1], NO floating power, eight ready runes (4 body + 4 chaos). P2 holds bf1 with Colossus (10) and Titan (9)
 * — big enough to show 8 damage marked on EACH — and keeps a Camper (2) in base; P2 has Defy + [1][calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .runes(P1, "body", 4)
    .runes(P1, "chaos", 4)
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 10, name: "Colossus" }, "colossus")
    .unit(P2, "bf1", { might: 9, name: "Titan" }, "titan")
    .unit(P2, "base", { might: 2, name: "Camper" }, "camper")
    .hand(P1, BULLET_TIME, "bt")
    .hand(P2, DEFY, "defy");
}

/** Cast Bullet Time at bf1 and pass it through to its resolution-time payment prompt. */
async function toPayment(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bt", { targets: "bf1" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "integer", seat: P1, source: { cardId: "bt" }, unit: "rainbow" });
  return game;
}

describe("Ruling fd5d63aecfc479ab — 8 [rainbow] into Bullet Time is 8 damage to EACH enemy unit there", () => {
  test("at the resolution-time payment P1 may recycle runes (an Add ability) — 8 recycles float 8 power and the prompt's max follows the pool", async () => {
    const game = await toPayment();
    const d = game.decision();
    const verbs = (d?.kind === "integer" ? (d.actions ?? []) : []).map((a) => a.verb);
    expect(verbs).toContain("recycleRune");
    expect(verbs).toContain("tapRune");
    expect(game.p1.power()).toBe(0);
    for (let i = 0; i < 8; i++) {
      await game.p1.recycleRune();
    }
    expect(game.p1.power()).toBe(8);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ kind: "integer", max: 8, seat: P1 });
  });

  test("paying 8: Colossus (10) and Titan (9) EACH have 8 damage marked — not 8 split between them — and the Camper in base is untouched", async () => {
    const game = await toPayment();
    for (let i = 0; i < 8; i++) {
      await game.p1.recycleRune();
    }
    await game.p1.chooseX(8);
    await game.settle();
    expect(game.p1.power()).toBe(0);
    expect(game.state("colossus").damage).toBe(8);
    expect(game.state("titan").damage).toBe(8);
    expect(game.state("camper").damage).toBe(0);
    expect(game.zoneOf("bt")).toBe("trash");
  });

  test("nuance — Defy targets Bullet Time ON THE CHAIN, before any Power is paid: it is legal then (cost [1], no Power yet), counters it, and P1 is never asked for / never pays any Power", async () => {
    const game = await board().build();
    await game.p1.cast("bt", { targets: "bf1" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
    const defyTargets = (game.p2.option("cast", "defy")?.fields.find((f) => f.arg === "targets")?.options ?? []).map(String);
    expect(defyTargets).toContain("bt");
    await game.p2.cast("defy", { targets: "bt" });
    let askedX = false;
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      askedX ||= game.decision()?.kind === "integer";
      await game.acting().passPriority();
    }
    askedX ||= game.decision()?.kind === "integer";
    expect(askedX).toBe(false);
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.p1.runes({ ready: true })).toHaveLength(8); // nothing recycled / tapped
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("colossus").damage).toBe(0);
    expect(game.state("titan").damage).toBe(0);
  });

  test("nuance — there is no Defy window AFTER the amount is known: once P1 answers the payment the damage is already dealt and Bullet Time has left the chain", async () => {
    const game = await toPayment();
    for (let i = 0; i < 8; i++) {
      await game.p1.recycleRune();
    }
    await game.p1.chooseX(8);
    expect(game.chain().some((c) => c.cardId === "bt")).toBe(false);
    expect(game.state("colossus").damage).toBe(8);
    expect(game.p2.can("cast", "defy")).toBe(false); // nothing left to counter
  });
});
