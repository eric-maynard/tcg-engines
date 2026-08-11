/**
 * Interaction: The Zero Drive (sfd-090-221) — "[3][mind], Banish this: Play all units banished
 *   with this, ignoring their costs. (Use only if unattached.)"
 *   × Arachnoid Horror (unl-117-219) — "I can be played to an occupied battlefield if an enemy
 *     unit is alone there. / Friendly units can be played to an occupied battlefield if an enemy
 *     unit is alone there."
 *   × Rek'Sai, Breacher (sfd-029-221) — "Friendly units played from anywhere other than a
 *     player's hand have [Accelerate]."
 *
 * Question: P1 banishes the Drive to mass-play its linked pool — Arachnoid Horror, two vanilla
 * units and a Recruit TOKEN banished earlier — while P2's bf2 holds exactly one unit.
 *   (a) Is the token replayed?                                     186.1 (tokens cease to exist), 427.3 (linked pool)
 *   (b) Does Arachnoid's line 1 work out of BANISHMENT, and does its board-only line 2
 *       retroactively open bf2 for the vanillas played later in the SAME resolution?
 *                                                                  366.1, 355.2.b, 740.2.a
 *   (c) Same board with TWO enemy units at bf2.                    740.2.a, 358.5
 *   (d) How many Accelerate elections and destination choices, in what order?
 *                                                                  419.3.b, 805.2, 805.2.a
 *   (e) With exactly [1][A] left after the activation cost, which units enter ready?
 *                                                                  356.1.b.1, 356.1.b.3, 805.1.a.2, 143.4
 *   (f) Does the SECOND unit of the mass-play have Legion active?  812.1.c
 *
 * Rule 740.2.a is the load-bearing definition for "alone": "A unit is alone when there are no
 * other FRIENDLY units at the same location" — so an enemy unit stays "alone there" when one of
 * MY units joins it. (Confirmed by riftjudge d8937a8abe18b2d3: "you can play multiple units to a
 * battlefield using the ability granted by Arachnoid Horror".)
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZERO_DRIVE = "sfd-090-221";
const ARACHNOID = "unl-117-219";
const REKSAI = "sfd-029-221";
const RECRUIT = "ogn-272-298"; // Recruit (NX) — a real 1-might unit TOKEN definition
const GLORYSEEKER = "ogn-217-298"; // "[Legion] — When you play me, buff me."

/** Vanilla Body unit: same domain as Arachnoid, so its Accelerate wants [1][body]. */
const VANILLA = { cardType: "unit" as const, domain: "body", energyCost: 2, might: 2, name: "Vanilla" };
/** Vanilla with NO domain — its Accelerate Power pip is [A] (rule 805.1.a.2). */
const DOMAINLESS = { cardType: "unit" as const, energyCost: 2, might: 2, name: "Wanderer" };

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * The board: the Drive unattached in P1's base with `pool` linked to it (as if their Deathknells
 * had resolved), Rek'Sai in base, P1 durably controlling bf1, P2 holding bf2 with `enemies` units.
 * `.resources` covers the [3][mind] activation plus whatever is left for Accelerate elections.
 */
