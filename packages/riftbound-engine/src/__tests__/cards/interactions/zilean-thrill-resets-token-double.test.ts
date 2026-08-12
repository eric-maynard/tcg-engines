/**
 * Interaction: Zilean, Time Mage (unl-086-219) · Champion Unit · Mind · 5 + [mind] · 5 Might
 *     "Once each turn, if you would play a token unit while I'm at a battlefield, you may play that
 *      token and an additional copy of it instead."
 *   × Sprite Burst (unl-069-219) · Spell · Mind · 5
 *     "Play two ready 3 [Might] Sprite unit tokens with [Temporary]."
 *   × Thrill of the Hunt (unl-184-219) · Spell · Fury/Body · 2 + [rainbow] · [Reaction]
 *     "Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost."
 *
 * Rules: 124 / 124.1 (a card that changes zones becomes a NEW object with none of the old object's
 * temporary modifications, statuses or memory), 056.1 (banishment is a non-board zone), 371 / 371.1
 * ("once each turn" limits a replacement effect to that many EVENTS per turn; once applied it cannot be
 * applied again this turn), 371.2.b (an offer that was DECLINED has not been applied), 186.1 (a token
 * that goes to any non-board zone ceases to exist immediately and can never come back), 446.1 (moving
 * between board zones is not a zone change), 143.4 (a unit enters exhausted).
 *
 * Question: Zilean's once-each-turn allowance is a REPLACEMENT bookkeeping slot on HIM, not on his
 * controller and not on the card definition. With Zilean at bf1, P1 plays Sprite Burst and applies the
 * replacement to one of its two play-token events (→ 3 Sprites, not 4). NO side: any further token play
 * this turn gets nothing, and moving Zilean bf1 → bf2 (board to board, no zone change — 446.1) does not
 * re-arm it. YES side: Thrill of the Hunt banishes Zilean and his owner replays him — banishment is a
 * non-board zone, so the returning Zilean is a NEW object (124 / 124.1) whose allowance is unspent, and
 * the next token play this turn is doubled a second time. And declining (371.2.b) never spends it.
 *
 * Expected: Sprite Burst + accept = 3 Sprites and the slot is spent; a move leaves it spent; a Thrill
 * round trip through banishment re-arms it; a decline never spent it in the first place. The Sprites
 * minted before the round trip are untouched by it, and a token Thrill banishes is simply gone (186.1) —
 * "its owner plays it" has nothing left to play.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const ZILEAN = "unl-086-219";
const SPRITE_BURST = "unl-069-219";
const THRILL_OF_THE_HUNT = "unl-184-219";

/**
 * P1's turn. Zilean stands at bf1 (both battlefields uncontrolled, so token plays have exactly one
 * legal destination and the replacement question is isolated from destination prompts). Two Sprite
 * Bursts (5 each) + Thrill of the Hunt (2 + [rainbow]) in hand, paid for exactly.
 */
function board(zileanAt: "bf1" | "base" = "bf1") {
  return scenario()
    .resources(P1, { energy: 12, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P1, zileanAt, ZILEAN, "zilean")
    .hand(P1, SPRITE_BURST, "burst1")
    .hand(P1, SPRITE_BURST, "burst2")
    .hand(P1, THRILL_OF_THE_HUNT, "thrill");
}

function sprites(game: Game): string[] {
  return game.p1.units().filter((id) => game.state(id).isToken && game.state(id).name === "Sprite");
}

/**
 * Cast a Sprite Burst and drain its prompts: every token-destination prompt → base, every Zilean
 * "you may" offer answered with `zilean`. Returns the new Sprite ids and how many offers were shown.
 */
async function burst(game: Game, spell: string, zilean: "yes" | "no"): Promise<{ made: string[]; offers: number }> {
  const before = sprites(game);
  let offers = 0;
  await game.p1.cast(spell);
  for (let i = 0; i < 12; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
      await game.p1.pick("base");
      continue;
    }
    if (d?.kind === "yes-no" && d.seat === P1) {
      offers += 1;
      await (zilean === "yes" ? game.p1.yes() : game.p1.no());
      continue;
    }
    break;
  }
  expect(game.zoneOf(spell)).toBe("trash");
  return { made: sprites(game).filter((id) => !before.includes(id)), offers };
}

