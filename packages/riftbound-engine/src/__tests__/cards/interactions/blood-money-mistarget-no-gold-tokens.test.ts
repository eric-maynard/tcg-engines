/**
 * Interaction: Blood Money (sfd-162-221) [Action] "Kill a unit at a battlefield with 2 [Might] or
 *     less. If it was an enemy unit, play a Gold gear token exhausted. If it was a friendly unit,
 *     play two Gold gear tokens exhausted."
 *   × Flash (ogs-011-024) [Reaction] "Move up to 2 friendly units to base."
 *   × Chemtech Cask (sfd-063-221) "When you play a spell on an opponent's turn, you may exhaust me
 *     to play a Gold gear token exhausted."
 *
 * P1 is in a showdown on P2's turn holding Focus, with a ready Cask, and plays Blood Money.
 *
 * Q: when the kill is ignored, does Blood Money still make Gold — and does the Cask's Gold still
 *    appear?
 *
 * A: no, and yes.
 *  - A unit moved to base is no longer "a unit at a battlefield", i.e. an illegal target as the
 *    spell resolves (359.3.e.2 / 359.3.e.4). Illegal target ⇒ that game object is unaffected and
 *    the instruction is ignored (359.3.e.5): no damage, and certainly no kill (428) at base.
 *  - "If it was an enemy unit…" / "If it was a friendly unit…" both reference the unit killed by
 *    the first instruction, so they are LINKED instructions (359.3.e.14); with the earlier
 *    instruction ignored, neither branch executes (359.3.e.14.a). ZERO Gold — the engine must not
 *    fall through to the friendly branch or to a default.
 *  - The spell is still considered played and is trashed, and its cost is not refunded
 *    (359.3.e.10). The Cask triggered on the PLAY, not on Blood Money's effect, so its own Gold is
 *    unaffected either way.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLOOD_MONEY = "sfd-162-221"; // Spell · Order · [Action] · 2 energy
const CHEMTECH_CASK = "sfd-063-221"; // Gear · Mind · 1 energy
const FLASH = "ogs-011-024"; // Spell · Chaos · [Reaction] · 2 energy

/** A 2-Might unit that draws its controller a card when it dies — the death-trigger oracle. */
const martyr = (name: string) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "die", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 2,
  name,
});

/** Gold gear tokens a seat controls. */
const goldOf = (game: Game, seat: "p1" | "p2") => game[seat].gear().filter((id) => game.state(id).name === "Gold");

/**
 * P2's turn. bf1 is empty, bf2 is P2's (their 2-Might Mark plus a 5-Might Anchor), bf3 is P1's
 * (P1's own 2-Might Friend). P1 has Blood Money + exactly its 2 energy, and a ready Cask.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: P1 })
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "bf2", martyr("Mark"), "mark")
    .unit(P2, "bf2", { might: 5, name: "Anchor" }, "anchor")
    .unit(P1, "bf3", martyr("Friend"), "friend")
    .gear(P1, CHEMTECH_CASK, "cask")
    .hand(P1, BLOOD_MONEY, "bm")
    .hand(P2, FLASH, "flash");
}

/** P2 opens a (non-combat) showdown at bf1 and passes Focus, so P1 may take Actions. */
async function showdownWithP1OnFocus(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.actingSeat()).toBe(P1);
  return game;
}

describe("Blood Money mistargeted — no Gold, but the Cask still pays", () => {
  test("setup: with Focus in a showdown on P2's turn P1 may play the [Action]; both 2-Might units are targetable, the 5-Might Anchor is not", async () => {
    const game = await showdownWithP1OnFocus();
    expect(game.p1.can("cast", "bm")).toBe(true);
    const offered = (game.p1.option("cast", "bm")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("mark"); // enemy, 2 Might, at a battlefield
    expect(offered).toContain("friend"); // "a unit" — friendly is fair game too
    expect(offered).not.toContain("anchor"); // 5 Might
    expect(offered).not.toContain("raider"); // 3 Might, and at bf1 only after the move
  });

  test("(a) Flash sends the Mark to base: nothing is killed and Blood Money makes ZERO Gold (359.3.e.5 / 359.3.e.14.a)", async () => {
    const game = await showdownWithP1OnFocus();
    await game.p1.cast("bm", { targets: "mark" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "flash")).toBe(true);
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("flash", { targets: ["mark"] });
    await game.settle(); // stops at the Cask's optional trigger

    expect(game.locationOf("mark")).toBe("base");
    expect(game.state("mark")).toMatchObject({ damage: 0, zone: "base" }); // not killed at base as a substitute
    expect(goldOf(game, "p1")).toEqual([]); // neither the enemy branch nor the friendly branch ran
    expect(goldOf(game, "p2")).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // Flash spent; the Mark's death trigger never fired
    // 359.3.e.10 — still considered played: it is in the trash and the 2 energy is gone.
    expect(game.zoneOf("bm")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
  });

  test("(a) the Cask's Gold is independent of the mistarget: exactly ONE Gold exists afterwards, and it came from the Cask", async () => {
    const game = await showdownWithP1OnFocus();
    await game.p1.cast("bm", { targets: "mark" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["mark"] });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "cask" } });
    await game.p1.yes(); // pay the exhaust cost
    await game.settle();

    const gold = goldOf(game, "p1");
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true });
    expect(game.state("cask").isExhausted).toBe(true); // the cost that bought it
    expect(game.violations()).toEqual([]);
  });

  test("(a) declining the Cask leaves NO Gold at all — proof the single Gold above is the Cask's, not a Blood Money fallback", async () => {
    const game = await showdownWithP1OnFocus();
    await game.p1.cast("bm", { targets: "mark" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["mark"] });
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(goldOf(game, "p1")).toEqual([]);
    expect(game.state("cask").isReady).toBe(true);
    expect(game.zoneOf("mark")).toBe("base");
  });

  test("(b) killing P1's OWN 2-Might unit: TWO Gold from Blood Money plus the Cask's third, and the friendly death trigger fires", async () => {
    const game = await showdownWithP1OnFocus();
    const p1Hand = game.p1.hand().length;
    await game.p1.cast("bm", { targets: "friend" });
    await game.settle();
    expect(game.zoneOf("friend")).toBe("trash");
    expect(goldOf(game, "p1")).toHaveLength(2); // the friendly branch, not the enemy branch
    await game.p1.yes();
    await game.settle();
    const gold = goldOf(game, "p1");
    expect(gold).toHaveLength(3);
    expect(gold.every((id) => game.state(id).isExhausted)).toBe(true);
    // Blood Money left hand (-1), the Friend's death trigger drew 1 (+1).
    expect(game.p1.hand()).toHaveLength(p1Hand);
  });

  test("(c) the enemy target stays legal: it is killed, ONE Gold from Blood Money plus the Cask's second, and its death trigger fires", async () => {
    const game = await showdownWithP1OnFocus();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("bm", { targets: "mark" });
    await game.settle();
    expect(game.zoneOf("mark")).toBe("trash");
    expect(goldOf(game, "p1")).toHaveLength(1); // the enemy branch: exactly one
    await game.p1.yes();
    await game.settle();
    expect(goldOf(game, "p1")).toHaveLength(2);
    expect(goldOf(game, "p2")).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // P2 drew off its own unit's death
    expect(game.zoneOf("bm")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
