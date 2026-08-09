/**
 * Ruling 092c2dad3710babb — The Boss (OGN-269 → ogn-269-298) · Legend · Sett
 *   "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to heal
 *    it, exhaust it, and recall it instead. When you conquer, ready me."
 *   × Deathgrip (SFD-163 → sfd-163-221) · Order Reaction spell · [2]
 *   "Kill a friendly unit. If you do, give +[Might] equal to its Might to another friendly unit this turn. Draw 1."
 *   (+ Watchful Sentry ogn-096-298 "[Deathknell] — Draw 1" as the buffed victim, to witness 'no Deathknell'.)
 *
 * Q: Does Sett, The Boss's ability apply when I Deathgrip my own buffed unit?
 * A: Yes. The Boss is a REPLACEMENT effect on the "kill" event: as Deathgrip's kill instruction executes you
 *    may pay (exhaust the Boss + [rainbow] + spend the buff) and the unit is healed, exhausted and recalled
 *    instead of dying. The rest of Deathgrip continues: because you did NOT actually kill the unit, no Might
 *    bonus is given ("If you do"), but you still Draw 1. The unit never hit the trash ⇒ no Deathknell.
 * Rules: 371.2, 359.3.e.14.b (Deathgrip is the rules' own "If you do" example), 359.3.e.5, 702.2.b, 808.1.d.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_BOSS = "ogn-269-298";
const DEATHGRIP = "sfd-163-221";
const WATCHFUL_SENTRY = "ogn-096-298"; // 1 Might, [Deathknell] — Draw 1.

/**
 * P1's turn. P1: The Boss (ready); Watchful Sentry BUFFED (1+1 = 2 Might) and a 3-Might Brawler in base;
 * Deathgrip in hand; [2] for Deathgrip + 1 [body] for the Boss's [rainbow]. Known deck top.
 */
function board() {
  return scenario()
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", WATCHFUL_SENTRY, "sentry", { buffed: true })
    .unit(P1, "base", { might: 3, name: "Brawler" }, "brawler")
    .hand(P1, DEATHGRIP, "grip")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** P1 Deathgrips its own buffed Sentry; both pass so it resolves up to the Boss's question. */
async function gripSentry(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sentry")).toMatchObject({ isBuffed: true, might: 2 });
  await game.p1.cast("grip", { targets: "sentry" });
  expect(game.p1.energy()).toBe(0);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

/** After the Boss answer: pick the Brawler as "+Might" recipient if (and only if) the engine asks. */
async function finish(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick("brawler");
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      return;
    }
  }
}

describe("Ruling 092c2dad3710babb — The Boss's replacement applies to Deathgrip's kill of your own buffed unit", () => {
  test("Deathgrip's kill of the buffed Sentry is a 'would die' event: P1 is asked whether to apply The Boss (a replacement, sourced from the legend — not a chain item)", async () => {
    const game = await gripSentry();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    // Not a trigger: nothing of the Boss's is on the chain (only Deathgrip itself, mid-resolution, if anything).
    expect(game.chain().some((c) => c.cardId === "boss")).toBe(false);
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.state("boss").isReady).toBe(true);
  });

  // Expected: the replacement is decided as the KILL instruction executes (step 3 of the ruling's sequence),
  // before the remaining instructions — so nothing has been drawn yet while the question is open.
  // Actual: the engine has already executed "Draw 1" (d1 in hand) when it asks about the Boss.
  test("ruling 092c2dad3710babb — engine executes Deathgrip's 'Draw 1' BEFORE asking about the Boss's replacement", async () => {
    const game = await gripSentry();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
  });

  test("YES: Boss exhausted, [rainbow] paid, buff spent; Sentry healed + exhausted + recalled (stays on the board, not in trash)", async () => {
    const game = await gripSentry();
    await game.p1.yes();
    await finish(game);
    await game.settle();
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.p1.trash()).not.toContain("sentry");
    expect(game.state("sentry")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 1 });
    expect(game.zoneOf("grip")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("YES: 'If you do' fails — the Brawler gets NO Might bonus — but the unlinked 'Draw 1' still happens (exactly 1 card: no Deathknell draw, the Sentry never died)", async () => {
    const game = await gripSentry();
    await game.p1.yes();
    await finish(game);
    await game.settle();
    expect(game.state("brawler").might).toBe(3);
    expect(game.state("brawler").mightModifier).toBe(0);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    // 808.1.d.1: no Deathknell item ever went on the chain.
    expect(game.chain()).toEqual([]);
  });

  test("contrast — NO: the replacement is not applied (371.2.b): the Sentry dies, Boss stays ready and unpaid; P1 draws 1 from Deathgrip AND 1 from the Sentry's Deathknell", async () => {
    const game = await gripSentry();
    await game.p1.no();
    await finish(game);
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1 } });
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
  });

  // Expected: declining the Boss means Deathgrip DID kill the Sentry, so "If you do" holds and the Brawler
  // gets +2 (the buffed Sentry's Might) this turn — exactly as it does with no Boss in the legend zone.
  // Actual: with the Boss present the engine evaluates the "If you do" bonus before the deferred kill is
  // confirmed, so the Brawler stays at 3 even though the Sentry died.
  test("ruling 092c2dad3710babb — declining the Boss should leave Deathgrip fully effective (+2 to the Brawler); engine gives no bonus once the Boss prompt was involved", async () => {
    const game = await gripSentry();
    await game.p1.no();
    await finish(game);
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.state("brawler").might).toBe(5);
    // "this turn"
    await game.advanceTurn();
    expect(game.state("brawler").might).toBe(3);
  });
});
