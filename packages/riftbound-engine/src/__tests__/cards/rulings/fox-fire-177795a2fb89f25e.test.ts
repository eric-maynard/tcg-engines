/**
 * Ruling 177795a2fb89f25e — Fox-Fire (OGN-256 → ogn-256-298) · Calm/Mind · [Hidden] [Action] · [3]
 *     "Kill any number of units at a battlefield with total Might 4 or less."
 *
 * Q: How does Fox-Fire's targeting work — is "total Might 4 or less" the COMBINED Might of every chosen unit,
 *    and may the chosen units sit at more than one battlefield?
 * A: It is the sum: four 1-Might units, a 1 + a 3, two 2s … all legal, and choosing ZERO units is legal too.
 *    Played from hand it aims at a battlefield; played from Hidden every target must be at the battlefield it was
 *    hidden at (and it is then played for [0], the hide itself having cost [rainbow]).
 * Rules: 355.11 / 355.11.a (a group target with a requirement the GROUP must meet), 355.11.b (Fox-Fire is the CR's
 *        own worked example — "four 1 [M] Recruit tokens at a single battlefield"), 355.13 (zero is a number),
 *        811.1.b (hide for [A], later play ignoring the base cost), 811.1.d.2 (hidden ⇒ targets "here" only).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FOX_FIRE = "ogn-256-298";

/** Turn 2, P1 active with exactly [3]. P2's bf1 holds Recruits 1/1/1/1 plus a 3-Might Brute and a 2-Might Pair member. */
function fromHand() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Recruit A" }, "r1")
    .unit(P2, "bf1", { might: 1, name: "Recruit B" }, "r2")
    .unit(P2, "bf1", { might: 1, name: "Recruit C" }, "r3")
    .unit(P2, "bf1", { might: 1, name: "Recruit D" }, "r4")
    .unit(P2, "bf1", { might: 3, name: "Brute" }, "brute")
    .unit(P2, "bf1", { might: 2, name: "Pair X" }, "px")
    .unit(P2, "bf1", { might: 2, name: "Pair Y" }, "py")
    .hand(P1, FOX_FIRE, "fox");
}

/** Every legal target set the cast option exposes, each rendered as a sorted "a+b" key. */
async function legalSets(): Promise<string[]> {
  const game = await fromHand().build();
  const field = game.p1.option("cast", "fox")?.fields.find((f) => f.name === "targets");
  return (field?.options ?? []).map((o) => (Array.isArray(o) ? [...o].map(String).sort().join("+") : String(o)));
}

