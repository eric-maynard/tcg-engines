/**
 * Death Mark — ven-144-166 · Spell · Fury/Chaos · 2 energy + 1 power (fury|chaos hybrid pip) · standard timing
 *
 *   [Burn 3]. (Put the top 3 cards of your Main Deck into your trash.)
 *   Play a 0 [Might] Shadow Clone unit token. (It has "When I attack, you may banish a unit from your trash.
 *   If you do, give me [Assault 4] this turn.")
 *   [Flow] [1][rainbow][rainbow] (You may play this from your trash for its Flow cost. Then banish it.)
 *
 * Head-judge notes — the tricky situations for THIS card:
 *   1. Burn 3 is SELF-mill (440.1): exactly my top 3, in order, into MY trash — the opponent's deck is untouched.
 *      It is what stocks the trash with units for the Clone and with spare Death Marks for Flow. With fewer than
 *      3 cards left I Burn Out mid-effect (440.4 / 431.2): recycle trash → an opponent gains 1 point → keep burning.
 *   2. The Shadow Clone (187.11) is a 0-Might domainless unit TOKEN: enters exhausted (185.2.d), survives at 0
 *      damage, mine to control; "Play a … token" with a battlefield I control lets me choose base or there.
 *   3. Its rules-defined ability — "When I attack, you may banish a unit from your trash → [Assault 4] this turn" —
 *      must come with the token whatever minted it (187): only UNITS in MY trash qualify (not the Death Mark
 *      itself), it is optional, and with Assault 4 a lone Clone beats a 3-Might defender instead of dying to it.
 *   4. Cost: 2 energy + one hybrid pip payable with fury OR chaos (135.2.e.6.c) — never calm. No [Action]/[Reaction]:
 *      own turn, Open state only, and Flow does not change that (829.1.b.2).
 *   5. Flow [1][rainbow][rainbow] is an alternate cost from the trash; the Flowed copy is BANISHED after resolving
 *      (829.1.b.1) while a hand-cast copy goes to the trash — so Death Mark → burns a second Death Mark → Flow
 *      that one immediately is the signature line (two Clones, six cards burned).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-144-166";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit — deck / trash stock
const clones = (ids: string[]) => ids.filter((c) => c.startsWith("token-shadow-clone-"));

/** P1: resources, Death Mark in hand, known deck top→ d1 (unit), d2 (Death Mark), d3 (unit), d4 (unit); P2 holds bf1 with a 3-Might defender. */
function board(pool: { energy?: number; power?: Record<string, number> } = { energy: 2, power: { rainbow: 1 } }) {
  return scenario()
    .resources(P1, pool)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Defender" }, "def")
    .deckTop(P1, SKULKER, "d1")
    .deckTop(P1, CARD, "d2")
    .deckTop(P1, SKULKER, "d3")
    .deckTop(P1, SKULKER, "d4")
    .hand(P1, CARD, "dm");
}

/** Cast (or Flow) a Death Mark and resolve it, placing the Clone at `dest`. */
async function castAndResolve(game: Game, card = "dm", opts: { flow?: boolean; dest?: string } = {}): Promise<void> {
  await game.p1.cast(card, opts.flow ? { flow: true } : {});
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(opts.dest ?? "base");
    await game.settle();
  }
}

/** Drive the Clone's attack trigger: opt in and banish `unit` when asked (in whatever order the prompts come). */
async function attackWith(game: Game, clone: string, unit: string | undefined): Promise<void> {
  await game.p1.move(clone, "bf1");
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || d.seat !== P1) {
      break;
    }
    if (d.kind === "yes-no") {
      await (unit ? game.p1.yes() : game.p1.no());
    } else if (d.kind === "pick" && unit && d.options.some((o) => o.card === unit || o.key === unit)) {
      await game.p1.pick(unit);
    } else if (d.kind === "pick" && !unit && d.allowDecline) {
      await game.p1.decline();
    } else if (d.kind === "action" && d.context !== "main") {
      await game.settle(); // pass focus/priority; combat resolves
    } else {
      break;
    }
  }
  await game.settle();
}

