/**
 * Sanction — ven-035-166 · Spell · Calm · 3 energy + [calm]
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Choose one —
 *     • Empower a unit. Disempower it at end of turn.
 *     • Disempower a unit that's [Empowered]. Empower it at end of turn.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. [Reaction] (813): legal on the opponent's turn, inside showdowns and on top of an open chain —
 *     it then resolves BEFORE the item it answered (LIFO).
 *  2. Mode 1 empowers NOW; every [Empowered] static on the unit (Punching Poro's +1) switches on at
 *     once; "at end of turn" = the Ending Step of the CURRENT turn, whoever's turn it is — cast on the
 *     opponent's turn it is gone before your turn starts.
 *  3. Mode 1 on an ALREADY-Empowered unit: the empower does nothing (441.1.c) but "Disempower it at
 *     end of turn" is unconditional — a permanently-empowered unit LOSES the status at end of turn.
 *  4. Mode 2 may only choose a unit that IS Empowered (442.1.a); with no Empowered unit around the
 *     mode is unselectable and, if it is the only conceivable mode, the whole spell still plays via
 *     mode 1. Disempower is immediate (statics drop mid-showdown), and the unit comes back Empowered
 *     at end of turn — so next turn it is Empowered again.
 *  5. Any unit, friendly or enemy. Choosing an enemy [Deflect] unit costs [rainbow] more (809).
 *  6. Cost 3 + [calm]; unaffordable at 2 energy or without the calm pip.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-035-166";
const PORO = "ven-007-166"; // Punching Poro · 2 Might · [Empowered] I have +1 Might
const CLEAVE = "ogn-004-298"; // Action spell · 1 fury · give a unit Assault 3 this turn
const DEFLECTOR = "ogn-013-298"; // Pouty Poro — 2-Might unit with printed Deflect
const EMPOWER = 0; // printed mode order
const DISEMPOWER = 1;

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", PORO, "plain") // not empowered → 2 Might
    .unit(P1, "base", PORO, "amped", { empowered: true }) // empowered → 3 Might
    .unit(P2, "bf1", PORO, "foe") // enemy, not empowered
    .hand(P1, CARD, "sanction");
}

/**
 * Pass priority around until Sanction resolves, answering its mode / target prompts in order; stops as
 * soon as the answers are used up (so items UNDER it on the chain are left alone). Returns what each
 * pick offered.
 */
async function resolve(game: Game, answers: (string | number)[]): Promise<string[][]> {
  const offered: string[][] = [];
  let picked = false;
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && (d.context === "main" || d.context === "showdown"))) {
      break;
    }
    if (d.kind === "action") {
      if (picked && answers.length === 0) {
        break;
      }
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick") {
      offered.push(d.options.map((o) => o.card ?? o.key));
      const want = answers.shift();
      expect(want).toBeDefined();
      const key = d.options.find((o) => o.key === String(want) || o.card === want)?.key;
      expect(key).toBeDefined();
      await game.seat(d.seat).answer({ keys: [key as string], kind: "pick" });
      picked = true;
    } else {
      throw new Error(`unexpected ${d.kind} prompt: ${d.prompt}`);
    }
  }
  return offered;
}

