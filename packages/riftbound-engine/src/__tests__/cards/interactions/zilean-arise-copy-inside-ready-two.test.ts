/**
 * Interaction: Zilean's token-play replacement inside Arise!'s linked "Then do this".
 *   Zilean, Time Mage (unl-086-219) · Champion Unit · Mind · 5 · 5 Might —
 *     "Once each turn, if you would play a token unit while I'm at a battlefield, you may play that
 *      token and an additional copy of it instead."
 *   Arise!            (sfd-198-221) · Calm/Order spell · 6 —
 *     "Play a 2 [Might] Sand Soldier unit token for each Equipment you control.
 *      Then do this: Ready up to two of them."
 *
 * Question, with two Equipment and Zilean at a battlefield:
 *   (a) Is the extra token one of "them", so the reflexive may ready it?
 *   (b) Is the play of two tokens ONE event (one extra copy) or two (two extras), and does the copy
 *       inherit the event's modifications?
 *   (c) May the reflexive ready a Sand Soldier some OTHER effect put on the board?
 *
 * Rules: 370 / 370.1.a (a Replacement Effect applies to an EVENT), 371 / 371.2 ("once each turn" is
 * spent per event; a "may" replacement is the choice of the player applying it), 375 (a replacement
 * INHERITS the modifications applied by the generating effect and by linked abilities that reference
 * the replaced event — its third example is a token play whose linked "Then do this" reaches the
 * replacement-added token), 386 (Reflexive Triggers), 393 / 394.1 (Linked Abilities may reference
 * game objects affected by another ability in the set), 397 (a component linked ability may only
 * interact with objects its linked abilities affected), 184.1 / 184.3 (a token's entry state and any
 * granted modifications come from the effect that plays it).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const ZILEAN = "unl-086-219";
const ARISE = "sfd-198-221";
const VANGUARD_ARMORY = "sfd-168-221";
const EQUIPMENT = { cardType: "equipment", energyCost: 1, name: "Test Blade" } as const;

interface Seen {
  kind: string;
  prompt: string;
  options: string[];
  seat: string;
}

/**
 * Drain the resolution of the spell/ability just played, answering every prompt: destinations go to
 * base, "up to N" picks take everything offered, and the replacement's "may" answers `acceptCopy`.
 * Returns every prompt that was raised, in order.
 */
async function resolve(game: Game, acceptCopy = true): Promise<Seen[]> {
  const seen: Seen[] = [];
  for (let i = 0; i < 20; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (!d || r.reason !== "unanswered") {
      break;
    }
    const options = ((d as { options?: { key: string }[] }).options ?? []).map((o) => o.key);
    seen.push({ kind: d.kind, options, prompt: d.prompt, seat: d.seat });
    if (d.kind === "pick") {
      if (d.prompt.includes("destination")) {
        await game.p1.pick("base");
      } else {
        await game.p1.pick(...options.slice(0, 2));
      }
    } else if (d.kind === "yes-no") {
      await (acceptCopy ? game.p1.yes() : game.p1.no());
    } else {
      break;
    }
  }
  return seen;
}

