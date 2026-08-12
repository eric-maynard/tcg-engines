/**
 * Interaction: The Harrowing (ogn-198-298) · Spell · Chaos · [6][chaos][chaos] · [Action]
 *     "Play a unit from your trash, ignoring its Energy cost. (You must still pay its Power cost.)"
 *   × Sivir, Ambitious (sfd-120-221) · Champion Unit · Body · [6][body][body][body] · 7 Might · [Deflect 2]
 *   × Sivir, Mercenary (sfd-143-221) · Unit · Chaos · [4][chaos] · [Accelerate] [1][chaos] — the "additional cost
 *     rides on top of the waived base cost" control.
 *
 * Rules: 356.1.b.2 ("ignoring its Energy cost" zeroes ONLY the Energy half — the printed Power cost still applies),
 * 357.1 + 163.2 (the combined Energy + Power cost is what must be paid, Power pays Domain-associated pips),
 * 204.2.a (Additional Costs are paid in addition to the base cost), 359.3.e.6 (an instruction that cannot be
 * followed is ignored), 128.6 / 128.6.a (a compelled type-specifying action may be DECLINED only for cards whose
 * privacy is Secret or Private), 108.2.d + 355.10.a / 355.10.a.1 (a player's trash is PUBLIC information).
 *
 * Question — P1 casts The Harrowing with Sivir, Ambitious ([6][body][body][body]) in the trash.
 *   NO side: with ZERO body Power, is Sivir still LISTED as the spell's object (with the pips she owes stated)
 *            rather than silently dropped, does The Harrowing finish without stalling the chain, and does Sivir
 *            stay in the trash?
 *   YES side: with three body Power, is she charged exactly [body]x3 and 0 Energy?
 *   Accelerate: is an optional additional cost quoted ON TOP of the waived base cost rather than folded into it?
 *
 * Answer:
 *  1. "Ignoring its Energy cost" waives only the Energy half; the [body][body][body] is still owed in full
 *     (356.1.b.2 / 357.1 / 163.2).
 *  2. There is NO decline here, and that is correct: 128.6 / 128.6.a scope the right-to-ignore to cards whose
 *     privacy is Secret or Private, and a trash is PUBLIC (108.2.d, 355.10.a.1). So "play a unit from your trash"
 *     genuinely targets (355.10.a) and genuinely compels — the object is named as the spell is cast, min 1, no
 *     decline button is owed. (The declinable shape is "play a unit from your HAND".)
 *  3. NO side: the play is unpayable, so the instruction is simply ignored (359.3.e.6) — Sivir stays in the trash,
 *     The Harrowing goes to the trash, the chain empties and priority returns to P1's open Main Phase. What the
 *     engine does NOT yet do is SAY which pips are owed: the `targets` field lists Sivir with no `unaffordable` /
 *     `needsAdd` annotation, so a client cannot dim the tile or print the pay line (see the failing facet).
 *  4. YES side: Sivir enters having paid [body]x3 and 0 Energy.
 *  5. Accelerate is an Additional Cost (204.2.a): it is charged in addition to whatever the base cost became, so
 *     the waiver never pays for it.
 */
