/**
 * Ruling 853e845abb1658ae — Shepherd's Heirloom (UNL-158 → unl-158-219, Equipment · Order · 2 · +2)
 *   "When you play this, gain 1 XP. [Equip] — Spend 1 XP"
 *   × Lucian, Merciless (SFD-113 → sfd-113-221, Champion · Body · 3 · 3 Might) "[Weaponmaster] (When you play me, you may
 *     [Equip] one of your Equipment to me for [rainbow] less, even if it's already attached.) …"
 *
 * Q: Heirloom already on board, I play Lucian with 0 XP — can Weaponmaster equip the Heirloom anyway?
 * A: No. Weaponmaster only discounts the [A] (Power) part of an Equip cost; "Spend 1 XP" has no [A], so it must be paid in
 *    full, and at 0 XP it can't be — the Heirloom stays put. If instead the Heirloom is PLAYED first (its trigger gives 1 XP)
 *    and Lucian follows, Weaponmaster can spend that 1 XP and attach it.
 * Rules: 821.1.c.3 (non-[A] Equip costs are not reduced), 821.1.c.5 (unpayable → stays where it is), 730.2 (Spend XP).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HEIRLOOM = "unl-158-219";
const LUCIAN = "sfd-113-221";

describe("Ruling 853e845abb1658ae — Weaponmaster can't dodge Shepherd's Heirloom's 'Spend 1 XP' Equip cost", () => {
  // BUG: Weaponmaster treats the Heirloom's "Spend 1 XP" Equip cost as fully waived — at 0 XP the Heirloom is offered and
  // attaches to Lucian for free. Expected (821.1.c.3 / 821.1.c.5): the XP cost is not [A], can't be paid, Heirloom stays.
  test("engine lets Weaponmaster attach the Heirloom at 0 XP. Heirloom on the board, P1 at 0 XP (plenty of energy/power): playing Lucian must NOT get the Heirloom attached — it stays unattached, Lucian stays 3, XP stays 0", async () => {
    const game = await scenario()
      .xp(P1, 0)
      .resources(P1, { energy: 6, power: { body: 2, order: 2, rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Wolf" }, "wolf")
      .gear(P1, HEIRLOOM, "heir")
      .hand(P1, LUCIAN, "lucian")
      .build();
    expect(game.state("heir").attachedTo).toBeUndefined();
    await game.p1.play("lucian");
    expect(game.p1.energy()).toBe(3);
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      // If a Weaponmaster prompt appears at all, the Heirloom must not be a payable choice (821.1.c.5): trying it fails
      // or leaves it where it is.
      const offered = d.options.map((o) => o.card ?? o.key);
      if (offered.includes("heir")) {
        await game.p1.try((p) => p.pick("heir"));
      } else {
        await game.p1.decline();
      }
    }
    await game.settle();
    expect(game.zoneOf("lucian")).toBe("base");
    expect(game.state("heir").attachedTo).toBeUndefined();
    expect(game.state("lucian")).toMatchObject({ attachments: [], might: 3 });
    expect(game.p1.xp()).toBe(0);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // BUG: the attach happens, but Weaponmaster never spends the 1 XP (XP stays 1). Expected: 1 → 0 (only [A] is discounted).
  test("engine's Weaponmaster does not spend the XP. The sequence that works: play the Heirloom first (2 energy; its trigger resolves → 1 XP), THEN play Lucian — Weaponmaster offers the Heirloom, spending that 1 XP attaches it (Lucian 5, XP back to 0)", async () => {
    const game = await scenario()
      .xp(P1, 0)
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Wolf" }, "wolf")
      .hand(P1, HEIRLOOM, "heir")
      .hand(P1, LUCIAN, "lucian")
      .build();
    await game.p1.play("heir");
    expect(game.p1.energy()).toBe(3);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "heir", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.p1.xp()).toBe(1); // "When you play this, gain 1 XP"
    expect(game.state("heir")).toMatchObject({ attachedTo: undefined, zone: "base" });

    await game.p1.play("lucian");
    expect(game.p1.energy()).toBe(0);
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 }); // Weaponmaster: "you may"
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toContain("heir");
    await game.p1.pick("heir");
    await game.settle();
    expect(game.state("heir").attachedTo).toBe("lucian");
    expect(game.state("lucian")).toMatchObject({ attachments: ["heir"], baseMight: 3, might: 5 });
    expect(game.p1.xp()).toBe(0); // the 1 XP was SPENT — Weaponmaster did not waive it
    expect(game.violations()).toEqual([]);
  });

  // BUG: same — the banked XP is not spent by the Weaponmaster equip.
  test("engine's Weaponmaster does not spend the XP. Control: with 1 XP already banked and the Heirloom on board, Weaponmaster on Lucian's play does offer it and spends exactly that XP (1 → 0)", async () => {
    const game = await scenario()
      .xp(P1, 1)
      .resources(P1, { energy: 3 })
      .gear(P1, HEIRLOOM, "heir")
      .hand(P1, LUCIAN, "lucian")
      .build();
    await game.p1.play("lucian");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toContain("heir");
    await game.p1.pick("heir");
    await game.settle();
    expect(game.state("heir").attachedTo).toBe("lucian");
    expect(game.state("lucian").might).toBe(5);
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });
});
