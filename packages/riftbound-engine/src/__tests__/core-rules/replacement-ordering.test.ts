/**
 * Core rules — Replacement effects on SIMULTANEOUS events: ordering and
 * assignment (rules 370–373), driven through the death choke point.
 *
 * Rules covered
 *   370.1.a.1 / 808.1.d.1  a replaced death never happened — no Deathknell for it
 *   370.1.b / 370.2        the first applied replacement replaces the event; the others find no
 *                          death left and are NOT consumed
 *   371.2 / 371.2.b        optional ("you may pay …") replacement: asked; declining applies nothing
 *   372                    several replacements on ONE event → the affected object's controller
 *                          orders them (harness: a "which applies first" pick, seat = that controller)
 *   373 / 373.2 / 365.1    one self-spending replacement (Zhonya's "kill this instead") matching two
 *                          simultaneous deaths → its controller picks WHICH death it replaces; once
 *                          spent it is off the board and cannot save the second unit
 *   373.1                  replacements of different controllers need no shared prompt
 *   373.1.a                the applied replacement's actions run before the unmodified death
 *   808.2                  only the unit that really died triggers its Deathknell
 *
 * Cards: Zhonya's Hourglass ogn-077-298, Guardian Angel sfd-051-221 (appends "If I would die, kill
 * Guardian Angel instead. Heal me, exhaust me, and recall me" — 373.2), Soraka, Wanderer sfd-173-221,
 * Unlicensed Armory ogn-023-298, Watchful Sentry ogn-096-298 ([Deathknell] — Draw 1), Recruit
 * ogn-271-298, Flurry of Blades ogn-133-298 (1 to all units at battlefields), Falling Star ogn-029-298
 * (Deal 3 to a unit. Deal 3 to a unit.).
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game, Seat } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const ZHONYAS = "ogn-077-298";
const GUARDIAN_ANGEL = "sfd-051-221";
const SORAKA = "sfd-173-221";
const ARMORY = "ogn-023-298";
const SENTRY = "ogn-096-298";
const RECRUIT = "ogn-271-298";
const FLURRY = "ogn-133-298";
const FALLING_STAR = "ogn-029-298";
const FILLER = "ogn-175-298";

function isRpl(d: Decision | null, seat: string): d is Extract<Decision, { kind: "pick" | "order" }> {
  return !!d && d.seat === seat && (d.kind === "pick" || d.kind === "order") && d.timing === "RPL";
}

/** Answer every replacement prompt for `seat`, preferring the first listed key found in the prompt. */
async function answerRpl(game: Game, seat: Seat, prefer: readonly string[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < 8; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || !isRpl(d, seat)) {
      return n;
    }
    n += 1;
    const entries = d.kind === "order" ? d.items : d.options;
    const keys = entries.map((o) => o.key);
    const wanted = prefer.map((p) => entries.find((o) => o.key === p || o.card === p)?.key).find((k) => k !== undefined) ?? (keys[0] as string);
    await game.seat(seat).pick(wanted);
  }
  return n;
}

// ---------------------------------------------------------------------------
// 373 — one Zhonya's, two simultaneous deaths
// ---------------------------------------------------------------------------

function twoSentries() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SENTRY, "sA")
    .unit(P2, "bf1", SENTRY, "sB")
    .gear(P2, ZHONYAS, "zh")
    .hand(P1, FLURRY, "flurry");
}

