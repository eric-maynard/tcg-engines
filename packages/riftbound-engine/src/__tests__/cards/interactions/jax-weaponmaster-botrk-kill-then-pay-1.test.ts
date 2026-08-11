/**
 * Interaction: Jax, Unrelenting (sfd-119-221) "[Weaponmaster] (When you play me, you may [Equip] one of
 *   your Equipment to me for [rainbow] less, even if it's already attached.) / When you attach an
 *   Equipment to me, you may pay [1] to draw 1."
 *   × Blade of the Ruined King (sfd-178-221) "[Equip] — [order], Kill a friendly unit"
 *   × Hexdrinker (sfd-102-221) "[Equip] [body]" — already attached to another friendly unit.
 *
 * Question: the reminder says "you may" while the CR text reads mandatory — which is it? And is the
 * whole chain of elections surfaced separately: whether to use [Weaponmaster], which Equipment, which
 * friendly unit to kill for the Blade, and then Jax's own optional [1]?
 *
 * Rules: 821.1.c ([Weaponmaster]: [Equip] one of your Equipment for [rainbow] less, even if already
 * attached), 821.1.c.5 (an Equipment whose Equip cost cannot be paid simply stays where it is),
 * 821.1.c.6, 356.7 (a non-standard cost such as "Kill a friendly unit" is not reducible), 356.4.c
 * (costs are paid as the action is taken, before it takes effect), 355.16 + 357.3 (no choice that
 * deterministically produces an illegal action later), 355.10.c.1 (an optional cost inside an
 * instruction), 357.2, 725.3.
 *
 * Answer: [Weaponmaster] is OPTIONAL — the reminder text is authoritative.
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const JAX = "sfd-119-221";
const BOTRK = "sfd-178-221";
const HEXDRINKER = "sfd-102-221";

type Game = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;

/**
 * P1: Jax in hand (4 energy), the Blade loose in base, Hexdrinker already attached to "wearer"
 * (a vanilla 2 ⇒ 3 while it wears it), plus `pawns` more vanilla units. 6 energy = Jax's 4 plus one
 * spare [1] for his draw trigger. Jax himself costs 4 + [body], so the pool holds a SECOND [body] and
 * an [order] — the two pips the Equip costs would want — to show [Weaponmaster] never touches them.
 */
function board(pawns: number) {
  let s = scenario()
    .resources(P1, { energy: 6, power: { body: 2, order: 1 } })
    .gear(P1, BOTRK, "botrk")
    .unit(P1, "base", { might: 2, name: "Wearer" }, "wearer", { equippedWith: ["hex"] })
    .card("hex", { def: HEXDRINKER, meta: { attachedTo: "wearer" }, owner: P1, zone: "base" })
    .hand(P1, JAX, "jax");
  for (let i = 1; i <= pawns; i++) {
    s = s.unit(P1, "base", { might: 1, name: `Pawn${i}` }, `pawn${i}`);
  }
  return s;
}

/** Jax alone: the Blade and Hexdrinker are both loose, and P1 controls no other unit. */
function loneBoard() {
  return scenario()
    .resources(P1, { energy: 6, power: { body: 2, order: 1 } })
    .gear(P1, BOTRK, "botrk")
    .gear(P1, HEXDRINKER, "hex")
    .hand(P1, JAX, "jax");
}

/** Card ids currently offered by a pick decision. */
function picksOffered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? [...d.options.map((o) => o.card ?? o.key)].sort() : [];
}

