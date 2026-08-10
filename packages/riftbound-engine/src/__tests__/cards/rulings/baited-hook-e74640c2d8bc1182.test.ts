/**
 * Ruling e74640c2d8bc1182 — Baited Hook (OGN-242 → ogn-242-298) · Gear · Order · 3
 *     "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit from
 *      among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest."
 *   × Glasc Mixologist (SFD-165 → sfd-165-221) 5 Might "[Deathknell] — You may play a unit with cost no more than [3] and no
 *     more than [rainbow] from your trash, ignoring its cost."
 *   × Harnessed Dragon (ogn-234-298) 6 Might "When you play me, kill an enemy unit." (the unit the Hook finds)
 *
 * Q: Baited Hook kills Glasc Mixologist — does her Deathknell happen first, or the Hook's look/play?
 * A: Fixed by the chain, no choice: the Deathknell trigger is CREATED at the kill (pending) but the Hook keeps resolving —
 *    look at 5, play the unit, whose "When you play me" is added above the Deathknell. LIFO: the new unit's play effect
 *    resolves first, the Deathknell last.
 * Rules: 808.1.d.2 (Deathknell noted at the kill), 337.1 (pending items finalize in creation order after the resolving item),
 *        340.1 (LIFO), 383.3.d (no ordering choice — these are not simultaneous triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const GLASC = "sfd-165-221";
const HARNESSED_DRAGON = "ogn-234-298";

/**
 * P1's turn with exactly [1][order]. Baited Hook ready; Glasc Mixologist (5) in base; a 2-cost Revivee in the trash. Deck
 * top→: Harnessed Dragon (6 ≤ 5+1), Seven (7 — too big), three spells. P2 holds bf1 with Brute (4) and Runt (2).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", GLASC, "glasc")
    .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
    .unit(P2, "bf1", { might: 2, name: "Runt" }, "runt")
    .trash(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Revivee" }, "revivee")
    .deck(
      P1,
      [
        HARNESSED_DRAGON,
        { cardType: "unit", energyCost: 7, might: 7, name: "Seven" },
        { cardType: "spell", energyCost: 1, name: "Junk A" },
        { cardType: "spell", energyCost: 1, name: "Junk B" },
        { cardType: "spell", energyCost: 1, name: "Junk C" },
      ],
      ["dragon", "seven", "ja", "jb", "jc"],
    );
}

type PickD = Extract<Decision, { kind: "pick" }>;

/** Every decision seen while driving, for order assertions. */
interface Seen {
  readonly kind: string;
  readonly seat: string;
  readonly timing?: string;
  readonly cards: readonly string[];
  readonly chain: readonly string[];
}

/**
 * Activate the Hook on Glasc; both pass so the Hook resolves; answer: take the Dragon, accept the Deathknell's "you may",
 * Dragon kills Brute. Stops with both triggers finalized and P1 holding priority. Returns what was asked, in order.
 */
async function hookIntoDragon(game: Game): Promise<Seen[]> {
  const seen: Seen[] = [];
  await game.p1.activate("hook", 0, { targets: "glasc" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.state("hook").isExhausted).toBe(true);
  await game.p1.passPriority();
  await game.p2.passPriority();
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    const cards = d.kind === "pick" ? (d as PickD).options.map((o) => o.card ?? o.key) : [];
    seen.push({ cards, chain: game.chain().map((c) => c.cardId), kind: d.kind, seat: d.seat, timing: d.timing });
    if (d.kind === "pick" && cards.includes("dragon")) {
      await game.p1.pick("dragon");
    } else if (d.kind === "pick" && cards.includes("brute")) {
      await game.p1.pick("brute");
    } else if (d.kind === "yes-no") {
      await game.p1.yes();
    } else if (d.kind === "order") {
      break; // must not happen — asserted by the caller
    } else {
      break;
    }
  }
  return seen;
}

describe("Ruling e74640c2d8bc1182 — Baited Hook on Glasc Mixologist: Deathknell created first, resolves last", () => {
  test("the Deathknell is created the moment the Hook kills Glasc — it is already on the chain (pending) while the Hook is still resolving its look-at-5 (only the 6-Might Dragon is eligible)", async () => {
    const game = await board().build();
    const seen = await hookIntoDragon(game);
    const look = seen.find((s) => s.cards.includes("dragon"));
    expect(look).toMatchObject({ kind: "pick", seat: P1, timing: "RES" });
    expect(look?.cards).toEqual(["dragon"]); // Seven (7 > 5+1) and spells are not offered
    expect(game.zoneOf("glasc")).toBe("trash");
    expect(look?.chain).toContain("glasc"); // Deathknell item exists during the Hook's own resolution
    expect(look?.chain).not.toContain("dragon"); // the Dragon has not been played yet
  });

  test("no ordering choice is ever offered (not simultaneous triggers): after the Hook finishes the chain is fixed as [Glasc's Deathknell (bottom), Dragon's play effect (top)] with P1 on priority", async () => {
    const game = await board().build();
    const seen = await hookIntoDragon(game);
    expect(seen.some((s) => s.kind === "order")).toBe(false);
    expect(game.decision()?.kind).not.toBe("order");
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("dragon"));
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "glasc", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "dragon", controller: P1, triggered: true }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("brute")).toBe("battlefield-bf1"); // nothing resolved yet
    expect(game.zoneOf("revivee")).toBe("trash");
  });

  test("LIFO: the Dragon's 'When you play me' resolves FIRST (Brute dies) while the Deathknell still waits; then the Deathknell resolves LAST and revives the Revivee from the trash; the rest of the looked-at cards were recycled", async () => {
    const game = await board().build();
    await hookIntoDragon(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "glasc", triggered: true })]);
    expect(game.zoneOf("revivee")).toBe("trash");
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("revivee");
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("revivee")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.p1.deck().slice(-4).sort()).toEqual(["ja", "jb", "jc", "seven"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