describe("373 — a self-spending replacement matching two simultaneous deaths: its controller picks which", () => {
  test("the Hourglass's controller (P2, not the turn player) gets a replacement-assign pick naming both dying units", async () => {
    const game = await twoSentries().build();
    await game.p1.cast("flurry");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "replacement-assign", timing: "RPL" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["sA", "sB"]);
    // Nothing has died while the question is open (373.1.a — replacements run first).
    expect(game.zoneOf("sA")).toBe("battlefield-bf1");
    expect(game.zoneOf("sB")).toBe("battlefield-bf1");
  });

  for (const keep of ["sA", "sB"] as const) {
    const other = keep === "sA" ? "sB" : "sA";
    test(`picking ${keep}: it is healed, exhausted and recalled; the Hourglass is killed instead; ${other} dies (365.1)`, async () => {
      const game = await twoSentries().build();
      await game.p1.cast("flurry");
      expect(await answerRpl(game, P2, [keep])).toBe(1);
      expect(game.state(keep)).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
      expect(game.zoneOf(other)).toBe("trash");
      expect(game.zoneOf("zh")).toBe("trash");
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    });
  }

  test("808.2 / 808.1.d.1 — only the unsaved Sentry's Deathknell draws: P2 hand +1 exactly", async () => {
    const game = await twoSentries().build();
    const hand0 = game.p2.hand().length;
    await game.p1.cast("flurry");
    await answerRpl(game, P2, ["sA"]);
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toHaveLength(hand0 + 1);
  });

  test("a single death with a single mandatory replacement never prompts", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", SENTRY, "sA")
      .gear(P2, ZHONYAS, "zh")
      .hand(P1, FLURRY, "flurry")
      .build();
    await game.p1.cast("flurry");
    expect((await game.settle()).reason).toBe("open");
    expect(game.state("sA")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("zh")).toBe("trash");
  });
});

// ---------------------------------------------------------------------------
// 372 — Guardian Angel vs Zhonya's on ONE dying unit
// ---------------------------------------------------------------------------

function gaAndZhonyas() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", RECRUIT, "recruit", { equippedWith: ["ga"] })
    .gear(P2, GUARDIAN_ANGEL, "ga", { attachedTo: "recruit" })
    .gear(P2, ZHONYAS, "zh")
    .hand(P1, FALLING_STAR, "fs");
}

describe("372 — two replacements on one death: the dying unit's controller says which applies first", () => {
  test("P2 is asked (RPL pick over the two SOURCES: Guardian Angel and Zhonya's)", async () => {
    const game = await gaAndZhonyas().build();
    expect(game.state("recruit").might).toBe(2);
    await game.p1.cast("fs", { targets: ["recruit", "recruit"] });
    expect((await game.settle()).reason).toBe("unanswered");
    const d = game.decision();
    expect(isRpl(d, P2)).toBe(true);
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["ga", "zh"]);
  });

  test("Guardian Angel first: GA killed instead, the Recruit healed/exhausted/recalled at 1 Might; Zhonya's untouched (370.2)", async () => {
    const game = await gaAndZhonyas().build();
    await game.p1.cast("fs", { targets: ["recruit", "recruit"] });
    await answerRpl(game, P2, ["ga"]);
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.state("recruit")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 1, zone: "base" });
    expect(game.zoneOf("zh")).toBe("base");
  });

  test("Zhonya's first: Hourglass killed instead, the Recruit recalled still wearing GA (2 Might); GA untouched (370.1.b)", async () => {
    const game = await gaAndZhonyas().build();
    await game.p1.cast("fs", { targets: ["recruit", "recruit"] });
    await answerRpl(game, P2, ["zh"]);
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("recruit")).toMatchObject({ attachments: ["ga"], damage: 0, isExhausted: true, might: 2, zone: "base" });
    expect(game.zoneOf("ga")).toBe("base");
  });

  test("seat.order([...]) is accepted for the same prompt", async () => {
    const game = await gaAndZhonyas().build();
    await game.p1.cast("fs", { targets: ["recruit", "recruit"] });
    await game.settle();
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    const zhKey = d.options.find((o) => o.card === "zh")?.key as string;
    await game.p2.order([zhKey, ...d.options.map((o) => o.key).filter((k) => k !== zhKey)]);
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("base");
  });
});

// ---------------------------------------------------------------------------
// 372 — three shields, one unit: every order
// ---------------------------------------------------------------------------