describe("Sanction (ven-035-166)", () => {
  test("cost: 3 energy + [calm] deducted on cast, one chain item, spell ends in trash; 2 energy or no calm pip → not castable", async () => {
    const game = await board().build();
    await game.p1.cast("sanction");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sanction", controller: P1, triggered: false })]);
    await resolve(game, [EMPOWER, "plain"]);
    expect(game.zoneOf("sanction")).toBe("trash");
    expect((await board().resources(P1, { energy: 2, power: { calm: 1 } }).build()).p1.can("cast", "sanction")).toBe(false);
    expect((await board().resources(P1, { energy: 3, power: { calm: 0 } }).build()).p1.can("cast", "sanction")).toBe(false);
  });

  test("mode 1 — Empower a unit: any unit (friendly or enemy) is offered; the chosen Poro is Empowered at once and its [Empowered] +1 turns on (2 → 3)", async () => {
    const game = await board().build();
    await game.p1.cast("sanction");
    const [modes, targets] = await resolve(game, [EMPOWER, "plain"]);
    expect(modes).toEqual(["0", "1"]);
    expect([...(targets ?? [])].sort()).toEqual(["amped", "foe", "plain"]);
    expect(game.state("plain")).toMatchObject({ isEmpowered: true, might: 3 });
    expect(game.state("foe")).toMatchObject({ isEmpowered: false, might: 2 }); // untouched
  });

  test("mode 1 — '…Disempower it at end of turn': still Empowered for the rest of the turn, gone once the turn ends", async () => {
    const game = await board().build();
    await game.p1.cast("sanction");
    await resolve(game, [EMPOWER, "plain"]);
    expect(game.state("plain").isEmpowered).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("plain")).toMatchObject({ isEmpowered: false, might: 2 });
  });

  test("mode 1 on an ALREADY-Empowered unit: nothing changes now (441.1.c) but it is still disempowered at end of turn", async () => {
    const game = await board().build();
    await game.p1.cast("sanction");
    await resolve(game, [EMPOWER, "amped"]);
    expect(game.state("amped")).toMatchObject({ isEmpowered: true, might: 3 });
    await game.advanceTurn();
    expect(game.state("amped")).toMatchObject({ isEmpowered: false, might: 2 });
  });

  test("[Reaction] on the opponent's turn in response to their spell: Sanction resolves first (LIFO), and 'end of turn' is the end of THEIR turn", async () => {
    const game = await board()
      .active(P2)
      .resources(P2, { energy: 1 })
      .hand(P2, CLEAVE, "cleave")
      .build();
    // 316.5.b — in a Neutral Open state on P2's turn only P2 may act, even with a Reaction in hand.
    expect(game.p1.can("cast", "sanction")).toBe(false);
    await game.p2.cast("cleave", { targets: "foe" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "sanction")).toBe(true);
    await game.p1.cast("sanction");
    expect(game.chain().map((c) => c.name)).toEqual(["Cleave", "Sanction"]);
    await resolve(game, [EMPOWER, "plain"]);
    expect(game.state("plain")).toMatchObject({ isEmpowered: true, might: 3 });
    expect(game.chain().map((c) => c.name)).toEqual(["Cleave"]);
    await game.settle();
    expect(game.state("foe").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    await game.advanceTurn(); // P2's turn ends → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("plain")).toMatchObject({ isEmpowered: false, might: 2 });
  });

  test("[Reaction] inside a showdown on your turn: castable while you hold Focus; empowering the attacker mid-combat makes a 2-vs-2 trade into a 3-vs-2 win", async () => {
    const game = await board().build();
    await game.p1.move("plain", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "sanction")).toBe(true);
    await game.p1.cast("sanction");
    await resolve(game, [EMPOWER, "plain"]);
    expect(game.state("plain").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("plain")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  // BUG — expected: mode 2 disempowers the chosen Empowered unit immediately (3 → 2) and re-empowers
  // it at end of turn (442 / printed text). Actual: mode 2 parsed as an unparsed `raw` effect — a no-op.
  test("mode 2 — Disempower an Empowered unit now (its +1 drops: 3 → 2), then Empower it again at end of turn", async () => {
    const game = await board().build();
    await game.p1.cast("sanction");
    await resolve(game, [DISEMPOWER, "amped"]);
    expect(game.state("amped")).toMatchObject({ isEmpowered: false, might: 2 });
    await game.advanceTurn();
    expect(game.state("amped")).toMatchObject({ isEmpowered: true, might: 3 });
    await game.advanceTurn(); // and it stays — the re-empower has no duration
    expect(game.state("amped")).toMatchObject({ isEmpowered: true, might: 3 });
  });

  // BUG — expected (442.1.a / 355.8): mode 2 may only choose a unit "that's [Empowered]" → only "amped".
  // Actual: mode 2 has no target descriptor at all (raw), so no Empowered-only target prompt exists.
  test("mode 2 offers ONLY Empowered units as targets", async () => {
    const game = await board().build();
    await game.p1.cast("sanction");
    const offered = await resolve(game, [DISEMPOWER, "amped"]);
    expect(offered[1]).toEqual(["amped"]);
  });

  // BUG — expected: with no Empowered unit anywhere, mode 2 is not selectable (a mode with no legal
  // choice may not be picked); the spell is still castable through mode 1. Actual: both modes offered.
  test("with no Empowered unit on the board only mode 1 is offered (spell still castable)", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).unit(P1, "base", PORO, "plain").hand(P1, CARD, "sanction").build();
    expect(game.p1.can("cast", "sanction")).toBe(true);
    await game.p1.cast("sanction");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    const modeKeys = d?.kind === "pick" && d.options.some((o) => o.mode !== undefined) ? d.options.map((o) => o.key) : ["0"];
    expect(modeKeys).toEqual(["0"]);
  });

  // BUG — expected (355.8): both modes choose a unit, so with no unit anywhere the spell is unplayable.
  // Actual: the raw mode 2 looks target-free to the engine, so the cast is offered.
  test("Sanction is castable with no unit on the board (355.8 — every mode needs a unit)", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).hand(P1, CARD, "sanction").build();
    expect(game.p1.can("cast", "sanction")).toBe(false);
  });

  test("Deflect (809.1.c.1): with a spare power of ANY domain the enemy Deflect unit can be chosen, and that pip is spent on top of 3 + [calm]", async () => {
    const rich = await scenario().resources(P1, { energy: 3, power: { calm: 1, fury: 1 } }).unit(P2, "base", DEFLECTOR, "pp").unit(P1, "base", PORO, "plain").hand(P1, CARD, "sanction").build();
    await rich.p1.cast("sanction");
    await resolve(rich, [EMPOWER, "pp"]);
    expect(rich.state("pp").isEmpowered).toBe(true);
    expect(rich.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
  });

  // BUG — expected (809 / 356.2.a.2: Deflect is a MANDATORY additional cost): with exactly [calm] and no
  // spare power, the enemy Deflect unit is not a legal choice — only "plain" is offered. Actual: the
  // resolution-time target prompt lists the Pouty Poro too and picking it empowers it for free.
  test("with no spare power the enemy [Deflect] unit is NOT offered at resolution", async () => {
    const broke = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).unit(P2, "base", DEFLECTOR, "pp").unit(P1, "base", PORO, "plain").hand(P1, CARD, "sanction").build();
    await broke.p1.cast("sanction");
    const offered = await resolve(broke, [EMPOWER, "plain"]);
    expect(offered[1]).toEqual(["plain"]);
  });

  test("parsed abilities: one reaction-timed spell ability whose effect is a 2-option choice; option 1 = empower a unit until end of turn (option 2 should be a disempower — currently raw)", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "calm", energyCost: 3, name: "Sanction", powerCost: ["calm"], timing: "reaction" });
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as { type: string; timing: string; effect: { type: string; options: { effect: { type: string; target?: unknown; duration?: string } }[] } };
    expect(ability).toMatchObject({ timing: "reaction", type: "spell" });
    expect(ability.effect.type).toBe("choice");
    expect(ability.effect.options).toHaveLength(2);
    expect(ability.effect.options[0]?.effect).toMatchObject({ duration: "turn", target: { type: "unit" }, type: "empower" });
  });

  // BUG — expected: option 2 parses to a `disempower` of an Empowered unit with an end-of-turn re-empower.
  test("parsed option 2 should be {type: disempower, target: empowered unit, re-empower at end of turn}, not raw text", async () => {
    const pool = await loadDefaultCardPool();
    const opt2 = (pool.get(CARD)?.abilities?.[0] as { effect: { options: { effect: { type: string; target?: { filter?: unknown } } }[] } }).effect.options[1]?.effect;
    expect(opt2?.type).toBe("disempower");
    expect(JSON.stringify(opt2?.target ?? {})).toMatch(/empowered/);
  });
});
