/**
 * Interaction: seven token units in one turn — is there any token-supply cap?
 *   Recruit the Vanguard (ogs-015-024) · Spell · Order · 6 + [order] · [Action] —
 *     "Play four 1 [Might] Recruit unit tokens. (They can be played to your base or to battlefields you control.)"
 *   Vanguard Armory (sfd-168-221) · Gear · Order · 7 + [order] —
 *     "[Exhaust]: Play three 1 [Might] Recruit unit tokens. (You may play them to different locations.)"
 *   Renata Glasc, Industrialist (sfd-171-221) · Champion Unit · Order · 4 + [order] · 4 Might — "Your tokens enter ready."
 *   Supporting: Discipline (ogn-058-298) "+2 [Might] this turn. Draw 1.", Incinerate (ogs-003-024)
 *   "Deal 2 to a unit at a battlefield.", Vengeance (ogn-229-298) "Kill a unit.", Chemtech Cask
 *   (sfd-063-221) "…play a Gold gear token exhausted."
 *
 * Question: 4 + 3 = seven token units in a single turn — more than any printed token supply in a
 * booster. Does the engine cap simultaneously existing tokens? Does each token get its own identity
 * (so killing one leaves its twins untouched and damage tracks per token)? Does Renata's replacement
 * apply to every one of the seven, or only the first? And when a surplus token dies, does it linger
 * as a ghost object in the trash?
 *
 * Rules: 180 (tokens are Game Objects created by spells and abilities), 181 (a token may be
 * represented by ANYTHING — printed tokens shipped in boosters are not required to play one: the
 * rules-level statement that physical supply never gates creation), 182 / 186 (a token exists on the
 * board or the chain and nowhere else), 186.1 (a token put into any other zone ceases to exist
 * immediately after moving there), 187.1 (an effect fixes a token's shared characteristics, not its
 * identity), 439.1 (Creating produces a Game Object that did not previously exist), 439.2 / 439.2.b /
 * 439.2.b.1 (a created permanent goes straight to a location on the board it could be played to).
 *
 * Expected: all seven are created, each a separate object with its own damage / buff / exhaustion /
 * death; Renata's continuous "enter ready" replacement applies to every token she is out for, gear
 * tokens included; a killed Recruit passes through the trash and is then GONE — no ghost object for
 * later trash recursion, no leaked trash entry.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RECRUIT_THE_VANGUARD = "ogs-015-024";
const VANGUARD_ARMORY = "sfd-168-221";
const RENATA_INDUSTRIALIST = "sfd-171-221";
const DISCIPLINE = "ogn-058-298";
const INCINERATE = "ogs-003-024";
const VENGEANCE = "ogn-229-298";
const CHEMTECH_CASK = "sfd-063-221";

/** Every token id currently on the board for P1, base and battlefield alike. */
function tokensOf(game: Game): string[] {
  return [...game.p1.units("base"), ...game.p1.units("bf1")].filter((id) => game.state(id).isToken);
}

/**
 * P1's turn 2 with a battlefield P1 controls, Recruit the Vanguard in hand and Vanguard Armory in
 * play. `renata: false` drops the Industrialist so the tokens' default entry state is visible.
 * The script answers the seven "choose a destination" prompts: Recruit's four to bf1, Armory's three
 * to the base — the split the card texts explicitly permit.
 */
function board(opts: { renata?: boolean } = {}) {
  const b = scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 30, power: { calm: 5, fury: 5, order: 10, rainbow: 5 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .gear(P1, VANGUARD_ARMORY, "armory")
    .hand(P1, RECRUIT_THE_VANGUARD, "recruit")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P1, INCINERATE, "incinerate")
    .hand(P1, VENGEANCE, "vengeance")
    .script(P1, ["battlefield-bf1", "battlefield-bf1", "battlefield-bf1", "battlefield-bf1", "base", "base", "base"]);
  if (opts.renata !== false) {
    b.unit(P1, "base", RENATA_INDUSTRIALIST, "renata");
  }
  return b;
}

