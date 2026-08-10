/**
 * Ruling 3591da84ccc47750 — Glasc Mixologist (SFD-165 → sfd-165-221) 5-Might unit
 *   "[Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow] from your trash, ignoring its cost."
 *   × Xin Zhao, Vigilant (SFD-176 → sfd-176-221) 3+[order], 4 Might "[Tank] I enter ready if you have two or more other
 *     units in your base."
 *
 * Q: My Glasc Mixologist dies defending against an attack; can its Deathknell play Xin Zhao to THAT battlefield, and then what?
 * A: Yes. The defender keeps control of the battlefield throughout combat (until Establish Control), so it is a legal
 *    play destination. The current combat then concludes: all units are healed, the result is "No Result" (both sides
 *    have units), and a NEW combat is staged between Xin Zhao and the attacker. Xin Zhao enters exhausted unless his
 *    condition is met.
 * Rules: 188 / 466.5 (control changes only at Establish Control), 466.1.a.1 (heal all units), 466.3.d / 466.3.d.1
 *        (No Result → stage a new Showdown + Combat), 808 (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLASC_MIXOLOGIST = "sfd-165-221";
const XIN_ZHAO = "sfd-176-221";

/**
 * P2's turn. P1 holds bf1 with Glasc Mixologist (5). P2's ready 6-Might Bruiser in base. P1's trash: Xin Zhao (3+[order])
 * and a 5-cost unit that is too expensive for the Deathknell. Nobody has resources (the play ignores cost).
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", GLASC_MIXOLOGIST, "glasc")
    .unit(P2, "base", { might: 6, name: "Bruiser" }, "bruiser")
    .trash(P1, XIN_ZHAO, "xin")
    .trash(P1, { cardType: "unit", energyCost: 5, might: 5, name: "Too Big" }, "toobig");
}

/** Bruiser attacks bf1; both pass Focus; combat damage kills Glasc (5 < 6). Returns at the Deathknell "you may". */
async function glascDiesDefending(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("bruiser", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // attacker has Focus
  await game.p2.passFocus();
  await game.p1.passFocus();
  expect(game.zoneOf("glasc")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "glasc", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  return game;
}

/** P1 accepts, the trigger resolves, P1 takes Xin Zhao. Returns at the destination choice. */
async function acceptAndTakeXin(game: Game): Promise<void> {
  await game.p1.yes();
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
  expect(offered).toEqual(["xin"]); // "Too Big" (cost 5) is not eligible
  await game.p1.pick("xin");
}

describe("Ruling 3591da84ccc47750 — Glasc Mixologist's Deathknell can drop Xin Zhao onto the battlefield it just died defending", () => {
  // Expected: P1 (defender) still controls bf1 mid-combat, so the Deathknell play offers "battlefield-bf1" beside "base".
  // Actual: no destination is offered at all — Xin Zhao is dropped straight into P1's base.
  test("ruling 3591da84ccc47750 — engine never offers the still-controlled bf1 as Xin Zhao's destination (auto-plays him to base)", async () => {
    const game = await glascDiesDefending();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 }); // not yet re-established
    await acceptAndTakeXin(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(dests).toEqual(["base", "battlefield-bf1"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  // Expected: Xin Zhao lands on bf1 exhausted, everyone healed, no score yet, and a fresh combat showdown is staged at bf1
  // with P2 (attacker) holding Focus. Actual: Xin goes to base, P2 conquers bf1 immediately and scores.
  test("ruling 3591da84ccc47750 — engine plays Xin Zhao to base and lets the attacker conquer instead of re-staging combat at bf1", async () => {
    const game = await glascDiesDefending();
    await acceptAndTakeXin(game);
    await game.p1.pick("battlefield-bf1");
    expect(game.state("xin")).toMatchObject({ controller: P1, damage: 0, isExhausted: true, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // ignoring its cost
    expect(game.state("bruiser")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // healed by the combat cleanup
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0); // "No Result": no conquer yet
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // new combat, attacker's Focus
    expect(game.chain()).toEqual([]);
  });

  // Expected: the re-staged combat resolves Xin (4) vs Bruiser (6): Xin dies, then P2 conquers. Actual: there is no second
  // combat — Xin survives in base (the destination step above cannot even be taken).
  test("ruling 3591da84ccc47750 — no re-staged combat between Xin Zhao and the attacker (Xin was never allowed onto bf1)", async () => {
    const game = await glascDiesDefending();
    await acceptAndTakeXin(game);
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("xin")).toBe("trash");
    expect(game.state("bruiser")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: declining the Deathknell leaves Xin Zhao in the trash and the Bruiser simply conquers bf1", async () => {
    const game = await glascDiesDefending();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("xin")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
  });
});
