/**
 * Ruling fb65289607a1db44 — Ekko, Recurrent (OGN-110 → ogn-110-298) · 5 Might "[Accelerate] [Deathknell] — Recycle me to
 *     ready your runes."
 *   × The Zero Drive (SFD-090 → sfd-090-221) · Equipment +2 "… [Deathknell] — Banish me." (appended to the wearer)
 *   × Karthus, Eternal (OGN-236 → ogn-236-298) "Your [Deathknell] effects trigger an additional time."
 *
 * Q: Ekko wearing The Zero Drive dies (with Karthus out). Recycle then banish, or banish then recycle? Runes back twice?
 * A: Several Deathknell triggers go on the chain (Ekko's twice via Karthus, plus the Drive's); their controller orders
 *    them and reactions are possible between resolutions. Only ONE effect that moves Ekko can succeed: recycle him (runes
 *    readied) OR banish him — never both (a recycled Ekko can't then be banished, a banished one can't be recycled), and
 *    the runes are readied only once.
 * Rules: 808 (Deathknell), 383.3.d (controller orders simultaneous triggers), 340 (LIFO, priority between items),
 *        124 (zone change ⇒ new object: the later effect can't find him), 383.3.b / 204.3.a ("Recycle me to …" = cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EKKO = "ogn-110-298";
const ZERO_DRIVE = "sfd-090-221";
const KARTHUS = "ogn-236-298";
/** P1's own plain kill so Ekko dies on P1's turn with an otherwise empty chain. */
const CULL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Cull",
  timing: "action",
} as const;

/** P1's turn with [1] (Cull). Karthus in base; Ekko (5, +2 from the worn Zero Drive) in base; P1's two mind runes are EXHAUSTED. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", KARTHUS, "karthus")
    .unit(P1, "base", EKKO, "ekko", { equippedWith: ["zd"] })
    .gear(P1, ZERO_DRIVE, "zd", { attachedTo: "ekko" })
    .runes(P1, "mind", 2, { exhausted: true })
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, CULL, "cull");
}

/** Cull Ekko and let the Cull resolve → Ekko dies; stops at the first decision after the death. */
async function ekkoDies(): Promise<Game> {
  const game = await board().build();
  expect(game.state("ekko")).toMatchObject({ attachments: ["zd"], might: 7 });
  await game.p1.cast("cull", { targets: "ekko" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("cull")).toBe("trash");
  return game;
}

describe("Ruling fb65289607a1db44 — Ekko + Zero Drive + Karthus: several Deathknells, one controller orders them, only one 'move Ekko' can stick", () => {
  test("Ekko dies: at least three P1-controlled Deathknell items are on the chain and P1 is OFFERED their order (383.3.d) before anyone gets priority", async () => {
    const game = await ekkoDies();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    expect(d?.kind === "order" ? d.items.length : 0).toBeGreaterThanOrEqual(3);
    const items = game.chain().filter((c) => c.triggered);
    expect(items.length).toBeGreaterThanOrEqual(3); // Ekko ×2 (Karthus) + the Drive-granted "Banish me" (also doubled)
    expect(items.every((c) => c.controller === P1 && c.cardId === "ekko")).toBe(true);
    expect(game.p1.runes({ ready: true })).toHaveLength(0); // nothing has resolved yet
  });

  // RULING-CONFLICT: riftjudge fb65289607a1db44 treats "Recycle me" as an effect P1 can order after the banish ("banish
  // first, then the recycle fails"); CR 383.3.b / 204.3.a say "Recycle me TO ready your runes" is the trigger's BASE COST,
  // paid as the item is finalized — before any item resolves — so Ekko is already in the deck when ordering is offered
  // and "banish first" is not reachable. Engine follows CR.
  test("'Recycle me' is paid at finalization: Ekko is already in P1's Main Deck (the Drive fell off to base) while the triggers still wait on the chain", async () => {
    const game = await ekkoDies();
    expect(game.zoneOf("ekko")).toBe("mainDeck");
    expect(game.p1.trash()).toEqual(["cull"]);
    expect(game.state("zd")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.chain().length).toBeGreaterThanOrEqual(3);
  });

  test("reactions are possible between resolutions: after the order offer P1 then P2 hold chain priority, and again after each item resolves (the chain shrinks one item per pass-pass)", async () => {
    const game = await ekkoDies();
    await game.acceptTriggerOrder();
    const sizes: number[] = [];
    for (let i = 0; i < 12 && game.chain().length > 0; i++) {
      expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
      sizes.push(game.chain().length);
      await game.p1.passPriority();
      expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
      await game.p2.passPriority();
    }
    expect(sizes.length).toBeGreaterThanOrEqual(3);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a)); // strictly draining, one window per item
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  test("the runes come back exactly once: after everything resolves both mind runes are ready (a second 'ready your runes' has nothing more to do) and P1 is back in an open main phase", async () => {
    const game = await ekkoDies();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Expected: only ONE effect that moves Ekko can succeed — he was recycled (cost), so the Drive's "Banish me" no longer
  // finds him (rule 124: he changed zones and is a new object; Deathknell effects look in the trash/board, never the deck)
  // and whiffs: Ekko ends in the Main Deck, banishment stays empty. Actual: the "Banish me" item pulls Ekko out of the
  // MAIN DECK into banishment — he is both recycled AND banished.
  test("ruling fb65289607a1db44 — after Ekko is recycled the Zero Drive 'Banish me' still banishes him from the deck (recycle AND banish both happen)", async () => {
    const game = await ekkoDies();
    expect(game.zoneOf("ekko")).toBe("mainDeck");
    await game.settle();
    expect(game.p1.banishment()).toEqual([]);
    expect(game.zoneOf("ekko")).toBe("mainDeck");
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });
});
