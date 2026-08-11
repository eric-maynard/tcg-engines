/**
 * Interaction: Star Spring (unl-215-219) · Battlefield ·
 *   "The first time a player plays a non-token unit here each turn, they may move another unit
 *    they control here to its base."
 *   × Noxian Drummer (ogn-222-298) · 3 Might · "When I move to a battlefield, play a 1 [Might]
 *     Recruit unit token here."  (the token the option set is really about)
 *   × Minotaur Reckoner (sfd-014-221) · 5 Might · "Units can't move to base."
 *
 * QUESTION: what EXACTLY is on the menu when the trigger fires? Is the just-played unit in it?
 * Is the Recruit TOKEN in it — i.e. does "non-token" qualify the mover as well as the play? Are
 * units elsewhere, or enemy units standing here, offered? Is there a decline branch? Then three
 * mutations: (i) Minotaur Reckoner forbids moving to base; (ii) the played unit is the only unit
 * its controller has here; (iii) P2 Ambushes a unit in during a showdown here.
 *
 * Rules:
 *  - 383.3.a / .a.1 — a leading "they may" is decided at FINALIZATION and is solely whether to
 *                     perform the ability; .a.2 — declining removes it, considered not triggered.
 *  - 383.3.e.1     — "the first time … each turn": once performed, later fulfilments don't trigger.
 *  - 355.7 / 355.8 — choosing a specific game object TARGETS it, and valid choices must exist for
 *                    every target for the ability to go on the chain.
 *  - 355.5.b       — choices for a permanent's triggered ability are made when that ability is
 *                    finalized, so a token created by a simultaneously-triggering ability is not
 *                    yet in the option set.
 *  - 358.3.a / 054.1 / 359.3.e.6 — an effect that FORBIDS a game action does not prune the legal
 *                    choice; the pick stays legal and the instruction is ignored on resolution.
 *  - 822.1         — Ambush: playable to a battlefield where you control units, with [Reaction].
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STAR_SPRING = "unl-215-219";
const NOXIAN_DRUMMER = "ogn-222-298";
const MINOTAUR_RECKONER = "sfd-014-221";

const FRESH = { cardType: "unit", energyCost: 2, might: 3, name: "Fresh Recruit" } as const;
const SECOND = { cardType: "unit", energyCost: 2, might: 3, name: "Second Wave" } as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1 owns Star Spring. Noxian Drummer starts in base so the test walks him in and the Recruit
 * token is created by the real card. P1 also has a unit at another battlefield and one in base,
 * and P2 has a unit standing at Star Spring — all of them must stay OFF the menu.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { order: 3, fury: 3 } })
    .resources(P2, { energy: 8, power: { order: 3, fury: 3 } })
    .battlefield("spring", { controller: P1, def: STAR_SPRING, inert: false })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfB", { might: 2, name: "Outpost" }, "outpost")
    .unit(P1, "base", NOXIAN_DRUMMER, "drummer")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "homebody")
    .unit(P2, "spring", { might: 2, name: "Intruder" }, "intruder")
    .hand(P1, FRESH, "fresh")
    .hand(P1, SECOND, "second");
}

/** Walk the Drummer in; his own move trigger plays the 1-Might Recruit token here. */
async function arrive(game: Game): Promise<string> {
  await game.p1.move("drummer", "spring");
  await game.settle();
  const token = game.p1.units("spring").find((id) => game.state(id).isToken);
  expect(token).toBeDefined();
  return token as string;
}

function pickOptions(game: Game): string[] {
  const d = game.decision() as { kind: string; options?: readonly { key: string }[] };
  expect(d.kind).toBe("pick");
  return (d.options ?? []).map((o) => o.key);
}

