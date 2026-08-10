/**
 * Ruling f1fb37aca4c4b890 — Deathgrip (SFD-163 → sfd-163-221) · Reaction [2] · Order
 *     "Kill a friendly unit. If you do, give +[Might] equal to its Might to another friendly unit this turn. Draw 1."
 *   × The Boss (Sett legend, OGN-269 → ogn-269-298) "If a buffed unit you control would die, you may pay [rainbow],
 *     exhaust me, and spend its buff to heal it, exhaust it, and recall it instead."
 *
 * Q: Can I Deathgrip a unit and save it with Sett's legend?
 * A: Yes. As Deathgrip resolves the buffed unit "would die"; The Boss (a replacement effect, no chain) is offered, you
 *    pay [rainbow] + exhaust the legend + spend the buff and the unit is healed/exhausted/recalled instead. Because it
 *    never died, "If you do" fails — no Might bonus is given (never asked) — but the unlinked Draw 1 still happens, and
 *    no Deathknell of the saved unit triggers.
 * Rules: 371.2 (optional replacement), 370.1.a.1 (replaced event never happened), 359.3.e.14.b ("If you do"),
 *        359.3.e.5 (unlinked Draw 1), 702.2.b (spending a buff), 808 (Deathknell needs a death).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEATHGRIP = "sfd-163-221";
const THE_BOSS = "ogn-269-298";
const EKKO = "ogn-110-298"; // 5 Might, "[Deathknell] — Recycle me to ready your runes."

/**
 * P1's turn. The Boss is P1's legend (ready). Victim (3, BUFFED → 4) and Recipient (2) in P1's base; Deathgrip in
 * hand with exactly [2]; one body Power floating for The Boss. Known deck top so the draw is observable.
 */
function board(opts: { power?: Record<string, number> } = {}) {
  return scenario()
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { energy: 2, power: opts.power ?? { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Onlooker" }, "onlooker")
    .unit(P1, "base", { might: 3, name: "Victim" }, "victim", { buffed: true })
    .unit(P1, "base", { might: 2, name: "Recipient" }, "rec")
    .hand(P1, DEATHGRIP, "grip")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

const isBossOffer = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "boss";

/** Cast Deathgrip on the Victim and let it resolve up to The Boss's question. */
async function gripVictim(game: Game): Promise<void> {
  await game.p1.cast("grip", { targets: "victim" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "grip", controller: P1, targets: ["victim"] })]);
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
}

describe("Ruling f1fb37aca4c4b890 — The Boss can save the Deathgrip victim; the 'If you do' Might bonus is then lost, the draw is not", () => {
  test("premise: the Victim is buffed (3 + 1 = 4); Deathgrip on it resolves into The Boss's optional replacement — a yes/no for P1 (acceptable), asked while the Victim is still on the board and nothing has been drawn", async () => {
    const game = await board().build();
    expect(game.state("victim")).toMatchObject({ isBuffed: true, might: 4 });
    await gripVictim(game);
    const d = game.decision();
    expect(isBossOffer(d)).toBe(true);
    expect((d as { canAccept?: boolean }).canAccept).not.toBe(false);
    expect((d as Decision).timing).not.toBe("FIN"); // a replacement question, not a chain item being finalized
    expect(game.chain().some((c) => c.cardId === "boss")).toBe(false); // The Boss never uses the chain
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.p1.hand()).toEqual([]);
  });

  test("accepting: [rainbow] paid, The Boss exhausted, the buff spent — the Victim is healed, exhausted and stays in base (recalled), NOT in the trash", async () => {
    const game = await board().build();
    await gripVictim(game);
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.p1.trash()).not.toContain("victim");
    expect(game.state("victim")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 3 });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("…so 'If you do' is not met: P1 is NEVER asked for a recipient and no unit gains Might — but Draw 1 still happens and Deathgrip goes to the trash", async () => {
    const game = await board().build();
    await gripVictim(game);
    await game.p1.yes();
    const prompts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || !d || d.kind === "action") {
        break;
      }
      prompts.push(`${d.kind}:${d.prompt}`);
      if (d.kind === "pick") {
        await game.seat(d.seat).pick(d.options[0]!.key); // would wrongly hand out the bonus
      } else {
        break;
      }
    }
    expect(prompts).toEqual([]);
    expect(game.state("rec")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.state("victim").mightModifier).toBe(0);
    expect(game.p1.hand()).toEqual(["d1"]); // Draw 1 is not contingent on the kill
    expect(game.zoneOf("grip")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — declining The Boss: the Victim dies, the other friendly unit (the lone candidate) gets +4 (its Might as it died, buff included), and P1 still draws 1", async () => {
    const game = await board().build();
    await gripVictim(game);
    await game.p1.no();
    const r = await game.settle(); // a lone recipient is bound without a question
    if (r.reason === "unanswered" && game.decision()?.kind === "pick") {
      await game.p1.pick("rec");
      await game.settle();
    }
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("rec")).toMatchObject({ might: 6, mightModifier: 4 });
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("boss").isExhausted).toBe(false);
    expect(game.p1.power("body")).toBe(1);
  });

  test("no [rainbow] in the pool: The Boss cannot be paid for, so it is never offered and Deathgrip simply kills the Victim (bonus offered as normal)", async () => {
    const game = await board({ power: {} }).build();
    await game.p1.cast("grip", { targets: "victim" });
    const r = await game.settle();
    expect(isBossOffer(game.decision())).toBe(false);
    if (r.reason === "unanswered" && game.decision()?.kind === "pick") {
      await game.p1.pick("rec");
      await game.settle();
    }
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("rec").might).toBe(6);
  });

  test("identity nuance: a saved unit did not 'die' — a buffed Ekko rescued by The Boss is recalled to base, NOT recycled, and his Deathknell never readies the runes", async () => {
    const game = await scenario()
      .legend(P1, THE_BOSS, "boss")
      .resources(P1, { energy: 2, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", EKKO, "ekko", { buffed: true })
      .unit(P1, "base", { might: 2, name: "Recipient" }, "rec")
      .runes(P1, "mind", 2, { exhausted: true })
      .hand(P1, DEATHGRIP, "grip")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .build();
    expect(game.state("ekko")).toMatchObject({ isBuffed: true, might: 6 });
    await game.p1.cast("grip", { targets: "ekko" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(isBossOffer(game.decision())).toBe(true);
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("ekko")).toBe("base"); // recalled ("this isn't a move"), not in the deck / trash
    expect(game.state("ekko")).toMatchObject({ isBuffed: false, isExhausted: true, might: 5 });
    expect(game.chain()).toEqual([]);
    expect(game.p1.runes({ ready: true })).toHaveLength(0); // no Deathknell
    expect(game.state("rec").might).toBe(2); // no bonus
    expect(game.p1.hand()).toEqual(["d1"]); // still drew
    expect(game.violations()).toEqual([]);
  });
});
