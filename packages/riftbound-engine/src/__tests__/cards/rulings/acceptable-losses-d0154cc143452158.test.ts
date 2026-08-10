/**
 * Ruling d0154cc143452158 — Acceptable Losses (ogn-179-298) × Forge of the Future (ogn-212-298)
 *   Acceptable Losses — [Action] · [1]: "Each player kills one of their gear."
 *   Forge of the Future — Gear · [2]: "When you play this, play a 1 [Might] Recruit unit token at your base.
 *   Kill this: Recycle up to 4 cards from trashes."
 *
 * Q: If Acceptable Losses makes me kill Forge of the Future, does the Forge's recycle effect happen?
 * A: No. "Kill this:" is the COST of an activated ability; being forced to kill the Forge by a spell's effect is not
 *    activating it — nothing goes on the chain and nothing is recycled. (Activating it yourself, by contrast, does.)
 * Rules: 401.1 / 356 (text before the colon is a cost), 422.1.a (each player chooses their own gear on resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ACCEPTABLE_LOSSES = "ogn-179-298";
const FORGE = "ogn-212-298";
const SKULKER = "ogn-175-298";
const TRINKET = { cardType: "gear", energyCost: 1, name: "Test Trinket" } as const;

/** P2's turn with [1] and Acceptable Losses; P1's only gear is the Forge; both trashes hold cards a recycle could pick. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1 })
    .gear(P1, FORGE, "forge")
    .gear(P2, TRINKET, "trinket")
    .trash(P1, SKULKER, "t1")
    .trash(P1, SKULKER, "t2")
    .trash(P2, SKULKER, "t3")
    .hand(P2, ACCEPTABLE_LOSSES, "al");
}

describe("Ruling d0154cc143452158 — a Forge of the Future killed BY Acceptable Losses recycles nothing", () => {
  test("contrast/premise: P1 activating the Forge itself pays 'Kill this' as the cost (Forge → trash at once) and the ability recycles cards from trashes", async () => {
    const game = await board().active(P1).build();
    expect(game.p1.can("activate", "forge")).toBe(true);
    await game.p1.activate("forge");
    expect(game.zoneOf("forge")).toBe("trash"); // cost paid on activation
    // Resolve: choose up to 4 cards from trashes when/if asked; otherwise pass.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        const wanted = d.options.filter((o) => ["t1", "t2", "t3"].includes((o.card ?? o.key) as string)).map((o) => o.key);
        await game.p1.answer({ keys: wanted.length > 0 ? wanted.slice(0, Math.max(1, Math.min(wanted.length, d.max))) : [d.options[0]!.key], kind: "pick" });
      } else if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle({ policy: "first" });
    const recycled = ["t1", "t2", "t3"].filter((c) => game.zoneOf(c) === "mainDeck");
    expect(recycled.length).toBeGreaterThan(0); // the activated ability DID recycle
  });

  test("Acceptable Losses resolves: each player kills a gear — P1's only gear, the Forge, dies to the SPELL; no Forge ability is put on the chain, P1 is never offered a recycle, and every trash card stays put", async () => {
    const game = await board().build();
    await game.p2.cast("al", { targets: [] });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "al", controller: P2 })]);
    let forgeItemSeen = false;
    let recycleOffer = false;
    for (let i = 0; i < 16; i++) {
      if (game.chain().some((c) => c.cardId === "forge")) {
        forgeItemSeen = true;
      }
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        const keys = d.options.map((o) => (o.card ?? o.key) as string);
        if (keys.some((k) => ["t1", "t2", "t3"].includes(k))) {
          recycleOffer = true;
          await game.seat(d.seat).decline();
          continue;
        }
        // "one of their gear" — each player names their own (forced single options may be auto-bound).
        const mine = d.options.find((o) => (o.card ?? o.key) === (d.seat === P1 ? "forge" : "trinket")) ?? d.options[0]!;
        await game.seat(d.seat).pick(mine.key);
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "yes-no") {
        await game.seat(d.seat).no();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("al")).toBe("trash");
    expect(game.zoneOf("forge")).toBe("trash"); // killed by the spell
    expect(game.zoneOf("trinket")).toBe("trash");
    expect(forgeItemSeen).toBe(false); // its activated ability never hit the chain
    expect(recycleOffer).toBe(false); // nobody was asked to recycle
    expect(game.zoneOf("t1")).toBe("trash");
    expect(game.zoneOf("t2")).toBe("trash");
    expect(game.zoneOf("t3")).toBe("trash");
    expect(game.p1.deck()).not.toContain("t1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
