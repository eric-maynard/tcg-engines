/**
 * Ruling efdf4a125fd1a1f6 — Veiled Temple (SFD-221 → sfd-221-221, Battlefield)
 *     "When you conquer here, you may ready a friendly gear. If it's an Equipment, you may detach it."
 *   × Plundering Poro (SFD-069 → sfd-069-221) · 2 Might · "When I conquer, play a Gold gear token exhausted."
 *   × Gold (SFD-T03 → sfd-t03) gear token.
 *
 * Q: Can Veiled Temple ready the Gold token that Plundering Poro creates from the same conquer?
 * A: No. Both abilities trigger simultaneously and Veiled Temple's target gear must be chosen as it is put on the chain —
 *    the Gold token doesn't exist yet (the Poro's ability hasn't resolved), so it can't be chosen; ordering the triggers
 *    doesn't help. Other friendly gear already in play can be targeted instead. The Gold arrives exhausted afterwards.
 * Rules: 383.3 / 402.2 (a trigger's target is chosen at finalization), 402.4 (no legal target ⇒ removed), 383.3.d (ordering).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEILED_TEMPLE = "sfd-221-221";
const PLUNDERING_PORO = "sfd-069-221";

function board(withOtherGear: boolean) {
  let b = scenario()
    .battlefield("temple", { controller: null, def: VEILED_TEMPLE, inert: false })
    .unit(P1, "base", PLUNDERING_PORO, "poro")
    .unit(P2, "base", { might: 3, name: "Bystander" }, "bystander");
  if (withOtherGear) {
    b = b.gear(P1, { energyCost: 1, name: "Trinket" }, "trinket", { exhausted: true });
  }
  return b;
}

const goldOf = (game: Game) => game.p1.gear().filter((g) => game.state(g).name === "Gold");

/** Poro walks onto the empty Temple; both players pass Focus → P1 conquers it (1 point) and the conquer triggers fire. */
async function poroConquers(game: Game): Promise<void> {
  await game.p1.move("poro", "temple");
  await game.p1.pass();
  await game.p2.pass();
  expect(game.gameState.battlefields.temple?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
}

describe("Ruling efdf4a125fd1a1f6 — Veiled Temple can't ready the Gold that Plundering Poro is about to create", () => {
  test("no other friendly gear: when the triggers are put on the chain no Gold exists, so Veiled Temple's ability has no legal target and never makes it onto the chain (P1 isn't even asked); only the Poro's trigger resolves → one EXHAUSTED Gold", async () => {
    const game = await board(false).script(P1, [], { strict: true }).build();
    await poroConquers(game);
    expect(goldOf(game)).toEqual([]); // nothing created yet at trigger time
    expect(game.chain().map((c) => c.cardId)).toEqual(["poro"]); // Temple's item was removed (402.4)
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // strict P1: no opt-in / target prompt was raised
    await game.settle();
    const gold = goldOf(game);
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0]!)).toMatchObject({ isExhausted: true, isToken: true });
    expect(game.violations()).toEqual([]);
  });

  test("with another friendly gear (an exhausted Trinket): Veiled Temple's opt-in and target are asked at FINALIZATION — the only candidate is the Trinket (no Gold on offer) — and it is readied; the Gold still arrives exhausted", async () => {
    const game = await board(true).build();
    await poroConquers(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "temple" }, timing: "FIN" });
    expect(goldOf(game)).toEqual([]); // still no Gold when the choice is made
    await game.p1.yes();
    // A lone legal target is bound without asking; either way the bound target is the Trinket, never a Gold.
    if (game.decision()?.kind === "pick") {
      const d = game.decision();
      expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["trinket"]);
      await game.p1.pick("trinket");
    }
    expect(game.chain()).toEqual(expect.arrayContaining([expect.objectContaining({ cardId: "temple", targets: ["trinket"], triggered: true })]));
    await game.settle();
    expect(game.state("trinket").isReady).toBe(true);
    const gold = goldOf(game);
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0]!).isExhausted).toBe(true);
  });

  test("sequencing doesn't help: P1 is offered the order of its two triggers (383.3.d) and puts the Poro's on TOP so the Gold is created first — Veiled Temple's target was already locked to the Trinket, so the fresh Gold is still not readied", async () => {
    const game = await board(true).build();
    await poroConquers(game);
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("trinket");
    }
    const d = game.decision();
    expect(d).toMatchObject({ defaultable: true, kind: "order", seat: P1, timing: "FIN" });
    const items = d?.kind === "order" ? d.items : [];
    const poroKey = items.find((i) => i.card === "poro")?.key;
    const templeKey = items.find((i) => i.card === "temple")?.key;
    expect(poroKey).toBeDefined();
    expect(templeKey).toBeDefined();
    await game.p1.order([templeKey!, poroKey!]); // first = bottom, last = top → the Poro resolves first
    // Resolve the top item (Poro): the Gold now exists, exhausted, while Temple's item still names the Trinket.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(goldOf(game)).toHaveLength(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "temple", targets: ["trinket"] })]);
    expect(game.decision()?.kind).toBe("action"); // no re-targeting prompt
    await game.settle();
    expect(game.state("trinket").isReady).toBe(true);
    expect(game.state(goldOf(game)[0]!).isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