function threeShields() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SORAKA, "soraka")
    .unit(P2, "bf1", RECRUIT, "recruit", { equippedWith: ["ga"] })
    .gear(P2, GUARDIAN_ANGEL, "ga", { attachedTo: "recruit" })
    .gear(P2, ZHONYAS, "zh")
    .hand(P1, FALLING_STAR, "fs");
}

describe("372 / 370.2 — Soraka × Guardian Angel × Zhonya's on one dying Recruit: exactly the chosen one applies", () => {
  const expectations: Record<string, () => Record<string, unknown>> = {
    ga: () => ({ gaZone: "trash", might: 1, zhZone: "base" }),
    soraka: () => ({ gaZone: "battlefield-bf1|base", might: 2, zhZone: "base" }),
    zh: () => ({ gaZone: "battlefield-bf1|base", might: 2, zhZone: "trash" }),
  };
  for (const first of ["soraka", "ga", "zh"] as const) {
    test(`${first} applied first`, async () => {
      const game = await threeShields().build();
      await game.p1.cast("fs", { targets: ["recruit", "recruit"] });
      expect((await game.settle()).reason).toBe("unanswered");
      const d = game.decision();
      expect(isRpl(d, P2)).toBe(true);
      expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["ga", "soraka", "zh"]);
      await answerRpl(game, P2, [first]);
      const want = expectations[first]!();
      expect(game.zoneOf("recruit")).toBe("base");
      expect(game.state("recruit")).toMatchObject({ damage: 0, isExhausted: true, might: want.might as number });
      expect(String(want.gaZone).split("|")).toContain(game.zoneOf("ga"));
      expect(game.zoneOf("zh")).toBe(want.zhZone as string);
      expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
      // never more than one shield spent on one event
      expect(["ga", "zh"].filter((g) => game.zoneOf(g) === "trash").length).toBeLessThanOrEqual(1);
    });
  }
});

// ---------------------------------------------------------------------------
// 371.2 — optional shield declined; 373.1 — different controllers
// ---------------------------------------------------------------------------

describe("371.2.b — declining an optional replacement applies nothing and pays nothing", () => {
  test("Unlicensed Armory shield declined: the unit dies, the [fury] stays; a second death in the batch is still saved by Zhonya's", async () => {
    const bolt = {
      abilities: [{ effect: { amount: 3, target: { location: "battlefield", quantity: "all", type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "fury",
      energyCost: 0,
      name: "Test Storm",
      timing: "action",
    };
    const game = await scenario()
      .resources(P1, { energy: 0, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .gear(P1, ARMORY, "armory")
      .gear(P1, ZHONYAS, "zh")
      .unit(P1, "bf1", { might: 2, name: "X" }, "x")
      .unit(P1, "bf1", { might: 2, name: "Y" }, "y")
      .hand(P1, FILLER, "junk")
      .hand(P1, bolt, "storm")
      .build();
    await game.p1.activate("armory", 0, { discard: "junk", targets: ["x"] });
    await game.settle();
    await game.p1.cast("storm");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    // Zhonya's now matches both deaths → which one (373)?
    expect(await answerRpl(game, P1, ["y"])).toBe(1);
    expect(game.p1.power("fury")).toBe(1);
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.state("y")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("zh")).toBe("trash");
  });
});

describe("373.1 — replacements of different controllers on different deaths need no prompt", () => {
  test("each player's own Zhonya's saves that player's own dying unit; nobody is asked anything", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "bf1", SENTRY, "mine")
      .unit(P2, "bf1", SENTRY, "theirs")
      .gear(P1, ZHONYAS, "zh1")
      .gear(P2, ZHONYAS, "zh2")
      .hand(P1, FLURRY, "flurry")
      .build();
    await game.p1.cast("flurry");
    expect((await game.settle()).reason).toBe("open");
    expect(game.state("mine")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.state("theirs")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("zh1")).toBe("trash");
    expect(game.zoneOf("zh2")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