/** Cast Recruit the Vanguard, then exhaust the Armory: seven tokens on the board. */
async function flood(opts: { renata?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.cast("recruit");
  await game.settle();
  await game.p1.activate("armory", 0);
  await game.settle();
  return game;
}

describe("Recruit flood: seven tokens in one turn, no supply limit", () => {
  // ---- no cap ----------------------------------------------------------------------------------

  test("all seven tokens are created — four from the spell, three from the gear — and every one is a distinct live Game Object (180, 439.1, 439.2)", async () => {
    const game = await flood();
    const tokens = tokensOf(game);
    expect(tokens).toHaveLength(7);
    expect(new Set(tokens).size).toBe(7); // distinct identities, not one shared object
    for (const id of tokens) {
      expect(game.has(id)).toBe(true);
      expect(game.state(id).name).toBe("Recruit");
      expect(game.state(id).baseMight).toBe(1);
      expect(game.state(id).cardType).toBe("unit");
      expect(game.state(id).controller).toBe(P1);
      expect(["base", "bf1"]).toContain(game.locationOf(id));
    }
    expect(game.state("armory").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("nothing is dropped, deferred or refused for want of a physical supply: the surplus lands where the cards say it may — the spell's four at a battlefield P1 controls, the gear's three at the base (181, 439.2.b.1)", async () => {
    const game = await flood();
    expect(game.p1.units("bf1").filter((id) => game.state(id).isToken)).toHaveLength(4);
    expect(game.p1.units("base").filter((id) => game.state(id).isToken)).toHaveLength(3);
    // Non-token permanents are untouched: the anchor and Renata are still where they were.
    expect(game.p1.units("bf1")).toContain("anchor");
    expect(game.p1.units("base")).toContain("renata");
  });

  test("each creation asks its own destination and offers both legal locations — the tokens are not forced into one pile (439.2.b.1)", async () => {
    // No script here, so settle() stops at each unanswered destination pick in turn.
    const game = await scenario()
      .turn(2)
      .active(P1)
      .resources(P1, { energy: 30, power: { order: 10 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
      .hand(P1, RECRUIT_THE_VANGUARD, "recruit")
      .build();
    await game.p1.cast("recruit");
    for (let i = 0; i < 4; i++) {
      await game.settle();
      const decision = game.decision();
      expect(decision?.kind).toBe("pick");
      expect(decision?.seat).toBe(P1);
      expect(decision?.source?.cardId).toBe(`token-recruit-${i + 1}`);
      expect((decision as { options: { key: string }[] }).options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
      await game.p1.pick(i % 2 === 0 ? "base" : "battlefield-bf1");
    }
    await game.settle();
    expect(game.p1.units("base").filter((id) => game.state(id).isToken)).toHaveLength(2);
    expect(game.p1.units("bf1").filter((id) => game.state(id).isToken)).toHaveLength(2);
  });

  // ---- per-token identity ------------------------------------------------------------------------

  test("187.1 fixes the tokens' SHARED characteristics, not their identity: a buff and damage land on exactly one token and leave its six twins at 1 Might / 0 damage", async () => {
    const game = await flood();
    const atBf = game.p1.units("bf1").filter((id) => game.state(id).isToken);
    const victim = atBf[0] as string;
    const others = tokensOf(game).filter((id) => id !== victim);

    await game.p1.cast("discipline", { targets: victim });
    await game.settle();
    expect(game.state(victim).might).toBe(3);
    expect(others.map((id) => game.state(id).might)).toEqual([1, 1, 1, 1, 1, 1]);

    await game.p1.cast("incinerate", { targets: victim });
    await game.settle();
    expect(game.state(victim).damage).toBe(2);
    expect(game.state(victim).zone).toBe("battlefield-bf1"); // 2 damage, 3 Might: it survives
    expect(others.map((id) => game.state(id).damage)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(game.violations()).toEqual([]);
  });

  test("killing one Recruit leaves the other six untouched — same characteristics, separate objects", async () => {
    const game = await flood();
    const atBf = game.p1.units("bf1").filter((id) => game.state(id).isToken);
    const doomed = atBf[1] as string;
    const survivors = tokensOf(game).filter((id) => id !== doomed);

    await game.p1.cast("vengeance", { targets: doomed });
    await game.settle();
    expect(game.has(doomed)).toBe(false);
    expect(tokensOf(game).sort()).toEqual(survivors.sort());
    for (const id of survivors) {
      expect(game.state(id).damage).toBe(0);
      expect(game.state(id).might).toBe(1);
    }
  });

  // ---- Renata's replacement covers every token ---------------------------------------------------

  test("'Your tokens enter ready' applies to EVERY token she is out for — all seven enter ready; without her all seven enter exhausted", async () => {
    const withRenata = await flood();
    const readyTokens = tokensOf(withRenata);
    expect(readyTokens).toHaveLength(7);
    expect(readyTokens.map((id) => withRenata.state(id).isExhausted)).toEqual([false, false, false, false, false, false, false]);

    const without = await flood({ renata: false });
    const tired = tokensOf(without);
    expect(tired).toHaveLength(7);
    expect(tired.map((id) => without.state(id).isExhausted)).toEqual([true, true, true, true, true, true, true]);
  });

  test("the replacement is not unit-only: a GEAR token (Chemtech Cask's Gold, printed 'exhausted') enters ready while she is on board", async () => {
    /** P2's turn: P1 answers P2's spell so the Cask triggers, with and without Renata. */
    async function goldAfterCask(renata: boolean): Promise<Game> {
      const b = scenario()
        .turn(2)
        .active(P2)
        .resources(P1, { energy: 5, power: { calm: 3 } })
        .resources(P2, { energy: 9, power: { calm: 5 } })
        .gear(P1, CHEMTECH_CASK, "cask")
        .hand(P1, DISCIPLINE, "mySpell")
        .hand(P2, DISCIPLINE, "theirSpell")
        .unit(P2, "base", { might: 2, name: "P2 Grunt" }, "grunt");
      if (renata) {
        b.unit(P1, "base", RENATA_INDUSTRIALIST, "renata");
      }
      const g = await b.build();
      await g.p2.cast("theirSpell", { targets: "grunt" });
      await g.p2.passPriority();
      await g.p1.cast("mySpell", { targets: "grunt" });
      await g.settle();
      await g.p1.yes(); // pay the Cask's [Exhaust]
      await g.settle();
      return g;
    }

    const bare = await goldAfterCask(false);
    const bareGold = bare.p1.gear().find((id) => id !== "cask") as string;
    expect(bare.state(bareGold).name).toBe("Gold");
    expect(bare.state(bareGold).isExhausted).toBe(true); // the Cask's own "exhausted" instruction

    const withHer = await goldAfterCask(true);
    const gold = withHer.p1.gear().find((id) => id !== "cask") as string;
    expect(withHer.state(gold).isToken).toBe(true);
    // Two entry modifiers meet on one object; the engine settles them the way the affected object's
    // controller would choose anyway (rule 372) — Renata's continuous replacement wins.
    expect(withHer.state(gold).isExhausted).toBe(false);
  });

  // ---- no ghost objects --------------------------------------------------------------------------

  test("186 / 186.1: a killed Recruit ceases to exist — zone 'gone', not in the trash, and the trash count only ever grows by the SPELLS that were cast", async () => {
    const game = await flood();
    const trashBefore = game.p1.trash();
    expect(trashBefore).toEqual(["recruit"]); // only the spell itself so far
    const doomed = (game.p1.units("bf1").filter((id) => game.state(id).isToken))[0] as string;

    await game.p1.cast("vengeance", { targets: doomed });
    await game.settle();

    expect(game.zoneOf(doomed)).toBe("gone");
    expect(game.has(doomed)).toBe(false);
    expect(game.p1.trash()).toEqual(["recruit", "vengeance"]); // no ghost Recruit left behind
    expect(game.p1.trash()).not.toContain(doomed);
    expect(tokensOf(game)).toHaveLength(6);
    expect(game.violations()).toEqual([]);
  });

  test("killing several in a row leaves no accumulating residue: three deaths, three tokens gone, trash still only the spells", async () => {
    const game = await board()
      .hand(P1, VENGEANCE, "veng2")
      .hand(P1, VENGEANCE, "veng3")
      .build();
    await game.p1.cast("recruit");
    await game.settle();
    await game.p1.activate("armory", 0);
    await game.settle();
    const doomed = (game.p1.units("bf1").filter((id) => game.state(id).isToken)).slice(0, 3);
    expect(doomed).toHaveLength(3);
    for (const [i, id] of doomed.entries()) {
      await game.p1.cast(["vengeance", "veng2", "veng3"][i] as string, { targets: id });
      await game.settle();
    }
    expect(doomed.map((id) => game.zoneOf(id))).toEqual(["gone", "gone", "gone"]);
    expect(tokensOf(game)).toHaveLength(4);
    expect(game.p1.trash().filter((id) => game.state(id).isToken)).toEqual([]);
    expect(game.p1.trash()).toHaveLength(4); // recruit + three Vengeances
    expect(game.violations()).toEqual([]);
  });
});
