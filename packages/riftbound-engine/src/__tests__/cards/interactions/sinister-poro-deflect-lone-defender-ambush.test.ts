/**
 * Interaction: Sinister Poro (unl-137-219) · Unit · Chaos · 2 · 1 Might
 *     "When I attack, you may pay [1] to move an enemy unit here to its base."
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 · 2 Might
 *     "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)"
 *   × Poppy, Defender of the Meek (unl-178-219) · Champion Unit · Order · 6 · 5 Might
 *     "…[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.) [Tank]…"
 *
 * Rules: 383.4.e (attack trigger pends when the Attacker designation is gained), 383.3.a / 383.3.b /
 * 383.3.b.1 (leading "you may pay [1] to …" → opt-in + base cost [1], both at FINALIZATION), 402.2 (target
 * "an enemy unit here" chosen in step 2), 809.1.c / 809.1.c.1 / 809.1.d + 403.2 (choosing a [Deflect] unit
 * with an ABILITY adds a mandatory extra cost of 1 Power of ANY domain), 404.1 (all costs paid together in
 * step 4), 404.2 / 404.2.a (unpayable → the trigger is removed; not a counter), 406.4 (opponent's Reaction
 * window comes after finalization), 822.1.b / 822.3 (Ambush: Reaction-speed play "to a battlefield where you
 * have units" — permission gone once you have none there), 464.2.c.3.a (a late arrival becomes a Defender at
 * the next cleanup), 465.1 (no defenders → no combat damage), 466.3.a (sole player with units wins → conquer).
 *
 * Q: P1's Sinister Poro attacks bf1 defended only by P2's Pouty Poro; P2 holds Poppy with mana.
 *   (a) full cost & timing         → [1] + 1 power (any domain), chosen/paid at finalization; target locked.
 *   (b) P1 has [1] but 0 power     → cannot opt in at all (no "pay just the [1]"); 1 vs 2 → Sinister dies.
 *   (c) P1 pays; P2 Ambushes Poppy → legal (Pouty still there); trigger still sends Pouty home; 1 vs 5 Tank
 *                                    → Sinister dies, P2 keeps bf1.
 *   (d) P2 does nothing            → Pouty home, no defender, damage step skipped, P1 conquers bf1 (+1).
 *   (e) Ambush AFTER Pouty left?   → no: P2 has no unit at bf1, Poppy is not playable anywhere.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SINISTER_PORO = "unl-137-219";
const POUTY_PORO = "ogn-013-298";
const POPPY = "unl-178-219";

/**
 * P1's turn. P2 controls bf1 with only Pouty Poro; P1's Sinister Poro is ready in base with `energy`
 * energy and `power` (default 1 FURY — an off-domain pip, to show Deflect takes any domain). P2 holds
 * Poppy with exactly her cost (6 + [order]).
 */
