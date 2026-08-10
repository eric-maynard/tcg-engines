/**
 * Interaction: Heisho, Shell of the World (ven-158-166) · Battlefield
 *     "Players ignore [Deflect] while paying for spells and abilities choosing something here."
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 · 2 Might — "[Deflect] (Opponents must pay [rainbow] to
 *     choose me with a spell or ability.)"
 *   × Falling Star (ogn-029-298) · Spell · Fury · 2+[fury][fury] · Action — "Deal 3 to a unit. / Deal 3 to a unit."
 *   (+ Voidreaver, unl-201-219, legend "Spend 1 XP, [Exhaust]: [Buff] a unit." for the 'and abilities' facet)
 *
 * Rules: 809.1.c (Deflect: +[1] Power for EACH TIME an opponent chooses me), 809.1.c.1 (any domain),
 * 809.1.d + 356.2.a.2 (mandatory additional cost), 809.3 (Deflect stays a characteristic), 355.16 / 358.5
 * (an unpayable choice is never presented / the play is undone).
 *
 * Question. Heisho on the map. P2: Poro A AT Heisho, Poro B in P2's base (variant: at the other
 * battlefield). P1 casts Falling Star.
 *   (a) both instructions on A → +0 (both choices are 'here'); A takes 6 and dies.
 *   (b) both on B → +2 (Heisho does nothing for base / another battlefield).
 *   (c) one on A, one on B → ADJUDICATED per-object (809.1.c "for each time they choose me" + 356.2.a.2):
 *       only the instalment for the object here is waived, so the split costs +1, not +0.
 *   (d) symmetric ('Players') and covers abilities: P2 targeting P1's Deflect unit at Heisho pays no pip;
 *       a legend ability choosing a unit here is exempt too.
 *   (e) A still HAS Deflect (809.3).
 *   (f) with exactly {2, fury 2}: (a) offered, (b) not offered/illegal, (c) not offered (needs the +1).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEISHO = "ven-158-166";
const POUTY_PORO = "ogn-013-298";
const FALLING_STAR = "ogn-029-298";
const VOIDREAVER = "unl-201-219"; // legend; ability #1 = "Spend 1 XP, [Exhaust]: [Buff] a unit."

/** Every target tuple a cast option offers (each entry = one legal `targets` value), each sorted. */
function targetTuples(game: Game, seat: "p1" | "p2", alias: string): string[][] {
  const field = game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets");
  return (field?.options ?? []).map((v) => [...((Array.isArray(v) ? v : [v]) as string[])].sort());
}

/**
 * P1's turn. Heisho (live text) and a plain 'other' battlefield, both P2's. P2: Poro A at Heisho, Poro B in
 * base (or at 'other'). P1: Falling Star + its base cost {2, fury 2} plus `extra` spare power.
 */
function board(extra: Record<string, number> = { calm: 2 }, poroBAt: "base" | "other" = "base") {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2, ...extra } })
    .battlefield("heisho", { controller: P2, def: HEISHO, inert: false })
    .battlefield("other", { controller: P2 })
    .unit(P2, "heisho", POUTY_PORO, "poroA")
    .unit(P2, poroBAt, POUTY_PORO, "poroB")
    .hand(P1, FALLING_STAR, "fs");
}

describe("(a) both instructions choose Poro A AT Heisho: Deflect ignored while paying → +0", () => {
  test("cast with 2 spare calm: only the printed 2 + [fury][fury] is spent (calm untouched); A takes 3+3 and dies", async () => {
    const game = await board({ calm: 2 }).build();
    await game.p1.cast("fs", { targets: ["poroA", "poroA"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 2, fury: 0 } });
    await game.settle();
    expect(game.zoneOf("poroA")).toBe("trash");
    expect(game.zoneOf("poroB")).toBe("base");
    expect(game.state("poroB").damage).toBe(0);
    expect(game.zoneOf("fs")).toBe("trash");
  });
});

