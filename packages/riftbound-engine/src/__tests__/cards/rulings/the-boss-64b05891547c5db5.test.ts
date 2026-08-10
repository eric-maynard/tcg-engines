/**
 * Ruling 64b05891547c5db5 — The Boss (OGN-269 → ogn-269-298, Legend · Sett) "If a buffed unit you control would die, you may pay [rainbow],
 *     exhaust me, and spend its buff to heal it, exhaust it, and recall it instead. When you conquer, ready me."
 *   × Deathgrip (SFD-163 → sfd-163-221, Reaction [2]) "Kill a friendly unit. If you do, give +[Might] equal to its Might to another friendly
 *     unit this turn. Draw 1."
 *   (Watchful Sentry ogn-096-298 "[Deathknell] — Draw 1" is the buffed victim, to witness "no Deathknell".)
 *
 * Q: If I use the Sett legend to save the unit I Deathgripped, do I still give the Might bonus to another unit?
 * A: No. The Boss is a replacement effect: the "die" is replaced by heal/exhaust/recall, so the unit was never killed and the "If you do"
 *    bonus fails — no Might is given. You still Draw 1 (not contingent). The saved unit never hit the trash, so no Deathknell either.
 * Rules: 366 / 371–372 (replacement effects, not chain items), 359.3.e.14.b ("If you do" — Deathgrip is the rules' own example),
 *        359.3.e.5 (independent instructions still happen), 808.1.d (Deathknell needs an actual death).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_BOSS = "ogn-269-298";
const DEATHGRIP = "sfd-163-221";
const WATCHFUL_SENTRY = "ogn-096-298"; // 1 Might, [Deathknell] — Draw 1

/**
 * P1's turn. P1 (legend The Boss, ready): a BUFFED Watchful Sentry (1+1 = 2) and a 3-Might Brawler in base; Deathgrip in hand;
 * [2] for Deathgrip + 1 Power for the Boss's [rainbow]. Known deck top d1, d2, d3. `withBoss=false` drops the legend (control).
 */
function board(withBoss = true) {
  const s = scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", WATCHFUL_SENTRY, "sentry", { buffed: true })
    .unit(P1, "base", { might: 3, name: "Brawler" }, "brawler")
    .hand(P1, DEATHGRIP, "grip")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
  return withBoss ? s.legend(P1, THE_BOSS, "boss") : s;
}

/** Deathgrip the buffed Sentry and let it start resolving (both pass). */
async function gripSentry(withBoss = true): Promise<Game> {
  const game = await board(withBoss).build();
  expect(game.state("sentry")).toMatchObject({ isBuffed: true, might: 2 });
  await game.p1.cast("grip", { targets: "sentry" });
  expect(game.p1.energy()).toBe(0);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

/** After answering the Boss: give the bonus to the Brawler if — and only if — the engine asks; pass anything else. Returns whether asked. */
async function finish(game: Game): Promise<boolean> {
  let askedRecipient = false;
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "brawler")) {
      askedRecipient = true;
      await game.p1.pick("brawler");
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  await game.settle();
  return askedRecipient;
}

describe("Ruling 64b05891547c5db5 — saving the Deathgrip victim with The Boss turns off the 'If you do' Might bonus", () => {
  test("Deathgrip's kill is a 'would die' event for the buffed Sentry: P1 is asked whether to apply The Boss — a replacement decision sourced from the legend, not a chain item", async () => {
    const game = await gripSentry();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    expect(game.chain().some((c) => c.cardId === "boss")).toBe(false);
    expect(game.zoneOf("sentry")).toBe("base");
  });

  test("YES — costs paid and death replaced: Boss exhausted, the [rainbow] spent, buff spent; the Sentry is healed, exhausted and recalled (in base, NOT in the trash)", async () => {
    const game = await gripSentry();
    await game.p1.yes();
    await finish(game);
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.p1.trash()).not.toContain("sentry");
    expect(game.state("sentry")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 1 });
    expect(game.zoneOf("grip")).toBe("trash");
  });

  test("YES — the ruling: the unit was never killed, so 'If you do' fails — P1 is never asked for a recipient and the Brawler gets NO Might; but 'Draw 1' still happens (exactly d1 — no Deathknell draw either)", async () => {
    const game = await gripSentry();
    await game.p1.yes();
    const asked = await finish(game);
    expect(asked).toBe(false);
    expect(game.state("brawler")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.state("sentry").mightModifier).toBe(0);
    expect(game.p1.hand()).toEqual(["d1"]); // Deathgrip's Draw 1 only; the Sentry's Deathknell never triggered
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control (no Boss at all): the Sentry really dies → the only other friendly unit, the Brawler, gets +2 (the buffed Sentry's Might) and becomes 5 this turn, and P1 draws 2 (Deathgrip + Deathknell)", async () => {
    const game = await gripSentry(false);
    await finish(game); // a lone legal recipient may be taken without asking
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.state("brawler").might).toBe(5);
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    await game.advanceTurn();
    expect(game.state("brawler").might).toBe(3); // "this turn"
  });
});
