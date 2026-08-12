/**
 * Ruling b705b3381b6471a3 — Grand Duelist (SFD-205 → sfd-205-221) · Legend (Fiora)
 *   "When one of your units becomes [Mighty], you may exhaust me to channel 1 rune exhausted."
 *   × Sett, Brawler (ogn-164-298) · 4 Might — "When I'm played and when I conquer, buff me.
 *     Spend my buff: Give me +4 [Might] this turn."
 *
 * Q: Does Fiora trigger when Sett enters as a 4-Might unit and then becomes [Mighty] through his own buff,
 *    and does she trigger AGAIN when he spends that buff for +4?
 * A: Yes to both. Sett enters at 4 (not yet Mighty); his "when played" buff resolves and takes him to 5, so
 *    he BECOMES Mighty and Fiora may fire. Later, activating his ability first spends the buff — he is back
 *    to 4 and not Mighty — and then the +4 resolves, putting him at 8: he becomes Mighty again and Fiora
 *    may fire a second time.
 * Rules: 709/710 ([Mighty] = 5+ Might; "becomes Mighty" fires on the transition), 383.3.a/402.1 (the
 *        "you may exhaust me to …" is opted into and paid while the trigger is Finalized),
 *        204.3.a/357 (a spent buff is a cost, paid at activation, before the ability resolves).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const GRAND_DUELIST = "sfd-205-221";
const SETT_BRAWLER = "ogn-164-298";

describe("Ruling b705b3381b6471a3 — Fiora fires each time Sett crosses into [Mighty]", () => {
  test("ruling, case 1: Sett enters at 4 Might (not Mighty yet), his buff resolves to 5, and Fiora's trigger is then offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { body: 1 } })
      .legend(P1, GRAND_DUELIST, "fiora")
      .hand(P1, SETT_BRAWLER, "sett")
      .runes(P1, "body", 3)
      .build();

    await game.p1.play("sett");
    // He is on the board at his printed 4 Might; the "buff me" trigger is still on the chain.
    expect(game.state("sett").might).toBe(4);
    expect(game.state("sett").isBuffed).toBe(false);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });

    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.state("sett").might).toBe(5); // buff resolved ⇒ [Mighty]
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.source?.cardId).toBe("fiora");

    await game.p1.yes();
    await game.settle();
    expect(game.state("fiora").isExhausted).toBe(true); // the cost Fiora asked for
  });

  test("case 1, declined: Fiora stays ready and nothing is channelled", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { body: 1 } })
      .legend(P1, GRAND_DUELIST, "fiora")
      .hand(P1, SETT_BRAWLER, "sett")
      .runes(P1, "body", 3)
      .build();
    const runes = game.p1.runes().length;
    await game.p1.play("sett");
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.state("fiora").isExhausted).toBe(false);
    expect(game.p1.runes().length).toBe(runes);
  });

  test("ruling, case 2: activating 'Spend my buff' first pays the buff — Sett is back to 4 and NOT Mighty while the ability sits on the chain", async () => {
    const game = await scenario()
      .legend(P1, GRAND_DUELIST, "fiora")
      .unit(P1, "base", SETT_BRAWLER, "sett", { buffed: true })
      .runes(P1, "body", 3)
      .build();
    expect(game.state("sett").might).toBe(5);

    await game.p1.activate("sett", 1); // "Spend my buff: Give me +4 [Might] this turn."
    expect(game.state("sett").isBuffed).toBe(false);
    expect(game.state("sett").might).toBe(4);
    expect(game.decision()).toMatchObject({ context: "chain", seat: P1 });
  });

  test("ruling, case 2: when the +4 resolves he is 8 Might — he becomes [Mighty] again and Fiora triggers a second time", async () => {
    const game = await scenario()
      .legend(P1, GRAND_DUELIST, "fiora")
      .unit(P1, "base", SETT_BRAWLER, "sett", { buffed: true })
      .runes(P1, "body", 3)
      .build();
    const readyRunes = game.p1.runes({ ready: true }).length;

    await game.p1.activate("sett", 1);
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.state("sett").might).toBe(8);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.decision()?.source?.cardId).toBe("fiora");

    await game.p1.yes();
    await game.settle();
    expect(game.state("fiora").isExhausted).toBe(true);
    // "channel 1 rune exhausted": one more rune, and it did not arrive ready.
    expect(game.p1.runes().length).toBe(readyRunes + 1);
    expect(game.p1.runes({ ready: true }).length).toBe(readyRunes);
    expect(game.violations()).toEqual([]);
  });
});
