/**
 * Interaction: Sigil of the Storm (ogn-287-298, Battlefield)
 *     "When you conquer here, you must recycle one of your runes. (This doesn't choose anything.)"
 *   × Retreat (ogn-104-298, Spell · Mind · 1 · Reaction)
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   × the basic rune abilities (Recycle me: [Add] 1 power — no chain).
 *
 * Question. P1 conquers Sigil of the Storm; the conquer trigger goes on the chain.
 *  Variant (a): P1 has runes R1 and R2; in response P1 recycles R1 for 1 power.
 *  Variant (b): P1 has ZERO runes but 1 energy and a spare unit in base; in response P1 plays Retreat on
 *               the spare unit, channeling R3 (exhausted) off the top of the rune deck.
 *  Variant (c): zero runes, no response.
 * In each: is a rune picked when the trigger goes on the chain, what is P1 offered at resolution, and
 * does the conquer point stand?
 *
 * Ruling. "You MUST recycle one of your runes" is a 'must' instruction → it targets NOTHING (355.10.f; the
 * reminder text says so). The trigger is added with no rune selected; the rune is picked from whatever P1
 * controls AS IT RESOLVES (355.17). (a) R1 legally left in response; at resolution P1's runes = {R2} → R2
 * must go (sole candidate, no decline) — a targeting implementation would have locked R1 and fizzled,
 * which must NOT happen. (b) Retreat (targets the spare unit, 355.7) resolves first: unit to hand, R3
 * channeled exhausted; then the Sigil resolves over {R3} → R3 is recycled although it did not exist when
 * the ability triggered. (c) No runes at resolution → the instruction is impossible and ignored
 * (359.3.e.6 / 359.3.e.11); the trigger leaves the chain. In all variants the conquer already happened:
 * P1 keeps the Sigil and the point.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SIGIL_OF_THE_STORM = "ogn-287-298";
const RETREAT = "ogn-104-298";

/** P2 holds the Sigil with a 1-Might blocker; P1's 3-Might Raider in base is about to take it. */
function base() {
  return scenario()
    .battlefield("bf1", { controller: P2, def: SIGIL_OF_THE_STORM, inert: false, owner: P2 })
    .rune(P2, "calm", { alias: "theirs" })
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "bf1", { might: 1, name: "Blocker" }, "blocker");
}

/** (a) two P1 runes on board. */
const boardA = () => base().rune(P1, "fury", { alias: "r1" }).rune(P1, "fury", { alias: "r2" });

/** (b) no P1 runes; 1 energy floating, Retreat in hand, a spare unit in base, R3 on top of the rune deck. */
const boardB = () =>
  base()
    .resources(P1, { energy: 1 })
    .card("r3", { def: { cardType: "rune", domain: "mind", name: "Mind Rune" }, owner: P1, zone: "runeDeck" })
    .unit(P1, "base", { might: 1, name: "Spare" }, "spare")
    .hand(P1, RETREAT, "retreat");

/** (c) no P1 runes, nothing to respond with. */
const boardC = () => base();

const bf1 = (game: Game) => game.gameState.battlefields.bf1!;

/** Raider walks in, both pass Focus: 3 v 1 → conquer; the Sigil trigger is now the only chain item and P1 has priority. */
async function conquerSigil(game: Game): Promise<void> {
  await game.p1.move("raider", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.zoneOf("blocker")).toBe("trash");
  expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
  expect(game.p1.points()).toBe(1);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, name: "Sigil of the Storm", triggered: true })]);
}

/** Both pass on the Sigil trigger; if the engine surfaces the (forced) rune pick, assert its offer and take `expected`. */
async function resolveSigilExpecting(game: Game, expected: string | null): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  if (d?.kind === "pick") {
    expect(d).toMatchObject({ allowDecline: false, max: 1, min: 1, seat: P1 });
    expect(d.options.map((o) => o.key)).toEqual(expected === null ? [] : [expected]);
    if (expected !== null) {
      await game.p1.pick(expected);
    }
  }
  await game.settle();
}

