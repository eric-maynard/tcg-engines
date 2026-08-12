/**
 * Interaction: Mageseeker Warden (ogn-070-298) — "While I'm at a battlefield, opponents can only
 *     play units to their base."
 *   × Here to Help (sfd-111-221) — [Hidden] [Action] [2][body], "You may play a unit from hand to a
 *     battlefield you control, reducing its cost by [3]."
 *   × Deadbloom Predator (ogn-161-298) — "You may play me to an occupied enemy battlefield."
 *
 * P2 has the Warden at bfB. Questions:
 *   (a) is Here to Help legal to play at all, and what happens on resolution?
 *   (b) must the client leave it un-greyed (no cost/targeting failure reported)?
 *   (c) may Deadbloom Predator be played to bfB — its printed exception vs the Warden?
 *   (d) played FROM HIDDEN at bfA, where must the fetched unit go?
 *
 * Rules covered (riftbound-rules ids):
 *   358.3        the play-legality check is about the resulting STATE, not about whether the
 *                instruction will be able to do anything
 *   358.3.a      the rulebook's own worked example, naming these two cards: "Here to Help is legal
 *                to play under these circumstances. On resolution, no unit will be played."
 *   358.4        timing permissions are the separate check ([Action], own Main Phase)
 *   358.5        only a FAILED check undoes the play — a skipped instruction is not a failed check
 *   811.1.d.2    a hidden card's chosen targets come from its battlefield
 *   811.1.d.3    a hidden card that causes you to PLAY a unit plays it at that battlefield
 *   421.3        a facedown card's permissions come from the effect that put it there ([0] to play)
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HERE_TO_HELP = "sfd-111-221";
const MAGESEEKER_WARDEN = "ogn-070-298";
const DEADBLOOM_PREDATOR = "ogn-161-298";

/** A 4-cost vanilla so the "reducing its cost by [3]" is measurable. */
const RECRUIT = { cardType: "unit", domain: "body", energyCost: 4, might: 4, name: "Recruit" };

/**
 * P1's Main Phase. bfA is P1's (with an anchor unit), bfB is P2's and occupied.
 * `wardenAt` — "bfB" puts the Warden at a battlefield (static live), "base" parks it in P2's base
 * (the static's own `while I'm at a battlefield` condition is off), null leaves it out entirely.
 * `helpIn` — "hand" casts Here to Help normally, "facedown" hides it at bfA first.
 */
