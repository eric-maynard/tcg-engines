/**
 * Ruling 028d0ea83b8cf5ff — Kha'Zix, Evolving Hunter (UNL-119 → unl-119-219) · 5-Might Body champion
 *   "[Hunt] When I attack, you may spend 3 XP to deal damage equal to my Might to an enemy unit here."
 *   × Diana, Lunari (UNL-079 → unl-079-219) · 3-Might Mind champion
 *   "When a showdown begins here, you may pay [1]. If you do, [Predict], then reveal the top card of your
 *    Main Deck. If it's a spell, draw it."
 *
 * Q: Kha'Zix attacks Diana's battlefield and wants to spend 3 XP on her. Can Diana's player resolve Diana's
 *    ability and use the drawn spell (if it is a Reaction) before Kha'Zix's ability deals damage?
 * A (riftjudge): yes — both triggers go on the chain together, turn player's (Kha'Zix) first = bottom,
 *    Diana's on top; LIFO ⇒ Diana resolves first and a drawn Reaction can be cast before Kha'Zix's damage.
 *
 * RULING-CONFLICT: riftjudge 028d0ea83b8cf5ff makes "a showdown begins" and the attack/defend designations ONE
 * simultaneous batch; riftjudge e273cd59930f15f6 (its own test file, green) and CR 464.2 say the Showdown begins
 * FIRST and the designations follow inside it, so "when a showdown begins here" is queued as its own earlier batch
 * and sits UNDER the attack/defend triggers — LIFO ⇒ Kha'Zix's attack trigger resolves first and Diana's last.
 * The designation batch itself is ordered attackers-then-defenders (464.2.e.1), not by turn order. Engine follows
 * CR + e273cd59930f15f6; the facets below assert that order.
 * Rules: 464.2 / 464.2.e.1 (showdown opens, then designations), 340.1 (LIFO), 406.4 / 327 (Reaction window).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KHAZIX = "unl-119-219";
const DIANA = "unl-079-219";
const FLASH = "ogs-011-024"; // [Reaction] Move up to 2 friendly units to base. — [2]

/**
 * P1's turn, P1 has 3 XP and Kha'Zix (5) in base. P2 controls bf1 with Diana (3) there, has [3]
 * (1 for Diana + 2 for Flash) and Flash on top of the deck (so Diana's reveal draws it).
 */
function board() {
  return scenario()
    .xp(P1, 3)
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", DIANA, "diana")
    .unit(P1, "base", KHAZIX, "khazix")
    .deck(P2, [FLASH, "ogn-175-298"], ["flash", "p2next"]);
}

async function khazixAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("khazix", "bf1");
  expect(game.state("khazix").combatRole).toBe("attacker");
  expect(game.state("diana").combatRole).toBe("defender");
  return game;
}

/** Accept every finalization opt-in on offer, in whatever turn order the engine asks them (383.3.a). */
async function acceptOptIns(game: Game): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "yes-no") {
      return;
    }
    await game.seat(d.seat).yes();
  }
}

describe("Ruling 028d0ea83b8cf5ff — Kha'Zix's attack trigger vs Diana's showdown trigger: Diana is on top and resolves first", () => {
  test("when Kha'Zix attacks Diana's battlefield both triggers end up on the chain and a 'you may' opt-in is raised at finalization", async () => {
    const game = await khazixAttacks();
    const ids = game.chain().map((c) => c.cardId).sort();
    expect(ids).toEqual(["diana", "khazix"]);
    expect(game.chain().every((c) => c.triggered)).toBe(true);
    expect(game.chain().find((c) => c.cardId === "khazix")?.controller).toBe(P1);
    expect(game.chain().find((c) => c.cardId === "diana")?.controller).toBe(P2);
    // rule 383.3.a — both triggers are optional, so finalization raises an opt-in; which of the two
    // batches is asked first is asserted by the chain-order facet below, not here.
    expect(game.decision()).toMatchObject({ kind: "yes-no", timing: "FIN" });
    // Nothing has resolved yet: Diana undamaged, P1 still has its XP.
    expect(game.state("diana").damage).toBe(0);
    expect(game.p1.xp()).toBe(3);
  });

  test("a Reaction window exists before either trigger resolves: after the opt-ins both players receive chain priority with both items still pending (406.4)", async () => {
    const game = await khazixAttacks();
    await acceptOptIns(game); // Diana's "you may" opt-in, then Kha'Zix's "spend 3 XP"
    // rule 205 / 444.2 — Diana's "pay [1]. If you do, …" is a Pay game action performed as the
    // ability RESOLVES, not a base cost, so nothing has been paid yet.
    expect(game.p2.energy()).toBe(3);
    expect(game.chain()).toHaveLength(2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.state("diana").damage).toBe(0);
    expect(game.zoneOf("diana")).toBe("battlefield-bf1");
  });

  // RULING-CONFLICT (see the header): riftjudge 028d0ea83b8cf5ff wants bottom→top = [Kha'Zix, Diana]; CR 464.2 and
  // riftjudge e273cd59930f15f6 put the showdown-begin trigger in its own earlier batch, i.e. at the BOTTOM.
  test("CR 464.2 (contra the ruling) — chain bottom→top = [Diana, Kha'Zix]: the showdown-begin trigger is queued before the designations", async () => {
    const game = await khazixAttacks();
    expect(game.chain().map((c) => c.cardId)).toEqual(["diana", "khazix"]);
  });

  // RULING-CONFLICT (see the header): riftjudge 028d0ea83b8cf5ff has Diana resolve first, drawing Flash and
  // dodging with it. Under CR 464.2 / e273cd59930f15f6 her showdown-begin trigger is at the BOTTOM, so Kha'Zix's
  // attack trigger (top) resolves first and its 5 damage kills the 3-Might Diana before she ever resolves.
  test("CR 464.2 (contra the ruling) — Kha'Zix's trigger is on top and resolves first: Diana takes 5 and dies before her own trigger", async () => {
    const game = await khazixAttacks();
    await acceptOptIns(game); // Diana's "you may" opt-in, then Kha'Zix's "spend 3 XP"
    expect(game.chain().at(-1)?.cardId).toBe("khazix");
    // A Reaction window still exists first (406.4) — but Flash has not been drawn yet, so there is nothing
    // for P2 to cast: her deck's top card only reaches hand when Diana's trigger resolves.
    expect(game.p2.hand()).toEqual([]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("diana")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
