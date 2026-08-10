/**
 * Interaction: Blind Fury (ogn-025-298) · Spell · Fury · 4+[fury][fury] · Action
 *     "Each opponent reveals the top card of their Main Deck. Choose one and banish it, then play
 *      it, ignoring its cost. Then recycle the rest."
 *   × Rally the Troops (sfd-166-221) · Spell · Order · 2 · Action
 *     "When a friendly unit is played this turn, buff it. Draw 1."
 *   × Viktor, Innovator (ogn-117-298) · Champion Unit · Mind · 4+[mind] · 3 Might   (P2's)
 *     "When you play a card on an opponent's turn, play a 1 [Might] Recruit unit token in your base."
 *   (+ Dune Drake ogn-131-298 as P2's top card; Promising Future ogn-115-298 for the contrast case)
 *
 * Question. P1's turn; P1 resolved Rally the Troops earlier this turn. P2 controls Viktor. P1 casts
 * Blind Fury, P2 reveals Dune Drake, P1 chooses it, banishes it and plays it ignoring its cost.
 * (a) Who is "playing" the Drake — does P2's Viktor make a Recruit (a P2-OWNED card was played on
 * P2's opponent's turn)? (b) Does P1's Rally delayed trigger buff the Drake although P2 owns it?
 * (c) Exact sequencing: Drake finalized vs Blind Fury finishing, Rally's trigger, first priority
 * window. (d) Contrast: P1's Promising Future makes P2 play that same Drake.
 *
 * Rules: 419.1 / 419.3 / 191.1 / 191.3 (the INSTRUCTED player plays and controls the card — owner
 * irrelevant); 740.1.a ("friendly" = same controller); 108.6.e (banish → owner's banishment);
 * 354.2 / 354.3 (the "play it" item is Pending and waits for Blind Fury to finish); 355.2.a (player's
 * base or a battlefield they control); 356.1.b.1 (cost 0); 337.2 + 143.4 (a unit resolves at once,
 * enters exhausted); 419.4.a (on-play triggers fire when the play completes); 337.4 (priority only
 * once nothing is left to finalize); 340.1 (LIFO resolution).
 *
 * Expected: (a) NO Recruit — P1 played a card on P1's own turn; Viktor's "you" (P2) played nothing.
 * (b) YES — the Drake enters under P1's control, so it is friendly to Rally's controller → buffed.
 * (c) Blind Fury: reveal → choose → banish (P2's banishment) → Drake becomes a Pending item (P1's)
 * → Blind Fury finishes to trash → P1 finalizes the Drake (location: P1's base / P1's battlefield,
 * pays 0) → it enters exhausted immediately → Rally's trigger is created and finalized → FIRST
 * priority window (P1, then P2) → buff resolves. No P2 chain item ever exists. (d) With Promising
 * Future P2 plays/controls the Drake on P1's turn → Viktor triggers (a Recruit for P2, finalized after
 * the remaining pending plays) and Rally does NOT buff the Drake (not friendly to P1) — while P1's own
 * Promising-Future unit IS buffed.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLIND_FURY = "ogn-025-298";
const RALLY = "sfd-166-221";
const VIKTOR = "ogn-117-298";
const DUNE_DRAKE = "ogn-131-298"; // 5-cost 5-Might Body unit ("When I attack…" — irrelevant here)
const PROMISING_FUTURE = "ogn-115-298";

const tokensIn = (ids: readonly string[]) => ids.filter((id) => id.startsWith("token-"));
const U = (n: number) => ({ cardType: "unit", energyCost: 3, might: n, name: `Filler ${n}` });

/**
 * P1's turn. P1: 8 energy + 2 fury (Rally 2 + Blind Fury 4+[fury][fury] → 2 spare, proving the Drake's
 * 5 is never charged), controls "home" (guarded), Rally + Blind Fury in hand. P2: Viktor in base, Dune
 * Drake on top of the Main Deck.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { fury: 2 } })
    .battlefield("home", { controller: P1 })
    .unit(P1, "home", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "base", VIKTOR, "viktor")
    .deckTop(P2, DUNE_DRAKE, "drake")
    .hand(P1, RALLY, "rally")
    .hand(P1, BLIND_FURY, "fury");
}

/** Rally resolved earlier this turn; Blind Fury cast and both players passed → P1 is looking at the revealed Drake. */
async function furyRevealed(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("rally");
  await game.settle();
  expect(game.zoneOf("rally")).toBe("trash");
  expect(game.chain()).toEqual([]);
  await game.p1.cast("fury");
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

/** …P1 chooses the Drake and puts it in P1's base; stops at the first priority window (Rally's trigger pending). */
async function drakeStolenToBase(): Promise<Game> {
  const game = await furyRevealed();
  await game.p1.pick("drake");
  await game.p1.pick("base");
  return game;
}

const summarize = (d: Decision | null) => (d ? `${d.seat}:${d.kind}${d.kind === "action" ? `/${d.context}` : ""}${d.source?.cardId ? `@${d.source.cardId}` : ""}` : "none");

describe("Blind Fury steals P2's Dune Drake — P1 is the player who plays it", () => {
  test("(c) Blind Fury's resolution: only P2's top card is offered; choosing it banishes it to its OWNER's (P2's) banishment and leaves a Pending Drake item controlled by P1 while Blind Fury is already finished (108.6.e, 354.2/354.3)", async () => {
    const game = await furyRevealed();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed", source: { cardId: "fury" }, timing: "RES" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["drake"]);
    await game.p1.pick("drake");
    expect(game.zoneOf("drake")).toBe("banishment");
    expect(game.p2.banishment()).toEqual(["drake"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.zoneOf("fury")).toBe("trash"); // "recycle the rest" done, spell finished
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drake", controller: P1 })]);
    expect(game.chain().some((i) => i.controller === P2)).toBe(false);
  });

  test("(c) the Pending Drake is finalized by P1 IMMEDIATELY after Blind Fury finishes — the very next decision is P1's location choice (P1's base or P1's battlefield), no priority window in between (355.2.a, 337.1.b)", async () => {
    const game = await furyRevealed();
    await game.p1.pick("drake");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "drake" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.zone ?? o.key).sort() : []).toEqual(["base", "battlefield-home"]);
    expect(game.actingSeat()).toBe(P1);
  });

  test("(a) after finalization the Drake is on P1's board: controller P1, owner P2, entered EXHAUSTED, cost ignored (P1 still has the 2 spare energy), P2's banishment empty again (191.1/191.3, 143.4, 356.1.b.1)", async () => {
    const game = await drakeStolenToBase();
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.p1.base()).toContain("drake");
    expect(game.p2.base()).not.toContain("drake");
    expect(game.state("drake")).toMatchObject({ controller: P1, isExhausted: true, owner: P2 });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    expect(game.p2.banishment()).toEqual([]);
  });

  test("(c) the Drake's entry completes the play → Rally's delayed trigger is created AND finalized at once (P1's item naming the Drake); only then does the FIRST priority window open, P1 first then P2 (419.4.a, 337.4)", async () => {
    const game = await drakeStolenToBase();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rally", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1, source: { cardId: "rally" } });
    expect(game.state("drake").isBuffed).toBe(false); // not resolved yet
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("drake").isBuffed).toBe(false);
  });

  test("(c) full decision trace from casting Blind Fury to the open main phase: P1 prio → P2 prio → [pick Drake]RES → [destination]RES → P1 prio(Rally) → P2 prio(Rally) → open; P2 is never asked anything else and never controls a chain item", async () => {
    const game = await board().build();
    await game.p1.cast("rally");
    await game.settle();
    const trace: string[] = [];
    let p2Item = false;
    const note = () => {
      trace.push(summarize(game.decision()));
      p2Item ||= game.chain().some((i) => i.controller === P2);
    };
    await game.p1.cast("fury");
    note();
    await game.p1.passPriority();
    note();
    await game.p2.passPriority();
    note();
    await game.p1.pick("drake");
    note();
    await game.p1.pick("base");
    note();
    await game.p1.passPriority();
    note();
    await game.p2.passPriority();
    note();
    expect(trace).toEqual([
      `${P1}:action/chain@fury`,
      `${P2}:action/chain@fury`,
      `${P1}:pick@fury`,
      `${P1}:pick@drake`,
      `${P1}:action/chain@rally`,
      `${P2}:action/chain@rally`,
      `${P1}:action/main`,
    ]);
    expect(p2Item).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("(b) Rally the Troops DOES buff the P2-owned Drake — 'friendly' follows the controller (740.1.a): after both pass it is buffed, 5 → 6 Might", async () => {
    const game = await drakeStolenToBase();
    await game.settle();
    expect(game.state("drake")).toMatchObject({ controller: P1, isBuffed: true, might: 6, owner: P2 });
    expect(game.state("guard").isBuffed).toBe(false); // only the unit that was played
    expect(game.chain()).toEqual([]);
  });

  test("(a) Viktor stays silent: P1 played a card on P1's OWN turn and P2 played nothing → no Recruit token anywhere, P2's base is still exactly [Viktor] (419.1, 191.1)", async () => {
    const game = await drakeStolenToBase();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.base()).toEqual(["viktor"]);
    await game.settle();
    expect(game.p2.base()).toEqual(["viktor"]);
    expect(tokensIn(game.p2.base())).toEqual([]);
    expect(tokensIn(game.p1.base())).toEqual([]);
    expect(game.p2.units()).toEqual(["viktor"]);
    expect(game.violations()).toEqual([]);
  });

  test("(a)/(b) same answers when P1 puts the Drake at P1's battlefield instead: controlled by P1 at 'home', buffed, still no Recruit", async () => {
    const game = await furyRevealed();
    await game.p1.pick("drake");
    await game.p1.pick("battlefield-home");
    await game.settle();
    expect(game.locationOf("drake")).toBe("home");
    expect(game.p1.units("home").sort()).toEqual(["drake", "guard"]);
    expect(game.state("drake")).toMatchObject({ controller: P1, isBuffed: true, isExhausted: true, might: 6, owner: P2 });
    expect(tokensIn([...game.p2.base(), ...game.p1.base()])).toEqual([]);
  });
});

