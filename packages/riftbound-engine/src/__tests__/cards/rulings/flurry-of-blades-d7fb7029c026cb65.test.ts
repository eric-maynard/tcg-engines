/**
 * Ruling d7fb7029c026cb65 — Flurry of Blades (OGN-133 → ogn-133-298) · Reaction · Body · 1 · "Deal 1 to all units at battlefields."
 *   × Immortal Phoenix (OGN-037 → ogn-037-298) · 3 Might · "[Assault 2] When you kill a unit with a spell, you may pay [1][fury] to
 *     play me from your trash."
 *
 * Q: Flurry of Blades kills a unit while a chain is resolving. Does the Phoenix's trigger join the chain right away (after Flurry
 *    resolves) or wait for the next Open State?
 * A: Right away. Flurry resolves → the Phoenix trigger is put on the chain (above whatever is still there) → players may react →
 *    it resolves: you may pay [1][fury]; if you do the Phoenix is put on the chain as a pending item, finalized (choose where it
 *    goes) and resolves immediately — all before the older items underneath resolve.
 * Rules: 383.3 (triggers become pending items and finalize at the next opportunity, mid-chain), 337–340, 157.3.a.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLURRY_OF_BLADES = "ogn-133-298";
const IMMORTAL_PHOENIX = "ogn-037-298";
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt",
  timing: "action",
} as const;

/**
 * P2's turn. P2 Bolts (2) P1's 3-Might Target in base — the chain Flurry will be played INTO. P1: Flurry in hand, Immortal Phoenix
 * in the TRASH, exactly [2] + [fury] (1 for Flurry, [1][fury] for the Phoenix). P2's 1-Might Wisp sits at P2's bf1; P1's Anchor (4)
 * holds bf2 (survives the 1).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 1, name: "Wisp" }, "wisp")
    .unit(P1, "bf2", { might: 4, name: "Anchor" }, "anchor")
    .unit(P1, "base", { might: 3, name: "Target" }, "tgt")
    .trash(P1, IMMORTAL_PHOENIX, "phoenix")
    .hand(P1, FLURRY_OF_BLADES, "flurry")
    .hand(P2, BOLT, "bolt");
}

const chainView = (game: Game) => game.chain().map((c) => (c.triggered ? `${c.cardId}*` : c.cardId));

/** Bolt on the chain; P1 responds with Flurry; both pass once so ONLY Flurry resolves (Bolt still waiting). */
async function flurryResolvesMidChain(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("bolt", { targets: "tgt" });
  await game.p2.passPriority();
  await game.p1.cast("flurry");
  expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  expect(chainView(game)).toEqual(["bolt", "flurry"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Flurry resolves: 1 to Wisp (dies) and Anchor
  expect(game.zoneOf("flurry")).toBe("trash");
  expect(game.zoneOf("wisp")).toBe("trash");
  expect(game.state("anchor").damage).toBe(1);
  expect(game.zoneOf("bolt")).toBe("chain"); // the chain is still resolving
  return game;
}

describe("Ruling d7fb7029c026cb65 — Immortal Phoenix triggers mid-chain, right after Flurry of Blades resolves", () => {
  test("the Phoenix's trigger is on the chain IMMEDIATELY after Flurry resolves — above the still-pending Bolt, not deferred to an Open State", async () => {
    const game = await flurryResolvesMidChain();
    // The opt-in payment may be asked as the item finalizes; either way the item exists now, above Bolt.
    expect(chainView(game)).toEqual(["bolt", "phoenix*"]);
    expect(game.zoneOf("phoenix")).toBe("trash"); // it triggers FROM the trash
    expect(game.decision()?.seat).toBe(P1);
    expect(game.state("tgt").damage).toBe(0); // Bolt has not resolved
  });

  test("P1 opts to pay [1][fury]; both players then get priority to react to the Phoenix item while Bolt is still underneath", async () => {
    const game = await flurryResolvesMidChain();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "phoenix" } });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2 can react to it
    expect(chainView(game)).toEqual(["bolt", "phoenix*"]);
  });

  test("the trigger resolves: the Phoenix becomes a pending item, P1 makes its choices (where it goes), and it resolves at once onto the board — BEFORE Bolt, which only resolves afterwards", async () => {
    const game = await flurryResolvesMidChain();
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Phoenix trigger resolves
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "phoenix" } });
    const dests = game.decision()?.kind === "pick" ? (game.decision() as { options: { key: string }[] }).options.map((o) => o.key).sort() : [];
    expect(dests).toEqual(["base", "battlefield-bf2"]);
    await game.p1.pick("base");
    expect(game.zoneOf("phoenix")).toBe("base"); // played from the trash, resolved immediately
    expect(game.state("phoenix")).toMatchObject({ isExhausted: true, might: 3 });
    expect(chainView(game)).toEqual(["bolt"]); // Bolt STILL waiting underneath
    expect(game.state("tgt").damage).toBe(0);
    await game.settle(); // now Bolt
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.state("tgt").damage).toBe(2);
    expect(game.p1.units().toSorted()).toEqual(["anchor", "phoenix", "tgt"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("declining: the Phoenix stays in the trash, nothing is paid, and Bolt then resolves as usual", async () => {
    const game = await flurryResolvesMidChain();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.state("tgt").damage).toBe(2);
  });
});
