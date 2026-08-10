/**
 * Ruling 421579dde7eb5d9f — Baited Hook (OGN-242 → ogn-242-298) "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5
 *   cards of your Main Deck. You may banish a unit … with Might up to 1 more than the killed unit and play it, ignoring its cost.
 *   Then recycle the rest."
 *   × Watchful Sentry (OGN-096 → ogn-096-298) 1 Might "[Deathknell] — Draw 1."
 *   × Karma, Channeler (OGN-235 → ogn-235-298) "… When you recycle one or more cards to your Main Deck, buff a friendly unit."
 *   Played unit here: Lecturing Yordle (ogn-087-298, 2 Might, "[Tank] When you play me, draw 1") — has a WYPM.
 *
 * Q: Hook kills Watchful Sentry: in what order do the Deathknell, the Hooked unit and Karma's recycle trigger resolve?
 * A: Pending items finalize in the order they were added: Deathknell first, then the Hooked unit (a permanent — resolves
 *    immediately, its WYPM becoming pending), then Karma's trigger LAST — so Karma may choose the unit just played. After
 *    a cleanup the WYPM finalizes on top. Resolution is then newest-first with priority between items.
 * Rules: 354.2–354.3 / 337 (pending → finalized in order), 340 (permanents resolve at once), 383.4 (triggers during
 *        resolution), 338 (LIFO), 808 (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const KARMA = "ogn-235-298";
const LECTURING_YORDLE = "ogn-087-298";
const SKULKER = "ogn-175-298";

/**
 * P1's turn. P1: Hook + exactly [1][order]; Watchful Sentry (1) and Karma (6) in base. Deck top→: Lecturing Yordle (2 ≤ 1+1),
 * four Skulkers (too big), then "d1", "d2" as the cards the two draws will find once the rest is recycled under them.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: null })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
    .unit(P1, "base", KARMA, "karma")
    .unit(P2, "base", { might: 3, name: "Onlooker" }, "onlooker")
    .deck(P1, [LECTURING_YORDLE, SKULKER, SKULKER, SKULKER, SKULKER, SKULKER, SKULKER], ["yordle", "r1", "r2", "r3", "r4", "d1", "d2"]);
}

const ids = (game: Game) => game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`);

/** Hook the Sentry; both pass; Hook resolves up to its look-at-5 offer. */
async function hookSentry(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("hook", 0, { targets: "sentry" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hook", targets: ["sentry"] })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling 421579dde7eb5d9f — Hook on Watchful Sentry with Karma out: Deathknell, Hooked unit, then Karma (which may pick that unit)", () => {
  test("Hook resolving: the Sentry is dead and its Deathknell is already a pending item on the chain when the look-at-5 is offered (Yordle is the only eligible pick); nothing drawn yet", async () => {
    const game = await hookSentry();
    expect(game.zoneOf("sentry")).toBe("trash");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["yordle"]);
    expect(ids(game)).toEqual(["sentry*"]);
    expect(game.p1.hand()).toEqual([]);
  });

  test("taking the Yordle: it is played to base at once (free), the rest is recycled → Karma triggers; finalization order puts Karma's item ABOVE the Deathknell and Karma's choice — made now, by P1 — already includes the freshly played Yordle", async () => {
    const game = await hookSentry();
    await game.p1.pick("yordle");
    expect(game.state("yordle")).toMatchObject({ controller: P1, zone: "base" }); // a permanent resolves immediately
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.p1.deck().slice(0, 2)).toEqual(["d1", "d2"]); // r1–r4 recycled to the bottom
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.source?.cardId).toBe("karma");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["karma", "yordle"]); // Karma CAN choose the unit played with Hook
    // Deathknell lowest, Karma above it, the Yordle's WYPM (finalized after the cleanup) on top.
    expect(ids(game)).toEqual(["sentry*", "karma*", "yordle*"]);
    await game.p1.pick("yordle");
    expect(game.chain()[1]).toMatchObject({ cardId: "karma", targets: ["yordle"] });
  });

  test("resolution is newest-first with a priority round between items: Yordle's WYPM draws d1 → Karma buffs the Yordle → the Sentry's Deathknell draws d2 last", async () => {
    const game = await hookSentry();
    await game.p1.pick("yordle");
    await game.p1.pick("yordle"); // Karma's target
    expect(ids(game)).toEqual(["sentry*", "karma*", "yordle*"]);
    // 1) WYPM
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("yordle").isBuffed).toBe(false);
    expect(ids(game)).toEqual(["sentry*", "karma*"]);
    // 2) Karma's buff
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("yordle")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(ids(game)).toEqual(["sentry*"]);
    // 3) Deathknell last
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.chain()).toEqual([]);
    expect(game.state("karma").isBuffed).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