/** Thrill of the Hunt on `unit`; answers the replay-destination prompt with `dest` when one is asked. */
async function thrill(game: Game, unit: string, dest: "bf1" | "bf2"): Promise<void> {
  await game.p1.cast("thrill", { targets: unit });
  for (let i = 0; i < 8; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const key = d.options.find((o) => o.key === `battlefield-${dest}` || o.key === dest)?.key;
      if (key !== undefined) {
        await game.p1.pick(key);
        continue;
      }
    }
    break;
  }
}

describe("Zilean × Thrill of the Hunt — the once-each-turn token doubler is bookkeeping on the OBJECT", () => {
  // ── Step 1: baseline — one event doubled, slot spent ───────────────────────────────────────

  test("Step 1: Sprite Burst plays its two tokens as two events; applying Zilean to ONE of them yields 3 Sprites, each ready/3 Might/[Temporary] (371.1)", async () => {
    const game = await board().build();
    const { made, offers } = await burst(game, "burst1", "yes");
    expect(offers).toBe(1);
    expect(made).toHaveLength(3);
    for (const t of made) {
      expect(game.state(t)).toMatchObject({ baseMight: 3, controller: P1, isReady: true, isToken: true, might: 3 });
      expect(game.state(t).keywords).toContain("Temporary");
    }
    expect(game.p1.energy()).toBe(7);
    expect(game.violations()).toEqual([]);
  });

  test("Step 1: the allowance is now SPENT — a second Sprite Burst this turn gets no offer and makes exactly 2 (371.1)", async () => {
    const game = await board().build();
    expect((await burst(game, "burst1", "yes")).made).toHaveLength(3);
    const second = await burst(game, "burst2", "yes");
    expect(second.offers).toBe(0);
    expect(second.made).toHaveLength(2);
    expect(sprites(game)).toHaveLength(5);
  });

  // ── Step 2: declining is not applying (371.2.b) ────────────────────────────────────────────

  test("Step 2: declining on both events makes 2 Sprites and does NOT spend the slot — the next Sprite Burst is offered again and makes 3 (371.2.b)", async () => {
    const game = await board().build();
    const first = await burst(game, "burst1", "no");
    expect(first.offers).toBeGreaterThanOrEqual(1); // it WAS offered
    expect(first.made).toHaveLength(2);
    const second = await burst(game, "burst2", "yes");
    expect(second.offers).toBe(1);
    expect(second.made).toHaveLength(3);
    expect(sprites(game)).toHaveLength(5);
  });

  // ── Step 3: a move is not a zone change (446.1) — the ledger is untouched ──────────────────
  // A unit at a battlefield may only Standard-Move back to base (battlefield → battlefield needs
  // [Ganking]), so the board-to-board leg is tested base → bf1: same object, same ledger, and the
  // condition "while I'm at a battlefield" is re-read at the event.

  test("Step 3: Zilean base → bf1 is a Move between two spaces on the board (446.1), not a zone change — the object and its unspent allowance carry over, so the burst cast AFTER the move is doubled", async () => {
    const game = await board("base").build();
    const first = await burst(game, "burst1", "yes"); // in base: no offer, 2 Sprites
    expect(first.offers).toBe(0);
    expect(first.made).toHaveLength(2);
    await game.p1.move("zilean", "bf1");
    await game.settle();
    expect(game.zoneOf("zilean")).toBe("battlefield-bf1");
    expect(game.state("zilean")).toMatchObject({ damage: 0, isExhausted: true, might: 5, owner: P1 });
    const second = await burst(game, "burst2", "yes");
    expect(second.offers).toBe(1);
    expect(second.made).toHaveLength(3);
    expect(sprites(game)).toHaveLength(5);
  });

  test("Step 3: and the other way round — spend the allowance at bf1, then Move Zilean to base: no zone change, so nothing is restored (the second burst makes 2)", async () => {
    const game = await board().build();
    expect((await burst(game, "burst1", "yes")).made).toHaveLength(3);
    await game.p1.move("zilean", "base");
    await game.settle();
    expect(game.zoneOf("zilean")).toBe("base");
    const second = await burst(game, "burst2", "yes");
    expect(second.offers).toBe(0);
    expect(second.made).toHaveLength(2);
  });

  // ── Step 4/5: the banish round trip makes a new object with a fresh allowance ──────────────

  test("Step 4: Thrill of the Hunt banishes Zilean and his owner replays him to a battlefield — he re-enters exhausted (143.4) as a new object (124/124.1)", async () => {
    const game = await board().build();
    expect((await burst(game, "burst1", "yes")).made).toHaveLength(3);
    await thrill(game, "zilean", "bf2");
    await game.settle();
    expect(game.zoneOf("zilean")).toBe("battlefield-bf2");
    expect(game.state("zilean")).toMatchObject({ controller: P1, damage: 0, isExhausted: true, might: 5, owner: P1 });
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // Expected (124 / 124.1): Zilean went to banishment — a non-board zone (056.1) — and came back, so
  // he is a NEW object and nothing about the old one is tracked on him, including the once-each-turn
  // replacement allowance that object had spent. The next token play this turn is doubled again.
  // Actual: the engine keeps the "used this turn" ledger across the banish + replay (0 offers, 2
  // Sprites) — the counter is keyed to something that survives the identity reset (card/def or
  // controller) rather than to the instance.
  test("BUG: the replayed Zilean is a new object, so his once-each-turn allowance must be UNSPENT — the engine keeps it spent across banishment (124/124.1 vs 371.1)", async () => {
    const game = await board().build();
    expect((await burst(game, "burst1", "yes")).made).toHaveLength(3);
    await thrill(game, "zilean", "bf2");
    await game.settle();
    const second = await burst(game, "burst2", "yes");
    expect(second.offers).toBe(1);
    expect(second.made).toHaveLength(3);
    expect(sprites(game)).toHaveLength(6);
  });

  // Same bug, isolating the variable: the replay lands on the very battlefield he left, so his
  // LOCATION never changed — only the trip through banishment did. That trip is what 124 resets.
  test("BUG: replaying Zilean to the SAME battlefield re-arms him too — the reset is the zone change, not the change of location (124, 446.1)", async () => {
    const game = await board().build();
    expect((await burst(game, "burst1", "yes")).made).toHaveLength(3);
    await thrill(game, "zilean", "bf1");
    await game.settle();
    expect(game.zoneOf("zilean")).toBe("battlefield-bf1");
    const second = await burst(game, "burst2", "yes");
    expect(second.offers).toBe(1);
    expect(second.made).toHaveLength(3);
  });

  test("Step 5: the Sprites minted before the banish are untouched by the round trip — same ids, same state, still on the board", async () => {
    const game = await board().build();
    const first = await burst(game, "burst1", "yes");
    expect(first.made).toHaveLength(3);
    await thrill(game, "zilean", "bf2");
    await game.settle();
    for (const t of first.made) {
      expect(game.zoneOf(t)).toBe("base");
      expect(game.state(t)).toMatchObject({ controller: P1, damage: 0, isToken: true, might: 3 });
    }
    expect(sprites(game)).toEqual(expect.arrayContaining(first.made));
  });

  // ── token identity: 186.1 is one-way ───────────────────────────────────────────────────────

  test("a token Thrill banishes ceases to exist at once (186.1) — 'then its owner plays it' has nothing to play, and no replacement Sprite appears", async () => {
    const game = await board().build();
    const first = await burst(game, "burst1", "yes");
    const victim = first.made[0] as string;
    await thrill(game, victim, "bf2");
    await game.settle();
    expect(game.has(victim)).toBe(false);
    expect(game.zoneOf(victim)).toBe("gone");
    expect(game.locationOf(victim)).toBeUndefined();
    expect(sprites(game)).toHaveLength(2);
    expect(game.p1.trash()).not.toContain(victim);
    expect(game.p1.banishment()).not.toContain(victim);
    expect(game.violations()).toEqual([]);
  });

  // ── condition ──────────────────────────────────────────────────────────────────────────────

  test("NO side: Zilean in base is not 'at a battlefield' — no offer at all, Sprite Burst makes 2", async () => {
    const game = await board("base").build();
    const { made, offers } = await burst(game, "burst1", "yes");
    expect(offers).toBe(0);
    expect(made).toHaveLength(2);
  });
});