function board(opts: { pool?: string[]; enemies?: number; energy?: number; body?: number } = {}) {
  const { pool = ["arach", "van1", "van2", "tok"], enemies = 1, energy = 12, body = 5 } = opts;
  let s = scenario()
    .resources(P1, { energy, power: { body, mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1 }, "holder") // durable control of bf1 (323.6)
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", REKSAI, "reksai")
    .card("zd", { def: ZERO_DRIVE, meta: { exiledByThis: pool }, owner: P1, zone: "base" })
    .banishment(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Stranger" }, "stranger"); // 427.3: not linked
  if (pool.includes("arach")) s = s.banishment(P1, ARACHNOID, "arach");
  if (pool.includes("van1")) s = s.banishment(P1, { ...VANILLA, name: "Van One" }, "van1");
  if (pool.includes("van2")) s = s.banishment(P1, { ...VANILLA, name: "Van Two" }, "van2");
  if (pool.includes("tok")) s = s.banishment(P1, RECRUIT, "tok");
  if (pool.includes("glory")) s = s.banishment(P1, GLORYSEEKER, "glory");
  if (pool.includes("nd")) s = s.banishment(P1, DOMAINLESS, "nd");
  for (let i = 0; i < enemies; i++) s = s.unit(P2, "bf2", { might: 2 }, `foe${i}`);
  return s;
}

/** The keys of the pick currently being asked (empty when the open decision is not a pick). */
function pickKeys(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.key) : [];
}

/** Settle until a prompt nobody answered; `null` once the open main phase is back. */
async function nextPrompt(game: Game) {
  const r = await game.settle();
  return r.reason === "unanswered" ? game.decision() : null;
}

/**
 * Drive the whole mass-play, recording every prompt it raises. Destination picks take `dest`
 * (falling back to the first key when `dest` is not offered); Accelerate opt-ins take `accelerate`.
 */
async function runMassPlay(game: Game, opts: { dest?: string; accelerate?: boolean } = {}): Promise<string[]> {
  const { dest = "base", accelerate = true } = opts;
  const prompts: string[] = [];
  for (let i = 0; i < 30; i++) {
    const d = await nextPrompt(game);
    if (!d) break;
    prompts.push(d.prompt ?? "");
    if (d.kind === "yes-no") {
      await (accelerate ? game.p1.yes() : game.p1.no());
      continue;
    }
    if (d.kind === "pick") {
      const keys = d.options.map((o) => o.key);
      await game.p1.pick(keys.includes(dest) ? dest : (keys[0] as string));
      continue;
    }
    break;
  }
  return prompts;
}

describe("The Zero Drive mass-play × Arachnoid Horror permissions × Rek'Sai Accelerate", () => {
  // ---- (a) the banished Recruit token -------------------------------------------------------
  test("(a) the Recruit TOKEN is not among the units played — it ceased to exist on entering banishment (186.1), and the unlinked stranger stays put (427.3)", async () => {
    const game = await board({ pool: ["tok"] }).build();
    await game.p1.activate("zd");
    await runMassPlay(game);
    expect(game.has("tok")).toBe(false);
    expect(game.locationOf("tok")).toBeUndefined();
    expect(game.p1.base()).not.toContain("tok");
    expect(game.p1.units("bf1")).toEqual(["holder"]);
    expect(game.zoneOf("stranger")).toBe("banishment"); // never linked to THIS Drive
  });

  test("the token is never a playable member of the pool — no destination is asked, no Accelerate election is charged and nothing dangles in base (186.1: nothing was ever there to play)", async () => {
    // Expected: no prompt ever names the Recruit, nothing is paid, no invariant is broken.
    // Actual: "Choose a destination for Recruit (NX)" + "Pay [1] to use Recruit (NX)'s optional
    // ability?" are asked, 1 energy is spent, and cardConservation records
    // "tok in zone base but missing from cards".
    const game = await board({ pool: ["tok"] }).build();
    await game.p1.activate("zd");
    const energyAfterActivation = game.p1.energy();
    const prompts = await runMassPlay(game);
    expect(prompts.filter((p) => p.includes("Recruit"))).toEqual([]);
    expect(game.p1.energy()).toBe(energyAfterActivation);
    expect(game.violations()).toEqual([]);
  });

  // ---- (b) Arachnoid's two lines ------------------------------------------------------------
  test("(b) control: from HAND Arachnoid's own line-1 permission opens the occupied bf2 (355.2.b) and it really lands there", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { body: 4 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2 }, "foe0")
      .hand(P1, ARACHNOID, "ah")
      .build();
    const locations = game.p1.option("play", "ah")?.fields.find((f) => f.name === "location")?.options ?? [];
    expect(locations).toContain("battlefield-bf2");
    await game.p1.play("ah", { to: "bf2" });
    await game.settle();
    expect(game.locationOf("ah")).toBe("bf2");
  });

  test("Arachnoid's line 1 is a self-describing passive, so it is live in BANISHMENT too (366.1) — bf2 must be offered as its destination in the mass play; the engine offers only base and bf1", async () => {
    // Expected: ["base", "battlefield-bf1", "battlefield-bf2"]. Actual: ["base", "battlefield-bf1"]
    // — the play-from-banishment path enumerates destinations without consulting any permission.
    const game = await board({ pool: ["arach"] }).build();
    await game.p1.activate("zd");
    const d = await nextPrompt(game);
    expect(d?.kind).toBe("pick");
    expect(pickKeys(game)).toContain("battlefield-bf2");
  });

  test("(b) control: line 2 is an ordinary BOARD passive — with Arachnoid in base a friendly unit in hand may be played to bf2; with Arachnoid still in banishment it may not", async () => {
    const withIt = await scenario()
      .resources(P1, { energy: 9, power: { body: 4 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2 }, "foe0")
      .unit(P1, "base", ARACHNOID, "arachBase")
      .hand(P1, { ...VANILLA, name: "Hand Van" }, "hv")
      .build();
    expect(withIt.p1.option("play", "hv")?.fields.find((f) => f.name === "location")?.options).toEqual([
      "base",
      "battlefield-bf2",
    ]);

    const without = await scenario()
      .resources(P1, { energy: 9, power: { body: 4 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2 }, "foe0")
      .banishment(P1, ARACHNOID, "arachBanished") // off-board: line 2 is inert (366.1)
      .hand(P1, { ...VANILLA, name: "Hand Van" }, "hv")
      .build();
    expect(without.p1.option("play", "hv")?.fields.find((f) => f.name === "location")?.options).toEqual(["base"]);
    await expect(without.p1.play("hv", { to: "bf2" })).rejects.toThrow();
  });

  test("a vanilla played LATER in the same resolution must see Arachnoid already on the board and gain its line-2 permission (419.3.b — each unit runs the whole play, so the board state moves between them)", async () => {
    // Arachnoid is played first (to base); Van One's own destination step happens afterwards, so
    // bf2 — occupied by a lone enemy — is a valid location for it (355.2.b).
    // Expected: ["base", "battlefield-bf1", "battlefield-bf2"]. Actual: ["base", "battlefield-bf1"].
    const game = await board({ pool: ["arach", "van1"] }).build();
    await game.p1.activate("zd");
    const first = await nextPrompt(game);
    expect(first?.prompt).toContain("Arachnoid Horror");
    await game.p1.pick("base"); // Arachnoid enters P1's base
    await nextPrompt(game);
    await game.p1.yes(); // its Accelerate election
    const second = await nextPrompt(game);
    expect(second?.prompt).toContain("Van One");
    expect(game.locationOf("arach")).toBe("base"); // it is already on the board
    expect(pickKeys(game)).toContain("battlefield-bf2");
  });

  test("rule 740.2.a — a unit is alone when no other FRIENDLY unit shares its location, so one of MY units at bf2 does not stop the lone enemy from being 'alone there'", async () => {
    // Expected: with my unit standing next to the single enemy at bf2, both Arachnoid (line 1) and
    // a friendly unit (line 2) may still be played there. Actual: bf2 drops out of both menus —
    // the engine reads "alone" as "the only unit at the battlefield".
    const game = await scenario()
      .resources(P1, { energy: 9, power: { body: 4 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2 }, "foe0")
      .unit(P1, "bf2", { might: 1 }, "myGuy")
      .unit(P1, "base", ARACHNOID, "arachBase")
      .hand(P1, ARACHNOID, "ah")
      .hand(P1, { ...VANILLA, name: "Hand Van" }, "hv")
      .build();
    expect(game.p1.option("play", "ah")?.fields.find((f) => f.name === "location")?.options).toContain("battlefield-bf2");
    expect(game.p1.option("play", "hv")?.fields.find((f) => f.name === "location")?.options).toContain("battlefield-bf2");
  });

  // ---- (c) two enemy units at bf2 -----------------------------------------------------------
  test("(c) with TWO enemy units at bf2 the condition fails for everyone: bf2 is absent from every mass-play menu, and naming it is refused with the decision left untouched (358.5)", async () => {
    const game = await board({ pool: ["arach", "van1"], enemies: 2 }).build();
    await game.p1.activate("zd");
    const first = await nextPrompt(game);
    expect(first?.prompt).toContain("Arachnoid Horror");
    expect(pickKeys(game)).toEqual(["base", "battlefield-bf1"]);

    const refused = await game.p1.try((p) => p.pick("battlefield-bf2"));
    expect(refused.ok).toBe(false);
    expect(pickKeys(game)).toEqual(["base", "battlefield-bf1"]); // cancelled, nothing applied
    expect(game.zoneOf("van1")).toBe("banishment");

    await game.p1.pick("base");
    await nextPrompt(game);
    await game.p1.yes();
    const second = await nextPrompt(game);
    expect(second?.prompt).toContain("Van One");
    expect(pickKeys(game)).toEqual(["base", "battlefield-bf1"]);
  });

  test("(c) with TWO enemy units at bf2 neither Arachnoid nor a friendly unit may be played there from hand either", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { body: 4 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2 }, "foe0")
      .unit(P2, "bf2", { might: 2 }, "foe1")
      .unit(P1, "base", ARACHNOID, "arachBase")
      .hand(P1, ARACHNOID, "ah")
      .hand(P1, { ...VANILLA, name: "Hand Van" }, "hv")
      .build();
    expect(game.p1.option("play", "ah")?.fields.find((f) => f.name === "location")?.options).toEqual(["base"]);
    expect(game.p1.option("play", "hv")?.fields.find((f) => f.name === "location")?.options).toEqual(["base"]);
    await expect(game.p1.play("ah", { to: "bf2" })).rejects.toThrow();
    await expect(game.p1.play("hv", { to: "bf2" })).rejects.toThrow();
  });

  // ---- (d) one complete run of the play steps per unit ---------------------------------------
  test("(d) each unit is played by its own complete run of steps 2–5 (419.3.b): destination choice then Accelerate election, per unit, interleaved — never one election for the whole batch (805.2)", async () => {
    const game = await board({ pool: ["arach", "van1", "van2"] }).build();
    await game.p1.activate("zd");
    const energyAfterActivation = game.p1.energy();
    const prompts = await runMassPlay(game);
    expect(prompts).toEqual([
      "Choose a destination for Arachnoid Horror [arach]",
      "Pay [1][body] to use Arachnoid Horror [arach]'s optional ability?",
      "Choose a destination for Van One [van1]",
      "Pay [1][body] to use Van One [van1]'s optional ability?",
      "Choose a destination for Van Two [van2]",
      "Pay [1][body] to use Van Two [van2]'s optional ability?",
    ]);
    // 356.1.b.1: the units' printed Energy costs (6 / 2 / 2) were ignored; only the three
    // Accelerate elections (356.1.b.3) were paid on top of the activation cost.
    expect(game.p1.energy()).toBe(energyAfterActivation - 3);
    expect(game.p1.power("body")).toBe(2);
    expect(game.decision()?.kind).toBe("action"); // 805.2.a: nothing more is asked once they are on the board
    expect(game.violations()).toEqual([]);
  });

  // ---- (e) one [1][A] left → exactly one unit enters ready -----------------------------------
  test("(e) with exactly [1][body] left after the [3][mind] activation only ONE Accelerate election is affordable: that unit enters ready, the others enter exhausted (143.4) and are never asked", async () => {
    const game = await board({ pool: ["arach", "van1", "van2"], energy: 4, body: 1 }).build();
    await game.p1.activate("zd");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 1, mind: 0 } });
    const prompts = await runMassPlay(game);
    expect(prompts.filter((p) => p.startsWith("Pay "))).toEqual([
      "Pay [1][body] to use Arachnoid Horror [arach]'s optional ability?",
    ]);
    expect(game.state("arach").isReady).toBe(true);
    expect(game.state("van1").isExhausted).toBe(true);
    expect(game.state("van2").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, mind: 0 } });
  });

  test("(e) without Rek'Sai there is no Accelerate at all: no election is offered and the unit enters exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { body: 3, mind: 1 } })
      .card("zd", { def: ZERO_DRIVE, meta: { exiledByThis: ["van1"] }, owner: P1, zone: "base" })
      .banishment(P1, { ...VANILLA, name: "Van One" }, "van1")
      .build();
    await game.p1.activate("zd");
    expect(await runMassPlay(game)).toEqual([]);
    expect(game.state("van1").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 3, mind: 0 } });
  });

  test("a DOMAINLESS unit's Accelerate costs [1] plus a Power of ANY domain (805.1.a.2) — the engine quotes and charges bare [1], so it enters ready without spending Power", async () => {
    // Expected prompt "Pay [1][A] …" and 1 energy + 1 Power gone. Actual: "Pay [1] …", Power untouched.
    const game = await board({ pool: ["nd"], energy: 4, body: 1 }).build();
    await game.p1.activate("zd");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 1, mind: 0 } });
    await runMassPlay(game);
    expect(game.state("nd").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, mind: 0 } });
  });

  // ---- (f) Legion inside one activation ------------------------------------------------------
  test("(f) Legion (812.1.c) is active for the SECOND unit of the mass play — the first one Finalized before its steps ran, even though it is all one activation", async () => {
    const second = await board({ pool: ["van1", "glory"] }).build();
    await second.p1.activate("zd");
    await runMassPlay(second);
    expect(second.state("glory").isBuffed).toBe(true);
    expect(second.state("glory").might).toBe(3);

    const only = await board({ pool: ["glory"] }).build();
    await only.p1.activate("zd");
    await runMassPlay(only);
    expect(only.state("glory").isBuffed).toBe(false); // nothing else Finalized by P1 this turn
    expect(only.state("glory").might).toBe(2);
  });
});
