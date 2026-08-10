/**
 * Ruling 8804deb02d08cf28 — Skyfall of Areion (SFD-030 → sfd-030-221, Equipment +2: "My hold effects are also
 *   conquer effects, and vice versa.") × The Candlelit Sanctum (OGN-291 → ogn-291-298, Battlefield: "When you
 *   conquer here, look at the top two cards of your Main Deck. You may recycle one or both of them. Put those you
 *   don't back in any order.")
 *
 * Q: Will Skyfall make Candlelit Sanctum trigger on a hold?
 * A: No. Skyfall only rewires the EQUIPPED UNIT's hold/conquer triggered abilities; the battlefield's own "When you
 *    conquer here" is untouched and still fires only on an actual conquer.
 * Rules: 136.2.d / 718 (Equipment effect text applies to the wearer), 469.1–469.2 (conquer vs hold).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SKYFALL = "sfd-030-221";
const CANDLELIT_SANCTUM = "ogn-291-298";
const KAISA_SURVIVOR = "ogn-039-298"; // "… When I conquer, draw 1."

/** End of P2's turn; P1 already holds the live Candlelit Sanctum with `unitDef` wearing Skyfall → P1 HOLDS it as P1's turn begins. */
function holdBoard(unitDef: string | { might: number; name: string }) {
  return scenario()
    .active(P2)
    .battlefield("sanctum", { controller: P1, def: CANDLELIT_SANCTUM, inert: false })
    .unit(P1, "sanctum", unitDef, "wearer", { equippedWith: ["skyfall"] })
    .card("skyfall", { def: SKYFALL, meta: { attachedTo: "wearer" }, owner: P1, zone: "sanctum" });
}

/** Step from P2's endTurn through P1's Beginning Phase to P1's open main phase, recording chain items and prompts seen. */
async function throughP1Beginning(game: Game): Promise<{ chainSeen: string[]; promptsSeen: string[] }> {
  const chainSeen: string[] = [];
  const promptsSeen: string[] = [];
  await game.p2.endTurn();
  for (let i = 0; i < 24; i++) {
    for (const c of game.chain()) {
      if (!chainSeen.includes(c.cardId)) {
        chainSeen.push(c.cardId);
      }
    }
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind !== "action") {
      promptsSeen.push(`${d.kind}:${d.source?.cardId ?? "?"}`);
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick" && d.options.length > 0) {
      await game.seat(d.seat).pick(d.options[0]!.key);
    } else if (d.kind === "pick" && d.allowDecline) {
      await game.seat(d.seat).decline();
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).no();
    } else if (d.kind === "deck-arrange") {
      await game.seat(d.seat).answer({ kind: "deck-arrange", recycle: [], top: d.cards.map((c) => c.key) });
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return { chainSeen, promptsSeen };
}

describe("Ruling 8804deb02d08cf28 — Skyfall of Areion does not make The Candlelit Sanctum trigger on a hold", () => {
  test("HOLD at the Sanctum with a Skyfall-equipped unit: P1 scores the hold, but the Sanctum's 'conquer here' ability never goes on the chain and no look/recycle prompt appears", async () => {
    const game = await holdBoard({ might: 3, name: "Bearer" }).build();
    expect(game.state("skyfall").attachedTo).toBe("wearer");
    expect(game.state("wearer").might).toBe(5); // 3 + 2
    const deckBefore = [...game.p1.deck()];
    const seen = await throughP1Beginning(game);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1); // the hold happened
    expect(seen.chainSeen).not.toContain("sanctum");
    expect(seen.promptsSeen.filter((p) => p.endsWith(":sanctum"))).toEqual([]);
    // deck untouched apart from the rule draw (top card drawn, order below preserved)
    expect(game.p1.deck()).toEqual(deckBefore.slice(1));
  });

  test("control — Skyfall DOES rewire the wearer: Kai'Sa, Survivor ('When I conquer, draw 1') wearing Skyfall draws on that same hold, while the Sanctum still stays silent", async () => {
    const game = await holdBoard(KAISA_SURVIVOR).build();
    const handBefore = game.p1.hand().length;
    const seen = await throughP1Beginning(game);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand().length).toBe(handBefore + 2); // rule draw + Kai'Sa's conquer effect firing as a hold effect
    expect(seen.chainSeen).toContain("wearer");
    expect(seen.chainSeen).not.toContain("sanctum");
    expect(seen.promptsSeen.filter((p) => p.endsWith(":sanctum"))).toEqual([]);
  });

  test("control — an actual CONQUER of the Sanctum does trigger it (P1 is shown the top two cards)", async () => {
    const game = await scenario()
      .battlefield("sanctum", { controller: null, def: CANDLELIT_SANCTUM, inert: false })
      .unit(P1, "base", { might: 3, name: "Bearer" }, "wearer")
      .build();
    await game.p1.move("wearer", "sanctum");
    let sanctumPrompt = false;
    for (let i = 0; i < 12; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (game.chain().some((c) => c.cardId === "sanctum")) {
        sanctumPrompt = true;
      }
      if (r.reason !== "unanswered" || !d) {
        break;
      }
      if (d.source?.cardId === "sanctum") {
        sanctumPrompt = true;
      }
      if (d.kind === "deck-arrange") {
        await game.seat(d.seat).answer({ kind: "deck-arrange", recycle: [], top: d.cards.map((c) => c.key) });
      } else if (d.kind === "pick") {
        await (d.allowDecline ? game.seat(d.seat).decline() : game.seat(d.seat).pick(d.options[0]!.key));
      } else if (d.kind === "yes-no") {
        await game.seat(d.seat).no();
      } else {
        break;
      }
    }
    expect(game.gameState.battlefields.sanctum?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(sanctumPrompt).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