describe("Jax, Unrelenting [Weaponmaster] → Blade of the Ruined King's kill → Jax's own [1]", () => {
  test("Decision 1 — [Weaponmaster] is OPTIONAL and lists BOTH Equipment, including the one already attached elsewhere (821.1.c)", async () => {
    const game = await board(2).build();
    await game.p1.play("jax");

    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", max: 1, seat: P1 });
    expect(d?.prompt).toContain("Weaponmaster");
    expect(d?.source?.cardId).toBe("jax");
    expect(picksOffered(game)).toEqual(["botrk", "hex"]);
    // Only Jax's own 4 has been spent — [Weaponmaster] has taken nothing yet.
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.resources().power).toEqual({ body: 1, order: 1 });
  });

  test("declining leaves Jax played and on the board and changes nothing else", async () => {
    const game = await board(1).build();
    await game.p1.play("jax");
    await game.p1.decline();
    await game.settle();

    expect(game.zoneOf("jax")).toBe("base");
    expect(game.state("jax").might).toBe(3);
    expect(game.state("botrk").attachedTo).toBeUndefined();
    expect(game.state("hex").attachedTo).toBe("wearer");
    expect(game.zoneOf("pawn1")).toBe("base");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.resources().power).toEqual({ body: 1, order: 1 });
    expect(game.p1.hand()).toEqual([]); // no draw — Jax's trigger needs an attach
    expect(game.violations()).toEqual([]);
  });

  test("Hexdrinker branch: [body] − [rainbow] = free; it is stripped off the wearer (3 → 2) and lands on Jax (3 → 4)", async () => {
    const game = await board(1).build();
    expect(game.state("wearer").might).toBe(3); // 2 + Hexdrinker's +1
    await game.p1.play("jax");
    await game.p1.pick("hex");
    await game.settle();

    expect(game.state("hex").attachedTo).toBe("jax");
    expect(game.state("jax")).toMatchObject({ attachments: ["hex"], might: 4 });
    expect(game.state("wearer")).toMatchObject({ attachments: [], might: 2 });
    // 821.1.c — the [body] pip is the whole Equip cost, and [rainbow] eats it: nothing was spent.
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.resources().power).toEqual({ body: 1, order: 1 });
  });

  test("Decision 2 — the Blade's [order] is shaved away but its KILL is not reducible (356.7): every eligible friendly unit is listed, Jax himself is not (355.16/357.3)", async () => {
    const game = await board(2).build();
    await game.p1.play("jax");
    await game.p1.pick("botrk");
    await game.settle();

    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", seat: P1 });
    expect(d?.source?.cardId).toBe("botrk");
    // Killing Jax would make the attach illegal, so he is not an eligible payment.
    expect(picksOffered(game)).toEqual(["pawn1", "pawn2", "wearer"]);
    // 821.1.c — the [order] pip was reduced away; no power and no extra energy left the pool.
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.resources().power).toEqual({ body: 1, order: 1 });

    await game.p1.pick("pawn1");
    expect(game.zoneOf("pawn1")).toBe("trash");
    expect(game.state("botrk").attachedTo).toBe("jax");
    expect(game.state("jax").might).toBe(7); // 3 + 4
  });

  test(
    "the Blade is attached to Jax only AFTER its kill cost is paid — rule 356.4.c/821.1.c.6 pay the cost first, then attach",
    async () => {
      // Expected: while the "kill a friendly unit" payment is still being chosen the Blade has not
      // moved — costs are paid as part of taking the action, before it takes effect.
      // Actual: the engine attaches on the [Weaponmaster] pick and only afterwards asks, as a
      // resolution-time target, which friendly unit dies.
      const game = await board(2).build();
      await game.p1.play("jax");
      await game.p1.pick("botrk");
      await game.settle();
      expect(game.decision()?.kind).toBe("pick"); // the kill payment is open
      expect(game.state("botrk").attachedTo).toBeUndefined();
      expect(game.state("jax").might).toBe(3);
    },
  );

  test("a single eligible unit makes the kill forced (402.2 auto-bind) — the wearer dies and drags Hexdrinker off with it", async () => {
    const game = await board(0).build(); // "wearer" is the only friendly unit besides Jax
    await game.p1.play("jax");
    await game.p1.pick("botrk");
    await game.settle();

    expect(game.zoneOf("wearer")).toBe("trash");
    expect(game.state("botrk").attachedTo).toBe("jax");
    expect(game.state("hex").attachedTo).toBeUndefined();
    expect(game.zoneOf("hex")).toBe("base");
    // Nothing but Jax's own 4 was spent for any of it.
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.resources().power).toEqual({ body: 1, order: 1 });
  });

  test("with NO other friendly unit the Blade's branch is unpayable and dropped (821.1.c.5) — Hexdrinker and decline survive, the prompt is not collapsed", async () => {
    const game = await loneBoard().build();
    await game.p1.play("jax");

    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(picksOffered(game)).toEqual(["hex"]);
    await expect(game.p1.pick("botrk")).rejects.toThrow();

    await game.p1.pick("hex");
    await game.settle();
    expect(game.state("hex").attachedTo).toBe("jax");
    expect(game.state("botrk").attachedTo).toBeUndefined();
    expect(game.zoneOf("botrk")).toBe("base"); // 821.1.c.5 — it simply stays where it is
  });

  test("Decision 3 — Jax's own 'you may pay [1] to draw 1' is a separate, independent election on the attach; accepting costs 1 and draws", async () => {
    const game = await board(1).build();
    await game.p1.play("jax");
    await game.p1.pick("hex");
    await game.settle();

    // DESIGN (FIXER-PRIMER "OPTIONAL / COSTED parts of a TRIGGERED ability", `cost-at-finalization`;
    // rules 383.3.b / 204.3.a): "you may pay [1] to draw 1" is a leading pay-cost, so the engine asks
    // it as a FIN opt-in yes/no — not as an in-instruction optional cost taken at resolution (355.10.c.1).
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    expect(d?.prompt).toContain("Pay [1]");
    expect(d?.source?.cardId).toBe("jax");

    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.state("hex").attachedTo).toBe("jax"); // the attach is not undone by the draw
  });

  test("Decision 3 fires on the Blade's attach too, and declining leaves the Equipment attached with no draw", async () => {
    const game = await board(1).build();
    await game.p1.play("jax");
    await game.p1.pick("botrk");
    await game.settle();
    await game.p1.pick("wearer"); // pay the kill

    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(2); // nothing paid
    expect(game.p1.hand()).toEqual([]); // nothing drawn
    expect(game.state("botrk").attachedTo).toBe("jax");
    expect(game.state("jax").might).toBe(7);
  });

  test("the three branches leave three different positions — decline / free Hexdrinker / free Blade plus a dead friendly unit", async () => {
    const declined = await board(1).build();
    await declined.p1.play("jax");
    await declined.p1.decline();
    await declined.settle();

    const hexed = await board(1).build();
    await hexed.p1.play("jax");
    await hexed.p1.pick("hex");
    await hexed.settle();
    await hexed.p1.no();
    await hexed.settle();

    const bladed = await board(1).build();
    await bladed.p1.play("jax");
    await bladed.p1.pick("botrk");
    await bladed.settle();
    await bladed.p1.pick("pawn1");
    await bladed.settle();
    await bladed.p1.no();
    await bladed.settle();

    // The equip itself is free in every branch — only Jax's 4 ever left the pool.
    for (const g of [declined, hexed, bladed]) {
      expect(g.p1.energy()).toBe(2);
      expect(g.p1.resources().power).toEqual({ body: 1, order: 1 });
      expect(g.p1.hand()).toEqual([]);
    }
    expect([declined.state("jax").might, hexed.state("jax").might, bladed.state("jax").might]).toEqual([3, 4, 7]);
    expect([declined.zoneOf("pawn1"), hexed.zoneOf("pawn1"), bladed.zoneOf("pawn1")]).toEqual(["base", "base", "trash"]);
    expect([declined.state("hex").attachedTo, hexed.state("hex").attachedTo, bladed.state("hex").attachedTo]).toEqual([
      "wearer",
      "jax",
      "wearer",
    ]);
  });
});