import { describe, expect, test } from "bun:test";
import type { ActionField, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARROWING = "ogn-198-298";
const SIVIR_AMBITIOUS = "sfd-120-221"; // [6][body][body][body], 7 Might
const SIVIR_MERCENARY = "sfd-143-221"; // [4][chaos], [Accelerate] [1][chaos]

/** The `targets` field of P1's cast option — what the client would render as the object list. */
function targetsField(game: Game, alias: string): ActionField | undefined {
  return game.p1.option("cast", alias)?.fields.find((f) => f.name === "targets");
}

function targetsOffered(game: Game, alias: string): string[] {
  const field = targetsField(game, alias);
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's turn, exactly The Harrowing's own cost in the pool ([6] + [chaos][chaos]) plus `body` body Power.
 * Sivir, Ambitious waits in P1's trash; P2 has a bystander so the board is not empty.
 */
function board(body: number) {
  return scenario()
    .resources(P1, { energy: 6, power: { body, chaos: 2 } })
    .trash(P1, SIVIR_AMBITIOUS, "sivir")
    .hand(P1, HARROWING, "har")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander");
}

describe("The Harrowing's free play still owes the Power cost — Sivir, Ambitious [6][body][body][body]", () => {
  // ── premise ───────────────────────────────────────────────────────────────────────────────────────

  test("premise: Sivir's printed cost is [6] + [body][body][body] and The Harrowing's own is [6] + [chaos][chaos]; the pool holds exactly the spell's cost and nothing else", async () => {
    const game = await board(0).build();
    expect(game.state("sivir")).toMatchObject({ energyCost: 6, powerCost: ["body", "body", "body"], zone: "trash" });
    expect(game.state("har")).toMatchObject({ energyCost: 6, powerCost: ["chaos", "chaos"] });
    expect(game.p1.resources()).toEqual({ energy: 6, power: { body: 0, chaos: 2 } });
  });

  // ── the object is chosen as the spell is cast, and it is COMPELLED (the trash is public) ──────────

  test("'a unit from your trash' TARGETS (355.10.a — the trash is public): Sivir is the cast-time object, min 1 / max 1, and no decline is owed (128.6 scopes the right-to-ignore to Secret/Private zones only)", async () => {
    const game = await board(3).build();
    const field = targetsField(game, "har");
    expect(field).toMatchObject({ kind: "cards", max: 1, min: 1, name: "targets", required: true });
    expect(targetsOffered(game, "har")).toEqual(["sivir"]);
  });

  // ── NO side: zero body Power ─────────────────────────────────────────────────────────────────────

  test("NO side — with zero body Power the spell is still castable and Sivir is still LISTED (not silently dropped from the object list)", async () => {
    const game = await board(0).build();
    expect(game.p1.can("cast", "har")).toBe(true);
    expect(targetsOffered(game, "har")).toContain("sivir");
  });

  // BUG: expected — the shared "you may name this, but you cannot pay for it yet" vocabulary
  // (`ActionField.unaffordable[]` / `.needsAdd`, rules 357.1.a / 429.3) must mark the Sivir entry as unpayable and
  // name the [body][body][body] still owed, so a client dims the tile and prints the pay line.
  // Actual — the field carries neither `unaffordable` nor `needsAdd`: the entry looks exactly like a payable one,
  // and the player only discovers the truth when the spell resolves and quietly does nothing.
  test("the unpayable Sivir entry must be flagged with the pips it owes — `unaffordable` + `needsAdd {power:{body:3}}` on the targets field (357.1.a / 429.3 / 356.1.b.2)", async () => {
    const game = await board(0).build();
    const field = targetsField(game, "har");
    const idx = (field?.options ?? []).findIndex((v) => (Array.isArray(v) ? v[0] : v) === "sivir");
    expect(field?.unaffordable?.[idx]).toBe(true);
    expect(field?.needsAdd).toMatchObject({ power: { body: 3 } });
    expect(field?.needsAdd?.reason ?? "").toContain("body");
  });

  test("NO side — the unpayable play is simply ignored (359.3.e.6): Sivir stays in the trash, The Harrowing goes to the trash, the chain empties and P1 is back in an open Main Phase (no stall)", async () => {
    const game = await board(0).build();
    await game.p1.cast("har", { targets: "sivir" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, chaos: 0 } }); // only the spell was paid
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("sivir")).toBe("trash");
    expect(game.p1.trash()).toContain("sivir");
    expect(game.zoneOf("har")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("NO side — one pip short is still short: with [body][body] in the pool nothing is spent on Sivir and she stays in the trash (357.1 — the COMBINED cost must be paid)", async () => {
    const game = await board(2).build();
    await game.p1.cast("har", { targets: "sivir" });
    await game.settle();
    expect(game.zoneOf("sivir")).toBe("trash");
    expect(game.p1.power("body")).toBe(2); // untouched — a partial payment is never taken
    expect(game.violations()).toEqual([]);
  });

  // ── YES side: three body Power ───────────────────────────────────────────────────────────────────

  test("YES side — with [body]x3 Sivir enters P1's base having paid exactly 3 body and 0 Energy (356.1.b.2: only the Energy half was waived)", async () => {
    const game = await board(3).build();
    await game.p1.cast("har", { targets: "sivir" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 3, chaos: 0 } }); // the body is still in the pool
    await game.settle();
    expect(game.zoneOf("sivir")).toBe("base");
    expect(game.p1.units("base")).toContain("sivir");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, chaos: 0 } }); // …and now it is spent
    expect(game.state("sivir").might).toBe(7);
    expect(game.zoneOf("har")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("YES side — spare Energy is NOT touched by the free play: [6]+[body]x3 in the pool with 4 spare Energy leaves all 4 behind (only the spell's own [6] was spent)", async () => {
    const game = await board(3).resources(P1, { energy: 10 }).build();
    await game.p1.cast("har", { targets: "sivir" });
    await game.settle();
    expect(game.zoneOf("sivir")).toBe("base");
    expect(game.p1.energy()).toBe(4); // 10 − 6 (The Harrowing); Sivir's own [6] was ignored
    expect(game.p1.power("body")).toBe(0);
  });

  // ── Accelerate rides ON TOP of the waived base cost (204.2.a) ─────────────────────────────────────

  test("Accelerate is an ADDITIONAL cost (204.2.a), quoted on top of the ignored base cost: Sivir, Mercenary's [4] is waived, her [chaos] is paid, and the [1][chaos] Accelerate is offered as its own payable yes/no", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { chaos: 4 } }) // 6 spell + 1 Accelerate energy; 2 spell + 1 Sivir + 1 Accelerate chaos
      .trash(P1, SIVIR_MERCENARY, "merc")
      .hand(P1, HARROWING, "har")
      .build();
    await game.p1.cast("har", { targets: "merc" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 2 } });
    await game.settle();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(game.decision()?.prompt ?? "").toMatch(/\[1\]\[chaos\]/); // the surcharge is quoted, not folded in
    await game.p1.yes();
    await game.settle();
    expect(game.state("merc")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // [1][chaos] Accelerate + [chaos] base
    expect(game.violations()).toEqual([]);
  });

  test("declining Accelerate charges only the base Power: Sivir, Mercenary enters exhausted and the Accelerate [1][chaos] stays in the pool", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { chaos: 4 } })
      .trash(P1, SIVIR_MERCENARY, "merc")
      .hand(P1, HARROWING, "har")
      .build();
    await game.p1.cast("har", { targets: "merc" });
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.state("merc")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 1 } });
  });
});