function board(o: { energy?: number; power?: Record<string, number> } = {}) {
  return scenario()
    .resources(P1, { energy: o.energy ?? 1, power: o.power ?? { fury: 1 } })
    .resources(P2, { energy: 6, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", POUTY_PORO, "pouty")
    .unit(P1, "base", SINISTER_PORO, "sin")
    .hand(P2, POPPY, "poppy");
}

type YesNo = Extract<Decision, { kind: "yes-no" }>;

/** Legal `to` destinations offered to P2 for playing Poppy right now ([] when not offered). */
function poppyDestinations(game: Game): string[] {
  const f = game.p2.option("play", "poppy")?.fields.find((x) => x.arg === "to");
  return ((f?.options ?? []) as string[]).slice().sort();
}

/** Everyone passes priority until the chain is empty (whoever holds it passes). */
async function passOutChain(game: Game): Promise<void> {
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

/** Sinister Poro attacks, P1 opts in and passes priority → P2 holds priority with the finalized trigger on the chain. */
async function attackPayAndPass(game: Game): Promise<void> {
  await game.p1.move("sin", "bf1");
  await game.p1.yes();
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Sinister Poro × Pouty Poro [Deflect] × Poppy [Ambush][Tank] — paying to empty a battlefield", () => {
  // ── (a) cost & timing ─────────────────────────────────────────────────────────────────────────
  test("(a) the attack trigger pends the moment Sinister Poro becomes the attacker, as a 'you may pay' opt-in for P1 at FINALIZATION (timing FIN) — nothing paid yet (383.4.e, 383.3.a)", async () => {
    const game = await board().build();
    await game.p1.move("sin", "bf1");
    expect(game.state("sin").combatRole).toBe("attacker");
    expect(game.state("pouty").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sin", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("(a) opting in pays the FULL cost at once — [1] energy (base cost) + 1 power of ANY domain for Pouty's Deflect (a fury pip does) — and locks Pouty Poro as the target before P2 gets priority (809.1.c.1, 404.1, 406.4)", async () => {
    const game = await board().build();
    await game.p1.move("sin", "bf1");
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sin", targets: ["pouty"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 (who finalized it) holds priority first
    expect(game.locationOf("pouty")).toBe("bf1"); // the move happens on resolution only
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.decision()).toBeNull(); // nothing further is asked of P1
  });

  test("(a) contrast: against a vanilla 2-Might defender the cost is just [1] — P1 opts in with zero power", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Plain Poro" }, "plain")
      .unit(P1, "base", SINISTER_PORO, "sin")
      .build();
    await game.p1.move("sin", "bf1");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sin", targets: ["plain"] })]);
  });

  // ── (b) [1] energy but no power ───────────────────────────────────────────────────────────────
  test("(b) with [1] but zero power the total cost ([1] + Deflect pip) is unpayable: 'yes' is not acceptable, there is no 'pay only the energy' line, and P1's energy is untouched (404.2, 809.1.d)", async () => {
    const game = await board({ power: {} }).build();
    await game.p1.move("sin", "bf1");
    const d = game.decision();
    if (d?.kind === "yes-no") {
      expect((d as YesNo).canAccept).toBe(false);
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      expect(game.p1.energy()).toBe(1);
      expect(game.locationOf("pouty")).toBe("bf1");
      await game.p1.no();
    }
    expect(game.chain()).toEqual([]); // removed, never finalized — not "countered" (404.2.a)
    expect(game.p1.energy()).toBe(1);
    expect(game.locationOf("pouty")).toBe("bf1");
  });

  // DESIGN (DESIGN.md §Paying costs): rule 404.2 removes an unpayable opt-in silently, but paying is
  // MANUAL here — the yes-no is still offered with `canAccept: false` so the controller can tap runes
  // and then accept. The candidate/object set is not empty (Pouty is a legal target), so this stays a
  // payment question; declining (or settling) then removes the item with nothing paid.
  test("(b) …the unpayable trigger is offered as an unacceptable yes-no and removed on decline, nothing paid (404.2)", async () => {
    const game = await board({ power: {} }).build();
    expect(game.p1.runes()).toEqual([]);
    await game.p1.move("sin", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.locationOf("pouty")).toBe("bf1");
  });

  test("(b) combat then proceeds 1 vs 2: Sinister Poro dies, Pouty Poro holds bf1 for P2, nobody scores now; P1 still has its [1]", async () => {
    const game = await board({ power: {} }).build();
    await game.p1.move("sin", "bf1");
    await game.settle(); // hands the unpayable opt-in back once, then declines it and fights
    await game.settle();
    expect(game.zoneOf("sin")).toBe("trash");
    expect(game.zoneOf("pouty")).toBe("battlefield-bf1");
    expect(game.state("pouty").damage).toBe(0); // 1 damage healed at combat cleanup
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.energy()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (c) P2 Ambushes Poppy in response ─────────────────────────────────────────────────────────
  test("(c) in response to the finalized trigger P2 may Ambush Poppy — offered ONLY to bf1 (where Pouty still stands), not to base (822.1.b, 406.4)", async () => {
    const game = await board().build();
    await attackPayAndPass(game);
    expect(game.locationOf("pouty")).toBe("bf1");
    expect(game.p2.can("play", "poppy")).toBe(true);
    expect(poppyDestinations(game)).toEqual(["battlefield-bf1"]);
    await expect(game.p2.play("poppy", { to: "base" })).rejects.toThrow();
    expect(game.zoneOf("poppy")).toBe("hand");
  });

  test("(c) Poppy is paid for (6 + [order]), enters bf1 EXHAUSTED and takes P2's Defender designation; the Sinister trigger is still on the chain beneath her", async () => {
    const game = await board().build();
    await attackPayAndPass(game);
    await game.p2.play("poppy", { to: "bf1" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("poppy")).toBe("battlefield-bf1");
    expect(game.state("poppy").isExhausted).toBe(true);
    // A permanent resolves immediately; the ability is still waiting.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sin", targets: ["pouty"], triggered: true })]);
    // Defender by the next cleanup at the latest (464.2.c.3.a) — resolve the trigger and look again.
    await passOutChain(game);
    expect(game.state("poppy").combatRole).toBe("defender");
    expect(game.state("poppy").might).toBe(5);
  });

  test("(c) the trigger then still resolves — Pouty Poro IS still 'an enemy unit here' → moved to P2's base; P1's [1]+pip stay spent", async () => {
    const game = await board().build();
    await attackPayAndPass(game);
    await game.p2.play("poppy", { to: "bf1" });
    await passOutChain(game);
    expect(game.zoneOf("pouty")).toBe("base");
    expect(game.state("pouty")).toMatchObject({ combatRole: null, controller: P2, location: "base" });
    expect(game.p2.units("bf1")).toEqual(["poppy"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("(c) combat: 1-Might attacker into 5-Might [Tank] defender → Sinister Poro dies, Poppy survives (healed), P2 KEEPS bf1, no points change hands", async () => {
    const game = await board().build();
    await attackPayAndPass(game);
    await game.p2.play("poppy", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("sin")).toBe("trash");
    expect(game.zoneOf("poppy")).toBe("battlefield-bf1");
    expect(game.state("poppy").damage).toBe(0);
    expect(game.zoneOf("pouty")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) P2 does nothing ───────────────────────────────────────────────────────────────────────
  test("(d) P2 passes instead: the trigger resolves and Pouty Poro goes to P2's base, leaving Sinister Poro alone at bf1 (still in the showdown, P1 has Focus)", async () => {
    const game = await board().build();
    await attackPayAndPass(game);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("pouty")).toBe("base");
    expect(game.state("pouty")).toMatchObject({ controller: P2, damage: 0 });
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.p1.units("bf1")).toEqual(["sin"]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("(d) no Defending unit remains → the damage step is skipped (P2 never assigns, Sinister takes 0) and P1, sole player with units, CONQUERS bf1 with a 1-Might Poro: +1 point (465.1, 466.3.a)", async () => {
    const game = await board().build();
    let p2AskedToAssign = false;
    game.script(P2, [
      (d) => {
        p2AskedToAssign ||= d.kind === "distribute";
        return undefined;
      },
    ]);
    await attackPayAndPass(game);
    await game.p2.passPriority();
    await game.settle();
    expect(p2AskedToAssign).toBe(false);
    expect(game.state("sin")).toMatchObject({ damage: 0, location: "bf1", might: 1 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // the "2 resources for a battlefield" line
    expect(game.zoneOf("poppy")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 6, power: { order: 1 } });
    expect(game.violations()).toEqual([]);
  });

  // ── (e) too late to Ambush ────────────────────────────────────────────────────────────────────
  test("(e) once Pouty Poro has been sent home P2 controls no unit at bf1: with Focus in the showdown Poppy is NOT playable — not to bf1 (Ambush permission gone, 822.1.b/822.3) and not to base (no Reaction timing)", async () => {
    const game = await board().build();
    await attackPayAndPass(game);
    await game.p2.passPriority(); // trigger resolves, Pouty → base
    expect(game.zoneOf("pouty")).toBe("base");
    // P1 holds Focus; hand it to P2 so P2 has every opportunity.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p2.can("play", "poppy")).toBe(false);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("play", "poppy")).toBe(false);
    expect(poppyDestinations(game)).toEqual([]);
    await expect(game.p2.play("poppy", { to: "bf1" })).rejects.toThrow();
    await expect(game.p2.play("poppy", { to: "base" })).rejects.toThrow();
    expect(game.zoneOf("poppy")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 6, power: { order: 1 } });
    // …and passing ends it: P1 conquers.
    await game.p2.passFocus();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("(e) contrast: P2's ONLY window was in response to the finalized trigger — there, and only there, Poppy → bf1 was on P2's menu", async () => {
    const game = await board().build();
    await attackPayAndPass(game);
    expect(poppyDestinations(game)).toEqual(["battlefield-bf1"]); // the (c) window
    await game.p2.passPriority();
    await game.p1.passFocus();
    expect(poppyDestinations(game)).toEqual([]); // gone with Pouty
  });
});