describe("(b) both instructions choose Poro B away from Heisho: full Deflect, +1 per choice = +2 (809.1.c)", () => {
  test("B in P2's BASE: 2 + [fury][fury] + 2 power of any domain (calm 2 → 0); B dies, A untouched", async () => {
    const game = await board({ calm: 2 }).build();
    await game.p1.cast("fs", { targets: ["poroB", "poroB"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    await game.settle();
    expect(game.zoneOf("poroB")).toBe("trash");
    expect(game.zoneOf("poroA")).toBe("battlefield-heisho");
    expect(game.state("poroA").damage).toBe(0);
  });

  test("variant — B at the OTHER battlefield: Heisho's text is about 'here' only, so still +2", async () => {
    const game = await board({ calm: 2 }, "other").build();
    expect(game.locationOf("poroB")).toBe("other");
    await game.p1.cast("fs", { targets: ["poroB", "poroB"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    await game.settle();
    expect(game.zoneOf("poroB")).toBe("trash");
  });
});

describe("(c) one instruction on A (here), one on B (base): the exemption is per chosen object", () => {
  test("A's own choice is never taxed in the split: at most ONE extra power is taken, and both Poros die (3 each ≥ 2)", async () => {
    const game = await board({ calm: 2 }).build();
    await game.p1.cast("fs", { targets: ["poroA", "poroB"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(0);
    expect(game.p1.power("calm")).toBeGreaterThanOrEqual(1); // never +2
    await game.settle();
    expect(game.zoneOf("poroA")).toBe("trash");
    expect(game.zoneOf("poroB")).toBe("trash");
  });

  // ADJUDICATED — per-object reading. rule 809.1.c makes Deflect a cost that accrues separately "for each
  // time they choose me", and rule 356.2.a.2 treats each of those as its own mandatory additional cost, so
  // Heisho's waiver ("choosing something here") lifts only the instalments owed for objects here. The
  // whole-spell reading would let one choice at Heisho launder every other Deflect on the board.
  test("per-object reading: only the choice 'here' is exempt, B's pip is charged → exactly +1 (calm 2 → 1)", async () => {
    const game = await board({ calm: 2 }).build();
    await game.p1.cast("fs", { targets: ["poroA", "poroB"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1, fury: 0 } });
  });
});

describe("(d) 'Players … spells AND abilities' — symmetric and not spell-only", () => {
  /** Mirror: P2's turn; P1's Poro sits at Heisho (P1 controls it), another P1 Poro at home in base. */
  function mirror(p2Power: Record<string, number>) {
    return scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 2, ...p2Power } })
      .xp(P2, 1)
      .legend(P2, VOIDREAVER, "vr")
      .battlefield("heisho", { controller: P1, def: HEISHO, inert: false })
      .unit(P1, "heisho", POUTY_PORO, "mine")
      .unit(P1, "base", POUTY_PORO, "home")
      .hand(P2, FALLING_STAR, "fs2");
  }

  test("P2 casting Falling Star twice at P1's Deflect Poro AT Heisho pays no pip either (exact {2, fury 2} suffices); the P1 Poro in base is not even offered to P2 with that pool", async () => {
    const game = await mirror({}).build();
    const tuples = targetTuples(game, "p2", "fs2");
    expect(tuples).toContainEqual(["mine", "mine"]);
    expect(tuples.flat()).not.toContain("home");
    await game.p2.cast("fs2", { targets: ["mine", "mine"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("mine")).toBe("trash");
  });

  test("an ACTIVATED legend ability (Voidreaver: Spend 1 XP, Exhaust: Buff a unit) run by P2 with ZERO power may choose P1's Poro at Heisho — but not the one in P1's base", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 0 })
      .xp(P2, 1)
      .legend(P2, VOIDREAVER, "vr")
      .battlefield("heisho", { controller: P1, def: HEISHO, inert: false })
      .unit(P1, "heisho", POUTY_PORO, "mine")
      .unit(P1, "base", POUTY_PORO, "home")
      .build();
    const offered = game.p2.option("activate", "vr")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered).toContainEqual(["mine"]);
    expect(offered).not.toContainEqual(["home"]);
    const r = await game.p2.try((p) => p.activate("vr", 1, { targets: "home" }));
    expect(r.ok).toBe(false);
    await game.p2.activate("vr", 1, { targets: "mine" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("mine").isBuffed).toBe(true);
    expect(game.p2.xp()).toBe(0);
  });

  test("control: with 1 spare power the same legend ability MAY pick the base Poro — and that costs the pip (Deflect is only ignored 'here')", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 0, power: { mind: 1 } })
      .xp(P2, 1)
      .legend(P2, VOIDREAVER, "vr")
      .battlefield("heisho", { controller: P1, def: HEISHO, inert: false })
      .unit(P1, "heisho", POUTY_PORO, "mine")
      .unit(P1, "base", POUTY_PORO, "home")
      .build();
    await game.p2.activate("vr", 1, { targets: "home" });
    expect(game.p2.power("mind")).toBe(0);
    await game.settle();
    expect(game.state("home").isBuffed).toBe(true);
  });
});

describe("(e) Heisho only touches PAYING — Poro A still has the Deflect characteristic (809.3)", () => {
  test("both Poros list Deflect among their keywords, wherever they stand", async () => {
    const game = await board({}).build();
    expect(game.locationOf("poroA")).toBe("heisho");
    expect(game.state("poroA").keywords).toContain("Deflect");
    expect(game.state("poroB").keywords).toContain("Deflect");
  });
});

describe("(f) with EXACTLY {2, fury 2}: which assignments are even offered (355.16 / 358.5)", () => {
  test("(a) 'A twice' is offered and legal — pool ends at 0/0, A dies", async () => {
    const game = await board({}).build();
    expect(targetTuples(game, "p1", "fs")).toContainEqual(["poroA", "poroA"]);
    await game.p1.cast("fs", { targets: ["poroA", "poroA"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("poroA")).toBe("trash");
  });

  test("(b) 'B twice' (+2) — and even 'B once' (+1) — is unpayable: not offered, rejected if forced, nothing spent, spell stays in hand", async () => {
    const game = await board({}).build();
    const tuples = targetTuples(game, "p1", "fs");
    expect(tuples).not.toContainEqual(["poroB", "poroB"]);
    expect(tuples).not.toContainEqual(["poroB"]);
    await expect(game.p1.cast("fs", { targets: ["poroB", "poroB"] })).rejects.toThrow();
    await expect(game.p1.cast("fs", { targets: "poroB" })).rejects.toThrow();
    expect(game.zoneOf("fs")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 2 } });
    expect(game.state("poroB").damage).toBe(0);
  });

  // Follows the per-object reading adjudicated in (c) — B's own Deflect instalment (809.1.c) survives
  // Heisho, so the split costs +1 and rule 355.16 keeps it off the menu with an exact pool.
  test("per-object reading: the split A + B needs +1 and is therefore NOT offered / rejected with an exact pool", async () => {
    const game = await board({}).build();
    expect(targetTuples(game, "p1", "fs")).not.toContainEqual(["poroA", "poroB"]);
    const r = await game.p1.try((p) => p.cast("fs", { targets: ["poroA", "poroB"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("fs")).toBe("hand");
  });
});