describe("Ruling 177795a2fb89f25e — Fox-Fire: 'total Might 4 or less' is the SUM over the whole chosen group", () => {
  test("four 1-Might units (1+1+1+1 = 4) are a legal group and all four die", async () => {
    expect(await legalSets()).toContain("r1+r2+r3+r4");
    const game = await fromHand().build();
    await game.p1.cast("fox", { targets: ["r1", "r2", "r3", "r4"] });
    await game.settle();
    for (const r of ["r1", "r2", "r3", "r4"]) {
      expect(game.zoneOf(r)).toBe("trash");
    }
    // Nothing outside the chosen group is touched.
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.zoneOf("px")).toBe("battlefield-bf1");
    expect(game.zoneOf("py")).toBe("battlefield-bf1");
    expect(game.zoneOf("fox")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("a 1-Might plus a 3-Might (1+3 = 4) is a legal group and both die", async () => {
    expect(await legalSets()).toContain("brute+r1");
    const game = await fromHand().build();
    await game.p1.cast("fox", { targets: ["r1", "brute"] });
    await game.settle();
    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("r2")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("two 2-Might units (2+2 = 4) are a legal group and both die", async () => {
    expect(await legalSets()).toContain("px+py");
    const game = await fromHand().build();
    await game.p1.cast("fox", { targets: ["px", "py"] });
    await game.settle();
    expect(game.zoneOf("px")).toBe("trash");
    expect(game.zoneOf("py")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("a group totalling 5 is NOT a legal choice — 2+3 and 1+1+1+1+1-worth sets are absent and forcing one is rejected", async () => {
    const sets = await legalSets();
    expect(sets).not.toContain("brute+px"); // 3 + 2 = 5
    expect(sets).not.toContain("brute+px+py"); // 3 + 2 + 2 = 7
    expect(sets).not.toContain("brute+r1+r2"); // 3 + 1 + 1 = 5
    const game = await fromHand().build();
    const r = await game.p1.try((p) => p.cast("fox", { targets: ["brute", "px"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("fox")).toBe("hand");
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.zoneOf("px")).toBe("battlefield-bf1");
  });

  test("'any number' includes ZERO: Fox-Fire may be cast choosing no unit at all — it resolves and nothing dies", async () => {
    expect(await legalSets()).toContain(""); // the empty group is offered (355.13)
    const game = await fromHand().build();
    await game.p1.cast("fox", { targets: [] });
    expect(game.p1.energy()).toBe(0); // still paid in full
    await game.settle();
    expect(game.zoneOf("fox")).toBe("trash");
    for (const c of ["r1", "r2", "r3", "r4", "brute", "px", "py"]) {
      expect(game.zoneOf(c)).toBe("battlefield-bf1");
    }
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 177795a2fb89f25e says "when played from hand, it can target units at any
  // battlefield(s)". CR 355.11.b's worked example is Fox-Fire itself and scopes the whole group to "a single
  // battlefield" ("… as long as those units are all located at the same battlefield"), matching the printed
  // "at a battlefield" — engine follows CR: a cross-battlefield group is never offered and is rejected.
  test("the group lives at ONE battlefield: a 1-Might at bf1 plus a 1-Might at bf2 (total 2) is still illegal", async () => {
    const game = await fromHand()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 1, name: "Far Recruit" }, "far")
      .build();
    const field = game.p1.option("cast", "fox")?.fields.find((f) => f.name === "targets");
    const sets = (field?.options ?? []).map((o) =>
      Array.isArray(o) ? [...o].map(String).sort().join("+") : String(o),
    );
    expect(sets).toContain("far"); // bf2 alone is fine
    expect(sets).toContain("r1+r2+r3+r4"); // bf1 alone is fine
    expect(sets).not.toContain("far+r1"); // but never both battlefields at once
    expect((await game.p1.try((p) => p.cast("fox", { targets: ["r1", "far"] }))).ok).toBe(false);
  });

  test("hiding Fox-Fire costs [rainbow] and no Energy (811.1.b — the later play then ignores its [3] base cost)", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5, name: "Keeper" }, "keeper")
      .hand(P1, FOX_FIRE, "fox")
      .build();
    await game.p1.hide("fox", "bf1");
    expect(game.zoneOf("fox")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("played from HIDDEN at bf1 for [0]: only bf1's units are offered, and the 1+3 = 4 group there dies", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 5, name: "Keeper" }, "keeper")
      .unit(P2, "bf1", { might: 1, name: "Near A" }, "nearA")
      .unit(P2, "bf1", { might: 3, name: "Near B" }, "nearB")
      .unit(P2, "bf2", { might: 1, name: "Far" }, "far")
      .facedown(P1, "bf1", FOX_FIRE, "fox")
      .build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // nothing to pay with — the play is free
    expect(game.p1.can("reveal", "fox")).toBe(true);
    const offered = new Set(
      (game.p1.option("reveal", "fox")?.fields.find((f) => f.name === "targets")?.options ?? [])
        .flatMap((o) => (Array.isArray(o) ? o : [o]))
        .map(String),
    );
    expect(offered.has("nearA")).toBe(true);
    expect(offered.has("nearB")).toBe(true);
    expect(offered.has("far")).toBe(false); // 811.1.d.2 — "here" only
    expect((await game.p1.try((p) => p.reveal("fox", { targets: ["far"] }))).ok).toBe(false);

    // The sum rule still applies at the hidden battlefield: 1 + 3 = 4 is legal and kills both, for [0].
    await game.p1.reveal("fox", { targets: ["nearA", "nearB"] });
    await game.settle();
    expect(game.zoneOf("nearA")).toBe("trash");
    expect(game.zoneOf("nearB")).toBe("trash");
    expect(game.zoneOf("far")).toBe("battlefield-bf2");
    expect(game.violations()).toEqual([]);
  });
});