describe("contrast (d): Promising Future makes P2 play the same Drake on P1's turn — Viktor triggers, Rally ignores it", () => {
  /**
   * P1's turn; Rally resolved; P1 casts Promising Future (5+[mind]). P1's top 5 = fillers a1..a5 (P1 banishes a2),
   * P2's top 5 = Drake + fillers (P2 banishes the Drake). Every later prompt: destination → base, priority → pass.
   * Returns the game in P1's open main phase plus what P2's base looked like when P1 was asked where a2 goes.
   */
  async function promisingFuture(): Promise<{ game: Game; p2BaseWhenA2Placed: string[] | undefined }> {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { mind: 1 } })
      .battlefield("home", { controller: P1 })
      .unit(P1, "home", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "base", VIKTOR, "viktor")
      .deck(P1, [U(1), U(2), U(3), U(4), U(5), U(6)], ["a1", "a2", "a3", "a4", "a5", "a6"])
      .deck(P2, [DUNE_DRAKE, U(2), U(3), U(4), U(5), U(6)], ["drake", "b2", "b3", "b4", "b5", "b6"])
      .hand(P1, RALLY, "rally")
      .hand(P1, PROMISING_FUTURE, "pf")
      .build();
    await game.p1.cast("rally");
    await game.settle(); // Rally resolves (draws a1)
    await game.p1.cast("pf");
    await game.p1.passPriority();
    await game.p2.passPriority();
    let p2BaseWhenA2Placed: string[] | undefined;
    for (let i = 0; i < 30; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        const keys = d.options.map((o) => o.card ?? o.zone ?? o.key);
        if (d.source?.cardId === "a2" && d.semantics === "destination") {
          p2BaseWhenA2Placed = game.p2.base();
        }
        const want = keys.includes("drake") ? "drake" : keys.includes("a2") ? "a2" : keys.includes("base") ? "base" : (keys[0] as string);
        await game.seat(d.seat).pick(want);
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "yes-no") {
        await game.seat(d.seat).no();
      } else if (d.kind === "order") {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    return { game, p2BaseWhenA2Placed };
  }

  test("(d) the instructed player is P2: the Drake lands in P2's base under P2's control (and ownership) — on P1's turn", async () => {
    const { game } = await promisingFuture();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.p2.base()).toContain("drake");
    expect(game.state("drake")).toMatchObject({ controller: P2, owner: P2 });
    expect(game.p2.banishment()).toEqual([]);
  });

  test("(d) Viktor triggers — P2 played a card on an opponent's turn → exactly one 1-Might Recruit token in P2's base (none for P1)", async () => {
    const { game } = await promisingFuture();
    const tokens = tokensIn(game.p2.base());
    expect(tokens).toHaveLength(1);
    expect(game.state(tokens[0] as string)).toMatchObject({ controller: P2, isToken: true, might: 1, name: "Recruit" });
    expect(tokensIn(game.p1.base())).toEqual([]);
  });

  test("(d) Viktor's Recruit is appended AFTER the remaining pending plays: when P1 is placing P1's own Promising-Future unit, P2 has no token yet", async () => {
    const { p2BaseWhenA2Placed } = await promisingFuture();
    expect(p2BaseWhenA2Placed).toBeDefined();
    expect(tokensIn(p2BaseWhenA2Placed ?? [])).toEqual([]);
  });

  test("(d) Rally does NOT buff the P2-controlled Drake (not friendly to P1: still 5 Might, unbuffed) — but it DOES buff P1's own Promising-Future unit", async () => {
    const { game } = await promisingFuture();
    expect(game.state("drake")).toMatchObject({ isBuffed: false, might: 5 });
    expect(game.zoneOf("a2")).toBe("base");
    expect(game.state("a2")).toMatchObject({ controller: P1, isBuffed: true, might: 3 });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
