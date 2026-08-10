/**
 * Ruling 7f61a81767c7ce73 — Guardian Angel (SFD-051 → sfd-051-221) · Equipment +1 · "If I would die, kill Guardian Angel instead.
 *   Heal me, exhaust me, and recall me."   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · "If a friendly unit would die,
 *   kill this instead. Heal that unit, exhaust it, and recall it."   × Smite (UNL-007 → unl-007-219) · Action · 2 + [fury] · "Deal 3
 *   to a unit at a battlefield. If it would die this turn, banish it instead."
 *
 * Q: A unit protected by Guardian Angel / Zhonya's is killed by Smite (banish instead of die). Banished or saved?
 * A: The unit's OWNER orders the competing replacement effects on the one "would die" event (rule 372). Choosing the gear's
 *    replacement first replaces the death entirely (gear killed; unit healed, exhausted, recalled) — the banish replacement then
 *    has no event left and does not apply. Turn order is irrelevant; only the owner decides.
 * Rules: 366–373 (replacement effects; 372 the affected object's owner/controller orders them; a fully replaced event is gone).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUARDIAN_ANGEL = "sfd-051-221";
const ZHONYAS = "ogn-077-298";
const SMITE = "unl-007-219";

/** P2's turn 3 (so it is NOT the owner's turn). P1's 2-Might Ward at P1's bf1, protected per `opts`; P2 holds Smite with 2 + [fury]. */
function board(opts: { ga?: boolean; zhonyas?: boolean }) {
  let s = scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 });
  s = opts.ga
    ? s
        .unit(P1, "bf1", { might: 2, name: "Ward" }, "ward", { equippedWith: ["ga"] } as Record<string, unknown>)
        .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "ward" } as Record<string, unknown>, owner: P1, zone: "bf1" })
    : s.unit(P1, "bf1", { might: 2, name: "Ward" }, "ward");
  if (opts.zhonyas) {
    s = s.gear(P1, ZHONYAS, "zhonyas");
  }
  return s.unit(P1, "bf1", { might: 1, name: "Keeper" }, "keeper").hand(P2, SMITE, "smite");
}

/** P2 Smites the Ward (3 damage = lethal) and everyone passes until something other than priority is asked. */
async function smiteWard(game: Game): Promise<void> {
  await game.p2.cast("smite", { targets: "ward" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  const s = await game.settle();
  expect(s.reason).toBe("unanswered");
}

const orderPrompt = (game: Game) => game.decision() as Extract<Decision, { kind: "pick" }>;

describe("Ruling 7f61a81767c7ce73 — Smite vs Guardian Angel / Zhonya's: the unit's owner orders the replacements", () => {
  test("Guardian Angel: when the Smited Ward would die, its OWNER P1 (not the turn player P2) is asked to order the two replacements — GA's and Smite's banish", async () => {
    const game = await board({ ga: true }).build();
    expect(game.state("ward").might).toBe(3); // 2 + GA
    await smiteWard(game);
    const d = orderPrompt(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "replacement-order" });
    const offered = d.options.map((o) => o.card ?? o.key).toSorted();
    expect(offered).toContain("ga");
    expect(offered).toHaveLength(2); // GA + Smite's "banish it instead"
    expect(game.zoneOf("ward")).toBe("battlefield-bf1"); // undecided, still there
  });

  test("… P1 applies Guardian Angel first: GA is killed instead, the Ward is healed, exhausted and recalled to base — NOT banished; Smite's replacement never applies", async () => {
    const game = await board({ ga: true }).build();
    await smiteWard(game);
    await game.p1.pick("ga");
    await game.settle();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("ward")).toBe("base");
    expect(game.p1.banishment()).not.toContain("ward");
    expect(game.state("ward")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 2 });
    expect(game.zoneOf("smite")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("… had P1 ordered Smite's banish first instead, the Ward is banished (the death it replaces is gone, so GA is not killed)", async () => {
    const game = await board({ ga: true }).build();
    await smiteWard(game);
    const d = orderPrompt(game);
    const smiteOpt = d.options.find((o) => (o.card ?? o.key) !== "ga");
    await game.p1.pick(smiteOpt?.key as string);
    await game.settle();
    expect(game.zoneOf("ward")).toBe("banishment");
    expect(game.p1.banishment()).toContain("ward");
    expect(game.zoneOf("ga")).not.toBe("trash"); // not "killed instead" — nothing died
  });

  test("Zhonya's Hourglass: same shape — owner P1 orders; applying Zhonya's first kills the Hourglass instead and the Ward is saved to base, not banished", async () => {
    const game = await board({ zhonyas: true }).build();
    await smiteWard(game);
    const d = orderPrompt(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "replacement-order" });
    expect(d.options.map((o) => o.card ?? o.key)).toContain("zhonyas");
    await game.p1.pick("zhonyas");
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("ward")).toBe("base");
    expect(game.p1.banishment()).not.toContain("ward");
    expect(game.state("ward")).toMatchObject({ damage: 0, isExhausted: true, might: 2 });
    expect(game.violations()).toEqual([]);
  });
});
