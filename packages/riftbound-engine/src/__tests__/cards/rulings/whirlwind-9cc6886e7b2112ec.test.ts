/**
 * Ruling 9cc6886e7b2112ec — Whirlwind (OGN-187 → ogn-187-298) · [3][chaos] Action
 *     "Starting with the next player, each player may return a unit to its owner's hand."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298, battlefield) "When a player chooses a friendly unit here with a spell
 *     for the first time each turn, they draw 1."
 *   × Pouty Poro (OGN-013 → ogn-013-298) · 2 Might · [Deflect]
 *
 * Q: Does Whirlwind target — does it set off Deflect / The Dreaming Tree?
 * A: No. "Each player may return a unit" is a player choice made at resolution, not targeting; so neither Deflect's
 *    surcharge nor the Dreaming Tree's "chooses … with a spell" trigger applies.
 * Rules: 355.2 / 355.10.e (choices at resolution are not targets), 809 (Deflect taxes being CHOSEN as a target),
 *        383.4.b (targeting triggers fire on finalize).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WHIRLWIND = "ogn-187-298";
const DREAMING_TREE = "ogn-292-298";
const POUTY_PORO = "ogn-013-298";
const EN_GARDE = "ogn-046-298"; // control: a spell that DOES choose a friendly unit

/**
 * P1's turn. P1 holds the LIVE Dreaming Tree with a friendly Dreamer (3) there; P2's Pouty Poro (Deflect) is also there.
 * P1: Whirlwind, exactly [3]+[chaos] and ONE spare rainbow power (which a Deflect tax would consume).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1, rainbow: 1 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P2, "tree", POUTY_PORO, "poro")
    .hand(P1, WHIRLWIND, "ww")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Cast Whirlwind, both pass; P2 (next player) is asked first and declines; returns with P1's pick pending. */
async function castAndReachP1Choice(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.option("cast", "ww")?.fields.map((f) => f.arg) ?? []).not.toContain("targets"); // nothing chosen on cast
  await game.p1.cast("ww");
  // Only Whirlwind on the chain — no Dreaming Tree item was created by casting it.
  expect(game.chain().map((c) => c.cardId)).toEqual(["ww"]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 1 } });
  await game.acting().passPriority();
  await game.acting().passPriority();
  const d2 = game.decision();
  expect(d2).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "ww" } });
  expect(d2?.kind === "pick" ? d2.allowDecline : undefined).toBe(true);
  await game.p2.decline();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "ww" } });
  return game;
}

describe("Ruling 9cc6886e7b2112ec — Whirlwind does not target: no Dreaming Tree draw, no Deflect tax", () => {
  // BUG: the engine treats Whirlwind's resolution-time "may return a unit" pick as "choosing a friendly unit here with a
  // spell" — a Dreaming Tree draw trigger lands on the chain and P1 draws d1. Expected: no trigger, no draw.
  test("ruling 9cc6886e7b2112ec — engine fires The Dreaming Tree on Whirlwind's resolution-time choice. P1 returns its OWN Dreamer at the Tree: unit to hand, the Tree never triggers, P1 draws nothing", async () => {
    const game = await castAndReachP1Choice();
    await game.p1.pick("dreamer");
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
    await game.settle();
    expect(game.zoneOf("dreamer")).toBe("hand");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["dreamer"]); // no d1 — no draw
    expect(game.p1.deck()[0]).toBe("d1");
    expect(game.violations()).toEqual([]);
  });

  test("P1 returns P2's Pouty Poro: Deflect does not apply — the Poro is offered, goes to P2's hand, and P1's spare power is untouched", async () => {
    const game = await castAndReachP1Choice();
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("poro");
    const poroOpt = d?.kind === "pick" ? d.options.find((o) => (o.card ?? o.key) === "poro") : undefined;
    expect(poroOpt?.deflect ?? 0).toBe(0);
    await game.p1.pick("poro");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("hand");
    expect(game.p2.hand()).toContain("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 1 } }); // no [rainbow] Deflect tax
    expect(game.p1.hand()).toEqual([]); // and still no Dreaming Tree draw
  });

  test("control: a spell that DOES choose the friendly Dreamer at the Tree (En Garde) puts the Tree's draw trigger on the chain", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
      .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
      .hand(P1, EN_GARDE, "engarde")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .build();
    await game.p1.cast("engarde", { targets: "dreamer" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde", "tree"]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
  });
});