function board(wardenAt: "bfB" | "base" | null, helpIn: "hand" | "facedown" = "hand") {
  const s = scenario()
    .turn(4)
    .active(P1)
    .resources(P1, { energy: 20, power: { body: 6, calm: 6 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: P1 })
    .unit(P1, "bfA", { might: 2, name: "Anchor A" }, "anchorA")
    .unit(P1, "bfC", { might: 2, name: "Anchor C" }, "anchorC")
    .unit(P2, "bfB", { might: 3, name: "Guard" }, "guard")
    .hand(P1, DEADBLOOM_PREDATOR, "pred")
    .hand(P1, RECRUIT, "recruit");
  if (helpIn === "hand") {
    s.hand(P1, HERE_TO_HELP, "help");
  } else {
    s.facedown(P1, "bfA", HERE_TO_HELP, "help");
  }
  if (wardenAt) {
    s.unit(P2, wardenAt, MAGESEEKER_WARDEN, "warden");
  }
  return s;
}

const destinationsFor = (game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>, card: string) =>
  (game.p1.option("play", card)?.fields.find((f) => f.arg === "to")?.options ?? []) as string[];

describe("Mageseeker Warden × Here to Help / Deadbloom Predator", () => {
  test("(a) Here to Help is LEGAL to play under the Warden — 358.3.a's own worked example", async () => {
    const game = await board("bfB").build();
    expect(game.p1.can("cast", "help")).toBe(true);
    expect(game.p1.option("cast", "help")).toBeDefined();

    const before = game.p1.resources();
    await game.p1.cast("help");
    // The play went through: it is on the chain, and its cost was actually charged.
    expect(game.chain().map((i) => i.cardId)).toEqual([game.card("help")]);
    expect(game.p1.energy()).toBe((before.energy ?? 0) - 2);
    expect(game.p1.power("body")).toBe((before.power.body ?? 0) - 1);
  });

  test("(a) on resolution NO unit is played, the spell still goes to the trash, and the costs stay spent (358.3.a / 358.5)", async () => {
    const game = await board("bfB").build();
    const before = game.p1.resources();
    await game.p1.cast("help");
    await game.settle();

    expect(game.zoneOf("help")).toBe("trash");
    expect(game.zoneOf("recruit")).toBe("hand"); // the impossible instruction was skipped
    // 358.5 undoes only a FAILED check; a skipped instruction refunds nothing.
    expect(game.p1.energy()).toBe((before.energy ?? 0) - 2);
    expect(game.p1.power("body")).toBe((before.power.body ?? 0) - 1);
    expect(game.violations()).toEqual([]);
  });

  test("(b) the play is not reported as unaffordable or untargetable — nothing marks Here to Help as blocked (358.3 vs 358.4)", async () => {
    const game = await board("bfB").build();
    const opt = game.p1.option("cast", "help");
    expect(opt).toBeDefined();
    // No cost pay-line, no unaffordable flag, no empty target field: the Warden is not a play gate.
    expect(opt?.fields.some((f) => f.needsAdd !== undefined)).toBe(false);
    expect(opt?.fields.some((f) => (f.unaffordable ?? []).some(Boolean))).toBe(false);
    expect(opt?.fields.some((f) => f.required && (f.options ?? []).length === 0)).toBe(false);
    // And it really is the same option the Warden-free board offers.
    const clear = await board(null).build();
    expect(clear.p1.can("cast", "help")).toBe(true);
  });

  test("(b) with the Warden gone the same spell DOES play a unit — at a battlefield P1 controls, for [3] less (so the skip was the Warden's doing)", async () => {
    const game = await board(null).build();
    await game.p1.cast("help");
    await game.settle();

    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    const energyBefore = game.p1.energy();
    await game.p1.pick("recruit");

    // "to a battlefield you control" — bfA and bfC, never P2's bfB, never base.
    expect(game.decision()).toMatchObject({ kind: "pick", semantics: "destination" });
    const dests = (game.decision() as { options: { key: string }[] }).options.map((o) => o.key);
    expect(dests.sort()).toEqual(["battlefield-bfA", "battlefield-bfC"]);

    await game.p1.pick("battlefield-bfC");
    await game.settle();
    expect(game.locationOf("recruit")).toBe("bfC");
    expect(game.p1.energy()).toBe(energyBefore - 1); // 4 printed − 3 reduction
  });

  test("(c) Deadbloom Predator may NOT be played to bfB while the Warden stands — its printed exception loses to the Warden's restriction", async () => {
    const game = await board("bfB").build();

    // Only P1's own base is left; the printed "occupied enemy battlefield" permission does not
    // survive "opponents can only play units to their base".
    expect(destinationsFor(game, "pred")).toEqual(["base"]);
    const attempt = await game.p1.try((p) => p.play("pred", { to: "bfB" }));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("pred")).toBe("hand");

    // Base is still available — the Warden narrows the destinations, it does not forbid the play.
    await game.p1.play("pred");
    expect(game.locationOf("pred")).toBe("base");
  });

  test("(c) move the Warden off the battlefield and the bfB play reappears (the static is 'while I'm at a battlefield')", async () => {
    const parked = await board("base").build();
    expect(destinationsFor(parked, "pred")).toContain("battlefield-bfB");

    const absent = await board(null).build();
    expect(destinationsFor(absent, "pred")).toContain("battlefield-bfB");

    // …and the play to the occupied enemy battlefield actually goes through.
    await absent.p1.play("pred", { to: "bfB" });
    expect(absent.locationOf("pred")).toBe("bfB");
  });

  test("the refusal names its cause — the client can tell the player the Mageseeker Warden is why bfB is unavailable (358.3.a)", async () => {
    const game = await board("bfB").build();
    const attempt = await game.p1.try((p) => p.play("pred", { to: "bfB" }));
    expect(attempt.ok).toBe(false);
    // The reason names the Warden (never the occupied-battlefield rule, which Predator is printed
    // to beat): the play's own condition produces it, and the harness carries it onto the error.
    expect((attempt as { error: { message: string } }).error.message).toContain("Mageseeker Warden");
  });

  test("(d) played FROM HIDDEN at bfA, the fetched unit must be played AT bfA — no other destination is offered (811.1.d.3)", async () => {
    const game = await board(null, "facedown").build();
    const before = game.p1.resources();

    await game.p1.reveal("help");
    // 421.3 / 811.1.b — the facedown play costs [0]: nothing was charged for the spell itself.
    expect(game.p1.resources()).toEqual(before);

    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", semantics: "from-revealed" });
    await game.p1.pick("recruit");
    await game.settle();

    // bfC is a battlefield P1 controls too, yet 811.1.d.3 pins the play to bfA — so the
    // destination was never a choice and the unit landed at bfA.
    expect(game.locationOf("recruit")).toBe("bfA");
    expect(game.p1.energy()).toBe((before.energy ?? 0) - 1); // 4 printed − 3 reduction
    expect(game.violations()).toEqual([]);
  });

  test("(d) from Hidden at bfA WITH the Warden at bfB: bfA is the only place the unit could go and the Warden forbids it, so the instruction is skipped", async () => {
    const game = await board("bfB", "facedown").build();
    await game.p1.reveal("help");
    await game.settle();

    expect(game.zoneOf("help")).toBe("trash");
    expect(game.zoneOf("recruit")).toBe("hand");
    expect(game.locationOf("recruit")).toBeUndefined();
    // No blocked prompt was left behind for anybody to answer.
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1, context: "main" });
    expect(game.violations()).toEqual([]);
  });
});
