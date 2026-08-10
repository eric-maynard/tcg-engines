/**
 * Ruling 3ae98527c38de597 — Sprite Fountain (unl-078-219) × Sprite token (ogn-274-298) × Temporal Breach (ven-066-166) × Brynhir Thundersong (ogn-026-298)
 *   Sprite Fountain (gear): "[Temporary] When you play this, play a ready 3-Might Sprite token with [Temporary] to your base.
 *                           [Deathknell] — Repeat this gear's play effect."
 *   Temporal Breach: "[Hidden] Banish a unit, then its owner plays it to the same location, ignoring its cost."
 *   Brynhir Thundersong: "When you play me, opponents can't play cards this turn."
 *
 * Q: Opponent's Fountain Temporary-trigger goes on the chain at the start of their Beginning Phase; I react with a hidden
 *    Temporal Breach on my Brynhir (banish + replay → "opponents can't play cards this turn"). Do they still get the Sprite
 *    from the Fountain's Deathknell?
 * A: Yes. The chain does resolve Breach → Brynhir's trigger → the Temporary kill, but Brynhir only stops opponents PLAYING
 *    CARDS; a Deathknell that plays a token is a triggered ability and tokens are not cards, so the Sprite arrives normally.
 * Rules: 350.2 (tokens are not cards), 829 (Temporary), 808 (Deathknell), 811 (Hidden reaction for [0]).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_FOUNTAIN = "unl-078-219";
const TEMPORAL_BREACH = "ven-066-166";
const BRYNHIR = "ogn-026-298";

const sprites = (game: Game) => game.p2.units("base").filter((u) => game.state(u).name === "Sprite");

/** End of P1's turn 3. P1: Brynhir at bf1 (P1's) with Temporal Breach hidden there. P2: Sprite Fountain in base, a cheap unit in hand. */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", BRYNHIR, "bryn")
    .facedown(P1, "bf1", TEMPORAL_BREACH, "breach")
    .gear(P2, SPRITE_FOUNTAIN, "fountain")
    .unit(P2, "base", { might: 2, name: "Other" }, "other")
    .hand(P2, { cardType: "unit", energyCost: 0, might: 1, name: "Freebie" }, "freebie");
}

async function passChainUntilMain(game: Game): Promise<string[][]> {
  const snapshots: string[][] = [];
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).passPriority();
    snapshots.push(game.chain().map((c) => c.cardId));
  }
  return snapshots;
}

describe("Ruling 3ae98527c38de597 — Brynhir replayed via Temporal Breach in the Beginning Phase does not stop the Fountain's Deathknell Sprite (a token is not a card)", () => {
  test("P2's Beginning Phase: the Fountain's Temporary trigger opens a chain; P1 reveals the hidden Breach on Brynhir; LIFO gives Breach → Brynhir's trigger → Temporary kill → Deathknell, and P2 ends up with a Sprite but unable to play cards", async () => {
    const game = await board().build();
    expect(sprites(game)).toEqual([]);
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    // The Temporary kill is a trigger on the chain, so there is a reaction window.
    expect(game.chain().map((c) => c.cardId)).toEqual(["fountain"]);
    expect(game.zoneOf("fountain")).toBe("base");
    if (game.decision()?.seat === P2) {
      await game.p2.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "breach")).toBe(true);
    await game.p1.reveal("breach", { answers: ["bryn"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fountain", "breach"]);

    const snapshots = await passChainUntilMain(game);
    // Breach resolved first (Brynhir banished and replayed at bf1), putting Brynhir's play trigger ABOVE the still-pending Temporary.
    expect(snapshots).toContainEqual(["fountain", "bryn"]);
    expect(game.zoneOf("breach")).toBe("trash");
    expect(game.zoneOf("bryn")).toBe("battlefield-bf1");
    await game.settle();

    // Then the Temporary killed the Fountain and its Deathknell played the Sprite token for P2 anyway.
    expect(game.zoneOf("fountain")).toBe("trash");
    const s = sprites(game);
    expect(s).toHaveLength(1);
    expect(game.state(s[0] as string)).toMatchObject({ isReady: true, isToken: true, might: 3 });
    // …while Brynhir's restriction IS live: P2, now in their main phase, cannot play even a free card from hand.
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p2.can("play", "freebie")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("control: with no reaction at all the Fountain simply dies to Temporary and P2 gets the Sprite (and can play cards)", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    await game.settle();
    expect(game.zoneOf("fountain")).toBe("trash");
    expect(sprites(game)).toHaveLength(1);
    expect(game.zoneOf("breach")).toBe("facedown-bf1");
    expect(game.p2.can("play", "freebie")).toBe(true);
  });
});
