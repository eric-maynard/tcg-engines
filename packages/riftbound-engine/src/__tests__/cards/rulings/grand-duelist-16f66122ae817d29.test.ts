/**
 * Ruling 16f66122ae817d29 — Grand Duelist (SFD-205 → sfd-205-221) · Legend · Fiora
 *   "When one of your units becomes [Mighty], you may exhaust me to channel 1 rune exhausted.
 *    (A unit is Mighty while it has 5+ [Might].)"
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) "When you play me, give enemy units -3 [Might]
 *     this turn, to a minimum of 1 [Might]." — the -Might effect that wears off.
 *
 * Q: A -Might effect (Watcher) pushed my unit under 5. When it expires at the end of my opponent's
 *    turn, does Fiora trigger — and is she ready again on my turn?
 * A: Yes. The Expiration Step of the opponent's Ending Phase gives the Might back, the unit BECOMES
 *    Mighty there and then, Fiora triggers during that Ending Phase, and paying the cost exhausts her.
 *    She awakens (readies) at the start of your own turn anyway.
 * Rules: 317.2 (Expiration Step), 383 (triggered abilities), 780 / 709 ("becomes Mighty" = crossing to
 *        5+), 313 (Awaken Step readies your cards), 383.3.b + 204.3.a (a "you may [cost] to" cost is
 *        paid at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GRAND_DUELIST = "sfd-205-221";
const WATCHER = "ogn-116-298";

/** P2's turn. P1's legend is Fiora (ready unless said otherwise) with a 6-Might Brute in base; P2 holds the Watcher. */
function board(opts: { fioraExhausted?: boolean } = {}) {
  const s = scenario()
    .active(P2)
    .resources(P2, { energy: 12, power: { mind: 6 } })
    .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
    .hand(P2, WATCHER, "watcher");
  return opts.fioraExhausted
    ? s.card("gd", { def: GRAND_DUELIST, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
    : s.legend(P1, GRAND_DUELIST, "gd");
}

/** P2 plays the Watcher; P1's Brute drops from 6 to 3 and stops being Mighty. */
async function watcherPlayed(opts: { fioraExhausted?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  expect(game.state("brute").might).toBe(6);
  await game.p2.play("watcher");
  await game.settle();
  expect(game.state("brute").might).toBe(3);
  expect(game.state("gd").isExhausted).toBe(opts.fioraExhausted === true);
  return game;
}

describe("Ruling 16f66122ae817d29 — a -Might effect expiring at the opponent's end of turn makes the unit Mighty again and triggers Fiora", () => {
  test("premise: the Watcher's -3 takes the 6-Might Brute to 3, so nothing is Mighty while it lasts (no trigger on the way down)", async () => {
    const game = await watcherPlayed();
    expect(game.chain()).toEqual([]);
    expect(game.state("gd").isReady).toBe(true);
    expect(game.p1.runes()).toHaveLength(0);
  });

  test("sequence 1-3: P2 ends the turn → the Expiration Step gives the Might back (6) and records 'become-mighty' → Fiora's trigger is on the chain and P1 is asked, still in P2's ENDING phase", async () => {
    const game = await watcherPlayed();
    await game.p2.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("brute").might).toBe(6);
    const pass = game.trace().expiration[0];
    expect(pass?.expired).toContain("mightModifier:brute");
    expect(pass?.events).toContain("become-mighty:brute");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gd", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.source?.cardId).toBe("gd");
    expect(game.decision()?.prompt).toMatch(/Exhaust/i);
  });

  test("sequence 4: paying the cost EXHAUSTS Fiora immediately — exhausting her is the cost, not something the effect does", async () => {
    const game = await watcherPlayed();
    await game.p2.endTurn();
    await game.p1.yes();
    expect(game.state("gd").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gd", triggered: true })]);
  });

  test("sequence 5-6: the trigger resolves (a rune is channeled), then P1's turn begins and Fiora AWAKENS — ready again despite having been exhausted during P2's Ending Phase", async () => {
    const game = await watcherPlayed();
    await game.p2.endTurn();
    await game.p1.yes();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.state("gd").isReady).toBe(true); // awakened at the start of P1's turn
    expect(game.p1.runes()).toHaveLength(3); // Fiora's 1 + the 2 channeled at P1's turn start
    expect(game.violations()).toEqual([]);
  });

  test("declining costs nothing: Fiora stays ready and only the two turn-start runes are channeled", async () => {
    const game = await watcherPlayed();
    await game.p2.endTurn();
    await game.p1.no();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("gd").isReady).toBe(true);
    expect(game.p1.runes()).toHaveLength(2);
  });

  // RULING-CONFLICT: riftjudge 16f66122ae817d29's nuance says "the ability triggers even if Fiora is already exhausted,
  // but you cannot pay the cost"; CR 383.3.b + 204.3.a put a "you may [cost] to …" payment at FINALIZATION, so an
  // unpayable optional trigger never reaches the chain at all (404.2) — engine follows CR. Either way nothing is
  // channeled and Fiora still awakens on P1's turn, which is all the ruling's outcome depends on.
  test("already-exhausted Fiora: the cost cannot be paid, so no chain item and no prompt appear at all — and she awakens on P1's turn regardless", async () => {
    const game = await watcherPlayed({ fioraExhausted: true });
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).not.toMatchObject({ kind: "yes-no" });
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(2); // turn-start channels only — Fiora contributed nothing
    expect(game.state("gd").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