describe("Death Mark (ven-144-166)", () => {
  test("registry payload: 2-energy fury/chaos spell with one hybrid (rainbow) pip; effect = sequence [Burn(mill) 3 self, create Shadow Clone 0-Might token]; Flow [1][rainbow][rainbow]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: ["fury", "chaos"], energyCost: 2, name: "Death Mark", powerCost: ["rainbow"], timing: "standard" });
    expect(def?.abilities).toEqual([
      {
        effect: {
          effects: [
            { amount: 3, player: "self", type: "mill" },
            { token: { might: 0, name: "Shadow Clone", type: "unit" }, type: "create-token" },
          ],
          type: "sequence",
        },
        type: "spell",
      },
      { cost: { energy: 1, power: ["rainbow", "rainbow"] }, keyword: "Flow", type: "keyword" },
    ]);
  });

  test("hand cast: pays 2 energy + the pip; on resolution MY top 3 (d1, d2, d3) go to MY trash in one go, d4 is the new top, P2's deck untouched; the spell then joins the trash", async () => {
    const game = await board().build();
    const p2Deck = game.p2.deck().length;
    await game.p1.cast("dm");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.p1.trash()).toEqual([]); // nothing burns before resolution
    await castResolveTail(game);
    expect(game.p1.trash().sort()).toEqual(["d1", "d2", "d3", "dm"]);
    expect(game.p1.deck()[0]).toBe("d4");
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.violations()).toEqual([]);
  });

  test("the Shadow Clone: exactly one 0-Might exhausted TOKEN unit under my control, alive at 0 damage; with no battlefield of mine it simply lands in base", async () => {
    const game = await board().build();
    await castAndResolve(game);
    const [tok, ...more] = clones(game.p1.base());
    expect(tok).toBeDefined();
    expect(more).toEqual([]);
    expect(game.state(tok!)).toMatchObject({ baseMight: 0, controller: P1, damage: 0, domains: [], isExhausted: true, isToken: true, might: 0, name: "Shadow Clone", owner: P1 });
    expect(clones(game.p2.base())).toEqual([]);
  });

  test("with a battlefield I control, 'Play a … token' lets me put the Clone there instead of base", async () => {
    const game = await board().battlefield("mine", { controller: P1 }).build();
    await game.p1.cast("dm");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("battlefield-mine");
    await game.settle();
    expect(clones(game.p1.units("mine"))).toHaveLength(1);
    expect(clones(game.p1.base())).toEqual([]);
  });

  test("cost gate: the hybrid pip is payable with fury, chaos or rainbow power but NOT calm; 1 energy is short", async () => {
    expect((await board({ energy: 2, power: { fury: 1 } }).build()).p1.can("cast", "dm")).toBe(true);
    expect((await board({ energy: 2, power: { chaos: 1 } }).build()).p1.can("cast", "dm")).toBe(true);
    expect((await board({ energy: 2, power: { calm: 1 } }).build()).p1.can("cast", "dm")).toBe(false);
    expect((await board({ energy: 2 }).build()).p1.can("cast", "dm")).toBe(false);
    expect((await board({ energy: 1, power: { rainbow: 1 } }).build()).p1.can("cast", "dm")).toBe(false);
  });

  test("timing: no [Action]/[Reaction] — neither the hand copy nor a trash copy (Flow) is playable on the opponent's turn, nor in response on a chain", async () => {
    const opp = await scenario().active(P2).resources(P1, { energy: 5, power: { rainbow: 3 } }).hand(P1, CARD, "inHand").trash(P1, CARD, "inTrash").build();
    expect(opp.p1.can("cast", "inHand")).toBe(false);
    expect(opp.p1.can("cast", "inTrash")).toBe(false);
    const own = await scenario().resources(P1, { energy: 5, power: { rainbow: 3 } }).hand(P1, CARD, "inHand").trash(P1, CARD, "inTrash").build();
    await own.p1.cast("inHand");
    expect(own.chain()).toHaveLength(1);
    expect(own.p1.can("cast", "inTrash")).toBe(false);
  });

  test("Flow: from the trash it costs [1][rainbow][rainbow] (not the hand cost), burns 3, makes a Clone, and is then BANISHED (829.1.b.1); one rainbow short → not legal", async () => {
    const short = await scenario().resources(P1, { energy: 3, power: { rainbow: 1 } }).trash(P1, CARD, "flowed").build();
    expect(short.p1.can("cast", "flowed")).toBe(false);
    const game = await scenario().resources(P1, { energy: 1, power: { rainbow: 2 } }).deckTop(P1, SKULKER, "d1").trash(P1, CARD, "flowed").build();
    expect(game.p1.option("cast", "flowed")?.fields.some((f) => f.arg === "flow")).toBe(true);
    await game.p1.cast("flowed", { flow: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await castResolveTail(game);
    expect(game.zoneOf("flowed")).toBe("banishment");
    expect(game.p1.trash()).toHaveLength(3);
    expect(game.p1.trash()).toContain("d1");
    expect(clones(game.p1.base())).toHaveLength(1);
  });

  test("signature line: Death Mark burns a second Death Mark (d2) into the trash → Flow d2 the same turn → two Clones, six cards burned, d2 banished, dm still in trash", async () => {
    const game = await board({ energy: 3, power: { rainbow: 3 } }).build();
    await castAndResolve(game);
    expect(game.zoneOf("d2")).toBe("trash");
    expect(game.p1.can("cast", "d2")).toBe(true);
    await castAndResolve(game, "d2", { flow: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("d2")).toBe("banishment");
    expect(game.zoneOf("dm")).toBe("trash");
    expect(clones(game.p1.base())).toHaveLength(2);
    expect(game.p1.trash()).toHaveLength(6); // d1 d3 dm + d4 and two more
  });

  test("Burn with only 2 cards left → Burn Out mid-effect (440.4 / 431.2): burn 2, recycle the trash into the deck, P2 gains 1 point, burn 1 more; the Clone is still played", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .deckTop(P1, SKULKER, "x1")
      .deckTop(P1, SKULKER, "x2")
      .trash(P1, SKULKER, "t1")
      .hand(P1, CARD, "dm")
      .build();
    await castAndResolve(game);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.deck()).toHaveLength(2); // {t1, x1, x2} recycled, one of them burned again
    expect(game.p1.trash()).toHaveLength(2); // that one + the resolved Death Mark
    expect(game.p1.trash()).toContain("dm");
    expect(clones(game.p1.base())).toHaveLength(1);
  });

  test("the Clone's own ability (187.11) — attacking with a unit in my trash: opt in, banish that unit, gain Assault 4 → the 0-Might Clone kills the 3-Might defender and conquers", async () => {
    // Expected: yes/no + pick from my trash units (d1/d3), banished; Clone fights as 4, def dies, bf1 becomes mine.
    // Actual: the token is minted with no abilities — no prompt, the Clone attacks at 0 and dies.
    const game = await board().build();
    await castAndResolve(game);
    const [tok] = clones(game.p1.base());
    await game.advanceTurn();
    await game.advanceTurn(); // my next turn: the Clone is ready
    expect(game.state(tok!).isReady).toBe(true);
    await attackWith(game, tok!, "d1");
    expect(game.zoneOf("d1")).toBe("banishment");
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.has(tok!) && game.locationOf(tok!)).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("the banish is optional and unit-only — declining (or a trash holding only the Death Mark spell) leaves the trash intact and the Clone attacks at 0", async () => {
    // Expected: a P1 opt-in prompt sourced from the Clone appears on attack; declining banishes nothing. Actual: no prompt at all.
    const game = await board().build();
    await castAndResolve(game);
    const [tok] = clones(game.p1.base());
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.move(tok!, "bf1");
    const d = game.decision();
    const prompted = d?.seat === P1 && (d.kind === "yes-no" || (d.kind === "pick" && d.options.some((o) => o.card === "d1")));
    expect(prompted).toBe(true);
    if (d?.kind === "pick") {
      expect(d.options.some((o) => o.card === "dm")).toBe(false); // spells in the trash are not "a unit"
      await game.p1.decline();
    } else {
      await game.p1.no();
    }
    await game.settle();
    expect(game.p1.banishment()).toEqual([]);
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.has(tok!) ? game.zoneOf(tok!) : "gone").not.toBe("battlefield-bf1"); // 0 Might into 3: the Clone is gone
  });
});

/** Pass priority around until the current chain has fully resolved (destination prompt → base). */
async function castResolveTail(game: Game): Promise<void> {
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("base");
    await game.settle();
  }
}
