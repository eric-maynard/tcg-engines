/**
 * Arise! — sfd-198-221 · Spell · Calm/Order · 6 energy + 1 hybrid [calm|order] pip (engine: "rainbow")
 *
 *   Play a 2 [Might] Sand Soldier unit token for each Equipment you control.
 *   Then do this: Ready up to two of them.
 *
 * Rules: 187.3 (Sand Soldier token), 185.2.a + 439.2.b.1-style play (a played unit token with no
 * stated location may enter your base or a battlefield you control), 143.4 (enters exhausted),
 * 387 / 387.2 ("do this:" = reflexive trigger, always added to the chain here — no condition),
 * 359.3.e.14 ("them" is linked to the tokens THIS spell played, nothing else), "up to two" (0, 1 or
 * 2 may be chosen), 155 / 159.2.a.1 (no [Action]/[Reaction] → standard timing), 135.2.e.5.b (a
 * hybrid pip is payable by either domain or by universal power, not by an off-domain power).
 *
 * Head-judge corner cases considered:
 *   - N = 0 (castable, fizzles into the trash, no prompts), N = 1, N = 2 (ready both), N = 3
 *     (exactly two readied, the third stays exhausted) — "for each" must really count;
 *   - what counts: Equipment attached to a unit AND loose Equipment in base; the opponent's doesn't;
 *   - "of them": an older exhausted Sand Soldier already on the board may NOT be readied;
 *   - "up to two": declining readies nothing;
 *   - with a controlled battlefield each token asks where it enters;
 *   - the ready step is a reflexive trigger → its own chain item after the spell has left the chain;
 *   - timing: not on the opponent's turn / in their showdown; cost pip: calm ✓ order ✓ fury ✗;
 *   - partner Renata Glasc, Industrialist: every token enters ready, so the "ready" step is moot.
 */

import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-198-221";
const EYE = "sfd-153-221"; // Eye of the Herald — Equipment · Order · 1 energy
const SHIELD = "sfd-033-221"; // Doran's Shield — Equipment · Calm · 1 energy
const RENATA = "sfd-171-221";

const soldiers = (game: Game, owner = P1) =>
  game.findAll({ name: "Sand Soldier", owner }).filter((id) => game.locationOf(id) !== undefined);

/** P1 with `loose` unattached Equipment in base and `attached` Equipment on a 3-Might bearer. */
function board(loose: number, attached: number, power: Record<string, number> = { rainbow: 1 }) {
  const b = scenario().resources(P1, { energy: 6, power }).hand(P1, CARD, "arise");
  for (let i = 0; i < loose; i++) {
    b.gear(P1, i % 2 === 0 ? EYE : SHIELD, `loose${i}`);
  }
  if (attached > 0) {
    const worn = Array.from({ length: attached }, (_, i) => `worn${i}`);
    b.unit(P1, "base", { might: 3, name: "Bearer" }, "bearer", { equippedWith: worn });
    worn.forEach((id) => b.gear(P1, EYE, id, { attachedTo: "bearer" }));
  }
  return b;
}

/**
 * Cast Arise! and drive it to completion: token destination prompts → `dest`; the "ready up to two
 * of them" prompt → `ready` (card ids, "all" = first two offered, or "none" = decline).
 * Returns the option keys the ready prompt offered (empty if it never appeared as a real choice).
 */
async function ariseAndResolve(game: Game, ready: "all" | "none" | readonly string[] = "all", dest = "base"): Promise<string[]> {
  await game.p1.cast("arise");
  let offered: string[] = [];
  for (let i = 0; i < 12; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "pick") {
      break;
    }
    const keys = (d as PickDecision).options.map((o) => o.key);
    if (keys.includes("base")) {
      await game.p1.pick(dest);
      continue;
    }
    offered = keys;
    if (ready === "none") {
      await game.p1.decline();
    } else {
      const want = ready === "all" ? keys.slice(0, 2) : ready;
      await game.p1.pick(...want);
    }
  }
  return offered;
}