describe("Star Spring — 'another unit they control here' and the token question", () => {
  test("the trigger opens with the 383.3.a decline branch: a FIN opt-in for the player who made the play", async () => {
    const game = await board().build();
    await arrive(game);
    await game.p1.play("fresh", { to: "spring" });
    const d = game.decision();
    expect(d?.kind).toBe("yes-no");
    expect(d?.seat).toBe(P1);
    expect(d?.timing).toBe("FIN");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: game.card("spring"), controller: P1, triggered: true }),
    ]);
  });

  test("the option set is EXACTLY {Noxian Drummer, the Recruit token} — the just-played unit, units elsewhere and the enemy here are all absent", async () => {
    const game = await board().build();
    const token = await arrive(game);
    await game.p1.play("fresh", { to: "spring" });
    await game.p1.yes();

    const offered = pickOptions(game);
    expect(offered.sort()).toEqual([game.card("drummer"), token].sort());
    expect(offered).not.toContain(game.card("fresh")); // "another" excludes the unit just played
    expect(offered).not.toContain(game.card("outpost")); // "here" — not the other battlefield
    expect(offered).not.toContain(game.card("homebody")); // "here" — not base
    expect(offered).not.toContain(game.card("intruder")); // "a unit they control" — not the enemy
  });

  test("the Recruit TOKEN is eligible: 'non-token' qualifies the unit whose PLAY triggers, not the unit that moves", async () => {
    const game = await board().build();
    const token = await arrive(game);
    expect(game.state(token).isToken).toBe(true);
    expect(game.state(token).might).toBe(1);
    await game.p1.play("fresh", { to: "spring" });
    await game.p1.yes();
    expect(pickOptions(game)).toContain(token);

    // …and it really can be the one sent home.
    await game.p1.pick(token);
    await game.settle();
    expect(game.locationOf(token)).toBe("base");
    expect(game.locationOf("drummer")).toBe("spring");
  });

  test("the destination is dictated ('to its base') — no destination menu is surfaced, the pick is a forced single choice", async () => {
    const game = await board().build();
    await arrive(game);
    await game.p1.play("fresh", { to: "spring" });
    await game.p1.yes();
    const d = game.decision() as { kind: string; min: number; max: number; allowDecline: boolean };
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1 });

    await game.p1.pick("drummer");
    // The very next thing is priority on the finalized trigger — nobody is asked "to where?".
    expect(game.decision()?.kind).toBe("action");
    await game.settle();
    expect(game.locationOf("drummer")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("declining the opt-in removes the trigger and moves nothing (383.3.a.2)", async () => {
    const game = await board().build();
    await arrive(game);
    await game.p1.play("fresh", { to: "spring" });
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("drummer")).toBe("spring");
  });

  test("383.3.e.1 — only the FIRST non-token play each turn triggers: a second play the same turn surfaces no prompt at all", async () => {
    const game = await board().build();
    await arrive(game);
    await game.p1.play("fresh", { to: "spring" });
    await game.p1.yes();
    await game.p1.pick("drummer");
    await game.settle();

    await game.p1.play("second", { to: "spring" });
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).toBe("action");
  });

  test("(i) Minotaur Reckoner ('Units can't move to base') does NOT shrink the menu — a forbidden action is not an illegal choice (358.3.a)", async () => {
    const game = await board().unit(P1, "base", MINOTAUR_RECKONER, "minotaur").build();
    const token = await arrive(game);
    await game.p1.play("fresh", { to: "spring" });
    await game.p1.yes();
    expect(pickOptions(game).sort()).toEqual([game.card("drummer"), token].sort());
  });

  test("(i) …and the pick is legal: the impossible move instruction is simply ignored on resolution (054.1, 359.3.e.6) — the Drummer stays put", async () => {
    const game = await board().unit(P1, "base", MINOTAUR_RECKONER, "minotaur").build();
    await arrive(game);
    await game.p1.play("fresh", { to: "spring" });
    await game.p1.yes();
    await game.p1.pick("drummer");
    await game.settle();
    expect(game.locationOf("drummer")).toBe("spring"); // nothing else about the trigger changed
    expect(game.chain()).toEqual([]);
  });

  // Expected (rules): with the just-played unit the only unit P1 controls at Star Spring, the
  // "another unit they control here" target set is empty, so no valid choice exists — 355.8 keeps
  // the ability off the chain and 383.3.a.2 treats it as never triggered. Nothing is asked.
  // Actual: the engine finalizes the opt-in BEFORE checking targets, so P1 is shown a
  // decline-only "Use Star Spring's optional ability?" yes/no; either answer then removes the item.
  test("(ii) an empty target set removes the trigger silently — no prompt, not even a decline-only one (355.8, 383.3.a.2)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { order: 3 } })
      .battlefield("spring", { controller: P1, def: STAR_SPRING, inert: false })
      .unit(P1, "base", { might: 2, name: "Homebody" }, "homebody")
      .hand(P1, FRESH, "fresh")
      .build();
    await game.p1.play("fresh", { to: "spring" });
    expect(game.decision()?.kind).toBe("action");
    expect(game.chain()).toEqual([]);
  });

  test("(ii) nothing is asked, nothing moves and no item is left on the chain", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { order: 3 } })
      .battlefield("spring", { controller: P1, def: STAR_SPRING, inert: false })
      .unit(P1, "base", { might: 2, name: "Homebody" }, "homebody")
      .hand(P1, FRESH, "fresh")
      .build();
    await game.p1.play("fresh", { to: "spring" });
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("fresh")).toBe("spring");
    expect(game.locationOf("homebody")).toBe("base");
  });

  test("(iii) an Ambushed play on P2's turn triggers for P2 — P2 is prompted and only P2's units here are offered", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 8, power: { fury: 3, order: 3 } })
      .battlefield("spring", { controller: P1, def: STAR_SPRING, inert: false })
      .unit(P1, "spring", NOXIAN_DRUMMER, "drummer")
      .unit(P1, "spring", { isToken: true, might: 1, name: "Recruit" }, "recruit")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .unit(P2, "base", { might: 2, name: "Raider Two" }, "raider2")
      .hand(P2, { cardType: "unit", energyCost: 2, keywords: ["Ambush"], might: 3, name: "Ambusher" }, "ambusher")
      .build();
    await game.p2.move(["raider", "raider2"], "spring"); // opens the showdown; P2 holds Focus
    expect(game.p2.can("play", "ambusher")).toBe(true); // 822.1 — Ambush plays as a Reaction here

    await game.p2.play("ambusher", { to: "spring" });
    const optIn = game.decision();
    expect(optIn?.kind).toBe("yes-no");
    expect(optIn?.seat).toBe(P2); // "a player … they" — the trigger belongs to the player who played
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: game.card("spring"), controller: P2, triggered: true }),
    ]);

    await game.p2.yes();
    const offered = pickOptions(game);
    expect(offered.sort()).toEqual([game.card("raider"), game.card("raider2")].sort());
    expect(offered).not.toContain(game.card("ambusher")); // "another"
    expect(offered).not.toContain(game.card("drummer")); // P1's units are never offered to P2
    expect(offered).not.toContain(game.card("recruit"));
  });
});