function board(equipment: number, withZilean = true) {
  let s = scenario()
    .resources(P1, { energy: 10, power: { calm: 2, order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .hand(P1, ARISE, "arise");
  if (withZilean) {
    s = s.unit(P1, "bf1", ZILEAN, "zilean");
  }
  for (let i = 0; i < equipment; i++) {
    s = s.gear(P1, EQUIPMENT, `e${i}`);
  }
  return s;
}

const soldiers = (game: Game): string[] => game.p1.units("base").filter((id) => game.state(id).name === "Sand Soldier");

describe("Zilean's replacement inside Arise!'s linked ready-two", () => {
  // ---- baseline: what the spell does on its own ---------------------------------------------------

  test("baseline (no Zilean): 2 Equipment → 2 tokens, entering EXHAUSTED, and the linked reflexive offers exactly those two, up to 2, none allowed (184.1, 386)", async () => {
    const game = await board(2, false).build();
    await game.p1.cast("arise");
    const seen = await resolve(game);
    const ready = seen.find((s) => /Ready|up to 2 targets/i.test(s.prompt));
    expect(ready).toBeDefined();
    expect(ready?.seat).toBe(P1);
    expect(ready?.options).toHaveLength(2);
    const tokens = soldiers(game);
    expect(tokens).toHaveLength(2);
    expect(tokens.every((id) => game.state(id).isReady)).toBe(true);
    expect(tokens.every((id) => game.state(id).might === 2)).toBe(true);
  });

  // ---- (b) ONE event, ONE extra copy ---------------------------------------------------------------

  test("(b) the instruction plays N tokens as ONE event, so the replacement applies ONCE: 2 Equipment → 3 tokens, never 4 (370.1.a, 371)", async () => {
    const game = await board(2).build();
    await game.p1.cast("arise");
    const seen = await resolve(game);
    const may = seen.filter((s) => s.kind === "yes-no");
    expect(may).toHaveLength(1); // asked once for the whole event…
    expect(may[0]?.seat).toBe(P1); // …and answered by the replacement's controller (371.2)
    expect(may[0]?.prompt).toMatch(/additional copy/i);
    expect(soldiers(game)).toHaveLength(3);
  });

  test("(b) three Equipment: 3 + 1 = 4 tokens — the copy count follows the EVENT, not the token count", async () => {
    const game = await board(3).build();
    await game.p1.cast("arise");
    await resolve(game);
    expect(soldiers(game)).toHaveLength(4);
  });

  test("(b) declining the 'may' leaves the event alone: 2 Equipment → 2 tokens (371.2)", async () => {
    const game = await board(2).build();
    await game.p1.cast("arise");
    const seen = await resolve(game, false);
    expect(seen.filter((s) => s.kind === "yes-no")).toHaveLength(1);
    expect(soldiers(game)).toHaveLength(2);
  });

  test("(b) the copy inherits the event's entry state (375, 184.1): Arise! never says 'ready', so the extra token arrives EXHAUSTED like the instructed ones — checked as it enters, before any reflexive could touch it", async () => {
    const game = await board(2).build();
    await game.p1.cast("arise");
    // Walk to the destination prompt for the REPLACEMENT-ADDED token and look at it there.
    let copy: string | undefined;
    for (let i = 0; i < 8 && !copy; i++) {
      await game.settle();
      const d = game.decision();
      if (!d) {
        break;
      }
      if (d.kind === "yes-no") {
        await game.p1.yes();
        continue;
      }
      const m = /destination for Sand Soldier \[([^\]]+)\]/.exec(d.prompt);
      if (m && soldiers(game).length === 3) {
        copy = m[1];
        break;
      }
      await game.p1.pick("base");
    }
    expect(copy).toBeDefined();
    const tokens = soldiers(game);
    expect(tokens).toHaveLength(3);
    expect(game.state(copy as string).isExhausted).toBe(true);
    expect(game.state(copy as string).might).toBe(2);
    expect(tokens.every((id) => game.state(id).isExhausted)).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("(b) 'once each turn' is spent by that event: a LATER token play the same turn (Vanguard Armory's three Recruits) is not doubled (371.1)", async () => {
    const game = await board(2).gear(P1, VANGUARD_ARMORY, "armory").build();
    await game.p1.cast("arise");
    expect((await resolve(game)).filter((s) => s.kind === "yes-no")).toHaveLength(1);
    expect(soldiers(game)).toHaveLength(3);

    await game.p1.activate("armory");
    const seen = await resolve(game);
    expect(seen.filter((s) => s.kind === "yes-no")).toEqual([]); // never asked again
    const recruits = game.p1.units("base").filter((id) => game.state(id).name === "Recruit");
    expect(recruits).toHaveLength(3);
  });

  // ---- (a) the extra token is one of "them" -------------------------------------------------------

  test("the replacement keeps Arise!'s linked 'Then do this' — with Zilean applying, the ready-two reflexive never fires and all three Sand Soldiers stay exhausted (375, 386, 393/394.1)", async () => {
    // Expected (rule 375, third example — "A spell reads 'play a ready 3 [M] Mech token. Then do this:
    // Give it Temporary.' … The Recruit token enters ready and is given Temporary."): the extra Sand
    // Soldier is part of the same play event, so it is one of "them" and the reflexive may ready any
    // TWO of the three. Actual: once the replacement applies, the reflexive is never raised at all —
    // no "up to 2 targets" prompt, and all three tokens remain exhausted.
    const game = await board(2).build();
    await game.p1.cast("arise");
    const seen = await resolve(game);

    const ready = seen.find((s) => /Ready|up to 2 targets/i.test(s.prompt));
    expect(ready).toBeDefined();
    const tokens = soldiers(game);
    expect(tokens).toHaveLength(3);
    expect(ready?.options.sort()).toEqual([...tokens].sort()); // any two of the three
    expect(tokens.filter((id) => game.state(id).isReady)).toHaveLength(2);
    expect(tokens.filter((id) => game.state(id).isExhausted)).toHaveLength(1);
  });

  test("even DECLINING Zilean's 'may' loses the reflexive — the linkage must survive a replacement that was offered and refused (371.2, 386)", async () => {
    // Expected: declining leaves Arise! exactly as printed — 2 tokens, then ready up to two of them.
    // Actual: no ready prompt is raised and both tokens stay exhausted, so merely HAVING Zilean at a
    // battlefield turns the spell's second sentence off.
    const game = await board(2).build();
    await game.p1.cast("arise");
    const seen = await resolve(game, false);
    expect(seen.find((s) => /Ready|up to 2 targets/i.test(s.prompt))).toBeDefined();
    const tokens = soldiers(game);
    expect(tokens).toHaveLength(2);
    expect(tokens.every((id) => game.state(id).isReady)).toBe(true);
  });

  // ---- (c) "them" is the linked set, not every Sand Soldier on the board -------------------------

  test("(c) 397: an identical Sand Soldier this spell did not play is NOT one of 'them' — the reflexive offers only the tokens the linked instruction affected", async () => {
    const game = await board(2, false)
      .unit(P1, "base", { might: 2, name: "Sand Soldier" }, "impostor", { exhausted: true })
      .build();
    await game.p1.cast("arise");
    const seen = await resolve(game);
    const ready = seen.find((s) => /Ready|up to 2 targets/i.test(s.prompt));
    expect(ready).toBeDefined();
    expect(ready?.options).not.toContain(game.card("impostor"));
    expect(ready?.options).toHaveLength(2);

    const played = soldiers(game).filter((id) => id !== game.card("impostor"));
    expect(played).toHaveLength(2);
    expect(played.every((id) => game.state(id).isReady)).toBe(true);
    expect(game.state("impostor").isExhausted).toBe(true); // however indistinguishable it looks
  });
});