describe("Sigil of the Storm 'must recycle' picks at RESOLUTION from the runes P1 controls then — never a locked target", () => {
  test("trigger time: the conquer trigger is added to the chain with NO rune named and NO prompt — P1 simply has priority (and its rune abilities) with both runes still in the pool", async () => {
    const game = await boardA().build();
    await conquerSigil(game);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(d?.kind).not.toBe("pick");
    expect(game.p1.runes().sort()).toEqual(["r1", "r2"]);
    expect(game.p1.can("recycleRune", "r1")).toBe(true);
    expect(game.p1.can("tapRune", "r1")).toBe(true);
  });

  // ---------------------------------------------------------------- (a)
  test("(a) in response P1 recycles R1 with its own ability (no chain): R1 → bottom of the rune deck, +1 fury; the Sigil item is untouched and still names nothing", async () => {
    const game = await boardA().build();
    await conquerSigil(game);
    await game.p1.recycleRune("r1");
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.p1.runeDeck().at(-1)).toBe("r1");
    expect(game.p1.power("fury")).toBe(1);
    expect(game.p1.runes()).toEqual(["r2"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", triggered: true })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 keeps priority (rune abilities don't pass it)
  });

  test("(a) at resolution P1's runes are {R2} → R2 MUST be recycled (sole candidate, no decline, no fizzle): both runes end on the bottom of the rune deck, the 1 fury floats, no Power came from the effect-recycle, the point stands", async () => {
    const game = await boardA().build();
    const deck0 = game.p1.runeDeck().length;
    await conquerSigil(game);
    await game.p1.recycleRune("r1");
    await resolveSigilExpecting(game, "r2");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("r2")).toBe("runeDeck");
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.runeDeck()).toHaveLength(deck0 + 2);
    expect(game.p1.runeDeck().slice(-2)).toEqual(["r1", "r2"]); // R1 (response) went under first, then R2 (resolution)
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } }); // only R1's own [Add] produced power
    expect(game.p2.runes()).toEqual(["theirs"]); // never the opponent's rune
    expect(bf1(game).controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) control — with NO response both runes are on offer at resolution (a real 1-of-2 pick, no decline); taking R1 leaves R2 in the pool", async () => {
    const game = await boardA().build();
    await conquerSigil(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["r1", "r2"]);
    await game.p1.pick("r1");
    await game.settle();
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.p1.runes()).toEqual(["r2"]);
    expect(game.p1.power()).toBe(0);
  });

  // ---------------------------------------------------------------- (b)
  test("(b) zero runes, but Retreat in response: it targets the spare BASE unit (355.7) and sits above the Sigil item; it resolves first — Spare to hand, R3 channeled EXHAUSTED — while the Sigil item still waits", async () => {
    const game = await boardB().build();
    await conquerSigil(game);
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.can("cast", "retreat")).toBe(true); // Reaction onto an open chain
    const offered = game.p1.option("cast", "retreat")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered).toEqual(expect.arrayContaining([["spare"], ["raider"]]));
    await game.p1.cast("retreat", { targets: "spare" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["bf1", "retreat"]);
    expect(game.chain()[1]).toMatchObject({ targets: ["spare"], triggered: false, type: "spell" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Retreat resolves (LIFO)
    expect(game.zoneOf("spare")).toBe("hand");
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.p1.runes()).toEqual(["r3"]);
    expect(game.state("r3").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(b) then the Sigil resolves over the runes P1 controls NOW = {R3}: R3 — which did not exist on board when the ability triggered — must be recycled to the bottom of P1's rune deck; pool empty again; point stands", async () => {
    const game = await boardB().build();
    await conquerSigil(game);
    await game.p1.cast("retreat", { targets: "spare" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await resolveSigilExpecting(game, "r3");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("r3")).toBe("runeDeck");
    expect(game.p1.runeDeck().at(-1)).toBe("r3");
    expect(game.p1.runes()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p2.runes()).toEqual(["theirs"]);
    expect(bf1(game).controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("spare")).toBe("hand");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (c)
  test("(c) zero runes and no response: the instruction is impossible and ignored (359.3.e.6/.11) — no prompt, no stall, the trigger leaves the chain, P2's rune untouched, P1 keeps the Sigil and the point", async () => {
    const game = await boardC().build();
    await conquerSigil(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await resolveSigilExpecting(game, null);
    expect(game.chain()).toEqual([]);
    expect(game.p1.runes()).toEqual([]);
    expect(game.p2.runes()).toEqual(["theirs"]);
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