describe("Arise! (sfd-198-221)", () => {
  test("cost: 6 energy + the hybrid pip (paid here from rainbow); standard-timing spell that ends in the trash", async () => {
    const game = await board(1, 0).build();
    await game.p1.cast("arise");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "arise", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("arise")).toBe("trash");
  });

  test("the hybrid pip accepts [calm] or [order] but not [fury]; 5 energy is not enough", async () => {
    expect((await board(1, 0, { calm: 1 }).build()).p1.can("cast", "arise")).toBe(true);
    expect((await board(1, 0, { order: 1 }).build()).p1.can("cast", "arise")).toBe(true);
    expect((await board(1, 0, { fury: 1 }).build()).p1.can("cast", "arise")).toBe(false);
    expect((await board(1, 0, {}).build()).p1.can("cast", "arise")).toBe(false);
    const five = await scenario().resources(P1, { energy: 5, power: { rainbow: 1 } }).gear(P1, EYE, "e").hand(P1, CARD, "arise").build();
    expect(five.p1.can("cast", "arise")).toBe(false);
  });

  test("N = 0: with no Equipment (the opponent's two don't count) it is still castable, plays no token, asks nothing, and goes to the trash", async () => {
    const game = await board(0, 0).gear(P2, EYE, "theirs1").gear(P2, SHIELD, "theirs2").build();
    expect(game.p1.can("cast", "arise")).toBe(true);
    const offered = await ariseAndResolve(game);
    expect(offered).toEqual([]);
    expect(game.findAll({ name: "Sand Soldier" })).toHaveLength(0);
    expect(game.zoneOf("arise")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("N = 1 via an ATTACHED Equipment (attached gear is still controlled): one 2-Might domainless token in base, readied by the follow-up", async () => {
    const game = await board(0, 1).build();
    await ariseAndResolve(game, "all");
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    const s = game.state(made[0] as string);
    expect(s).toMatchObject({ controller: P1, isReady: true, isToken: true, might: 2, zone: "base" });
    expect(s.domains).toEqual([]);
  });

  test("N = 2 (one loose + one attached) → TWO Sand Soldiers are played and both may be readied", async () => {
    // Expected: "for each Equipment you control" counts 2 → two tokens, ready both.
    const game = await board(1, 1).build();
    await ariseAndResolve(game, "all");
    const made = soldiers(game);
    expect(made).toHaveLength(2);
    expect(made.every((t) => game.state(t).isReady)).toBe(true);
  });

  test("N = 3 → three tokens; 'up to two of them' readies exactly the two chosen and the third stays exhausted", async () => {
    // Expected: 3 tokens, the prompt offers exactly those 3 with max 2; afterwards 2 ready + 1 exhausted.
    const game = await board(2, 1).build();
    const offered = await ariseAndResolve(game, "all");
    const made = soldiers(game);
    expect(made).toHaveLength(3);
    expect(offered.sort()).toEqual([...made].sort());
    expect(made.filter((t) => game.state(t).isReady)).toHaveLength(2);
    expect(made.filter((t) => game.state(t).isExhausted)).toHaveLength(1);
  });

  test("'up to two' includes zero: declining the ready step leaves the new token exhausted (rule 143.4 default)", async () => {
    const game = await board(1, 0).script(P1, ["decline"]).build();
    await game.p1.cast("arise");
    await game.settle();
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.state(made[0] as string).isExhausted).toBe(true);
    expect(game.zoneOf("arise")).toBe("trash");
  });

  test("'of THEM' — an older exhausted Sand Soldier already on the board is not one of the tokens Arise! played and must not be offered/readied", async () => {
    // Expected: the ready prompt (if any) lists only the freshly played token; the veteran stays exhausted.
    const game = await board(1, 0)
      .unit(P1, "base", { might: 2, name: "Sand Soldier", tags: ["Sand Soldier", "Shurima"] }, "veteran", { exhausted: true })
      .build();
    const offered = await ariseAndResolve(game, "all");
    expect(offered).not.toContain("veteran");
    expect(game.state("veteran").isExhausted).toBe(true);
    const fresh = soldiers(game).filter((t) => t !== "veteran");
    expect(fresh).toHaveLength(1);
    expect(game.state(fresh[0] as string).isReady).toBe(true);
  });

  test("with a controlled battlefield the token asks where it enters and can be played there, then be readied", async () => {
    const game = await board(1, 0).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 4 }, "holder").build();
    await game.p1.cast("arise");
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d.kind).toBe("pick");
    expect(d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    await game.settle(); // single-option ready prompt is taken
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.zoneOf(made[0] as string)).toBe("battlefield-bf1");
    expect(game.state(made[0] as string).isReady).toBe(true);
  });

  test.failing("BUG: 387 — 'Then do this:' is a reflexive trigger: after the spell resolves a separate triggered chain item readies the tokens (P2 gets a response window)", async () => {
    // Expected: spell resolves (token on board, exhausted, Arise! in trash) and a triggered item
    // controlled by P1 now sits on the chain; only when THAT resolves does the token ready.
    // Actual: the ready happens inline during the spell's resolution — no second chain item.
    const game = await board(1, 0).build();
    await game.p1.cast("arise");
    await game.p1.passPriority();
    await game.p2.passPriority(); // spell resolves
    if (game.decision()?.kind === "pick") {
      await game.p1.pick((game.decision() as PickDecision).options[0]?.key as string); // choose "them" for the trigger
    }
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.zoneOf("arise")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ controller: P1, triggered: true })]);
    expect(game.state(made[0] as string).isExhausted).toBe(true);
    await game.settle();
    expect(game.state(made[0] as string).isReady).toBe(true);
  });

  test("standard timing: not castable on the opponent's turn, nor with Focus in their showdown; castable again on your own turn", async () => {
    const game = await board(1, 0)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5 }, "holder")
      .unit(P2, "base", { might: 1 }, "poke")
      .build();
    expect(game.p1.can("cast", "arise")).toBe(false);
    await game.p2.move("poke", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "arise")).toBe(false);
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 6, power: { rainbow: 1 } });
    expect(game.p1.can("cast", "arise")).toBe(true);
  });

  test("partner — with Renata Glasc, Industrialist out, the token already ENTERS ready (declining the ready step changes nothing)", async () => {
    const game = await board(1, 0).unit(P1, "base", RENATA, "renata").script(P1, ["decline"]).build();
    await game.p1.cast("arise");
    await game.settle();
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.state(made[0] as string).isReady).toBe(true);
  });

  test("registry payload: 6-cost Calm/Order spell with one hybrid pip and standard timing; effect = [for-each friendly Equipment → Sand Soldier 2] then [ready up to 2]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 6, name: "Arise!", timing: "standard" });
    expect(def?.domain).toEqual(["calm", "order"]);
    expect(def?.powerCost).toEqual(["rainbow"]);
    expect(def?.abilities).toHaveLength(1);
    const a = def?.abilities?.[0] as { type: string; effect: { type: string; effects: Record<string, any>[] } };
    expect(a.type).toBe("spell");
    expect(a.effect.type).toBe("sequence");
    expect(a.effect.effects).toHaveLength(2);
    const [make, ready] = a.effect.effects as [Record<string, any>, Record<string, any>];
    expect(make).toMatchObject({ target: { controller: "friendly", type: "equipment" }, type: "for-each" });
    expect(make.effect).toMatchObject({ token: { might: 2, name: "Sand Soldier", type: "unit" }, type: "create-token" });
    expect(ready).toMatchObject({ type: "ready" });
    expect(ready.target?.quantity).toEqual({ upTo: 2 });
  });
});
