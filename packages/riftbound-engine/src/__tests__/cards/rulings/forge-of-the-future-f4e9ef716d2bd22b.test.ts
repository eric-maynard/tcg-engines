/**
 * Ruling f4e9ef716d2bd22b — Forge of the Future (OGN-212 → ogn-212-298) · Gear · Order · [2]
 *     "When you play this, play a 1 [Might] Recruit unit token at your base. Kill this: Recycle up to 4 cards from trashes."
 *   × Karma, Channeler (OGN-235 → ogn-235-298) · Champion Unit · Order · [6] · 6 Might
 *     "[Vision] … When you recycle one or more cards to your Main Deck, buff a friendly unit."
 *   (+ Vi, Destructive ogn-036-298 "Recycle 1 from your trash: Give me +1 [Might] this turn." as the ruling's contrast.)
 *
 * Q: Forge recycles 4 cards at once — does Karma trigger 4 times or once?
 * A: Once. The four recycles are one simultaneous instance. Vi, by contrast, recycles one card per activation, so
 *    each activation triggers Karma separately.
 * Rules: 383.3 (one event ⇒ one trigger), Karma's "one or more" wording.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORGE = "ogn-212-298";
const KARMA = "ogn-235-298";
const VI_DESTRUCTIVE = "ogn-036-298";
const JUNK = (n: number) => ({ cardType: "unit", energyCost: 2, might: 2, name: `Junk ${n}` }) as const;

const pickOptions = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** P1's turn. P1: Karma + three vanilla units in base, the Forge, four Junk cards in trash. */
function board() {
  return scenario()
    .gear(P1, FORGE, "forge")
    .unit(P1, "base", KARMA, "karma")
    .unit(P1, "base", { might: 2, name: "A" }, "a")
    .unit(P1, "base", { might: 2, name: "B" }, "b")
    .unit(P1, "base", { might: 2, name: "C" }, "c")
    .trash(P1, JUNK(1), "j1")
    .trash(P1, JUNK(2), "j2")
    .trash(P1, JUNK(3), "j3")
    .trash(P1, JUNK(4), "j4");
}

/**
 * MIGRATED 2026-08-12 (DESIGN.md § "Choices and when they are made"): the four cards are NAMED while the
 * ability is finalized — a trash is a PUBLIC zone (355.10.a.1), so the set is an ordinary target set
 * (355.5 / 355.13 / 402.2) locked by 355.15 — and RECYCLED when it resolves. This helper used to name them
 * after both reaction windows had closed; do not flip it back. The ruling's own point (four recycles are one
 * event, so Karma triggers once) is untouched by the timing and is still asserted below.
 */
async function forgeRecyclesFour(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("forge");
  expect(game.zoneOf("forge")).toBe("trash");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", max: 4, seat: P1, timing: "FIN" });
  expect(pickOptions(d)).toEqual(expect.arrayContaining(["j1", "j2", "j3", "j4"]));
  await game.p1.pick("j1", "j2", "j3", "j4");
  await game.p1.passPriority();
  await game.p2.passPriority();
  for (const j of ["j1", "j2", "j3", "j4"]) {
    expect(game.zoneOf(j)).toBe("mainDeck");
  }
  return game;
}

function karmaItems(game: Game) {
  return game.chain().filter((c) => c.cardId === "karma" && c.triggered);
}

describe("Ruling f4e9ef716d2bd22b — Forge recycling 4 at once triggers Karma exactly once", () => {
  test("all four cards are recycled together and exactly ONE Karma trigger results (one buff target asked / one item on the chain)", async () => {
    const game = await forgeRecyclesFour();
    // Karma's single trigger: its friendly-unit target is chosen as it is finalized.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickOptions(d).sort()).toEqual(["a", "b", "c", "karma"]);
    await game.p1.pick("a");
    expect(karmaItems(game)).toHaveLength(1);
    expect(game.chain()).toHaveLength(1);
    // No second Karma prompt follows.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("it resolves: exactly one unit is buffed (A), the other three are not; nothing else is pending", async () => {
    const game = await forgeRecyclesFour();
    await game.p1.pick("a");
    await game.settle();
    expect(game.state("a").isBuffed).toBe(true);
    expect(game.state("a").might).toBe(3);
    for (const u of ["b", "c", "karma"]) {
      expect(game.state(u).isBuffed).toBe(false);
    }
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("Contrast — Vi, Destructive recycles one card per activation, so Karma triggers each time", () => {
  /** Activate Vi paying `junk`, then name `buffee` for Karma's trigger; leaves the chain un-resolved. */
  async function viRecycles(g: Game, junk: string, buffee: string): Promise<void> {
    // rule 416.5 — with several trash cards the controller names which one pays; a lone card is taken as-is.
    await g.p1.activate("vi", undefined, g.p1.trash().length > 1 ? { params: { recycleIds: [junk] } } : {});
    expect(g.zoneOf(junk)).toBe("mainDeck"); // cost paid: one card recycled
    const d = g.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 }); // Karma's buff target, asked at finalization
    expect(pickOptions(d)).toContain(buffee);
    await g.p1.pick(buffee);
  }

  test("two Vi activations ⇒ two separate Karma triggers ⇒ two different units end up buffed", async () => {
    const g = await scenario()
      .unit(P1, "base", KARMA, "karma")
      .unit(P1, "base", VI_DESTRUCTIVE, "vi")
      .unit(P1, "base", { might: 2, name: "A" }, "a")
      .trash(P1, JUNK(1), "j1")
      .trash(P1, JUNK(2), "j2")
      .build();
    await viRecycles(g, "j1", "a");
    expect(karmaItems(g)).toHaveLength(1);
    await g.settle();
    expect(g.state("a").isBuffed).toBe(true);
    expect(g.state("vi").might).toBe(4); // 3 + 1 this turn
    await viRecycles(g, "j2", "karma");
    expect(karmaItems(g)).toHaveLength(1); // a fresh, second trigger
    await g.settle();
    expect(g.state("karma").isBuffed).toBe(true);
    expect(g.state("a").isBuffed).toBe(true);
    expect(g.state("vi").might).toBe(5);
    expect(g.violations()).toEqual([]);
  });
});
