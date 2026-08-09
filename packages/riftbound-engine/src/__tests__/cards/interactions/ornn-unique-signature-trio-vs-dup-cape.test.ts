/**
 * Interaction: Fire Below the Mountain (sfd-189-221, Ornn legend, Calm/Mind)
 *   × Forgefire Cape      (sfd-190-221) — Equipment · Calm/Mind · [Unique] · Ornn Signature
 *   × Rabadon's Deathcrown (sfd-191-221) — Equipment · Calm/Mind · [Unique] · Ornn Signature
 *   × Shurelya's Requiem   (sfd-192-221) — Equipment · Calm/Mind · [Unique] · Ornn Signature
 *   (+ Nine-Tailed Fox ogn-255-298 / Ahri, Alluring ogn-066-298 for the wrong-legend side,
 *      Ornn, Blacksmith sfd-058-221 for the in-game side)
 *
 * Rules: 825.1/825.3 Unique is a Deck Constraint Permission only; 825.3.a one card of a given
 * Unique name per deck; 825.3.b Signature+Unique → any combination of three Signature cards but
 * still one of each Unique name; 825.4 no gameplay effect; 825.5 still a checkable characteristic.
 * 103.2.d / 103.2.d.1 at most 3 Signature cards total; 103.2.d.2 every Signature card must carry the
 * legend's Champion tag; 103.1.b.4 a two-Domain card needs BOTH domains in the identity (Calm/Mind
 * fits both Ornn and Ahri legends, so domain identity never masks the signature check here).
 *
 * Question: A 1/1/1 trio — legal? B 2 Cape + 1 Deathcrown (3 signatures) — Unique error even though
 * 103.2.d passes? C Cape + Deathcrown + 2 Requiem — BOTH the Unique error and the 4-signature error?
 * D one Cape in an Ahri Calm/Mind deck — tag mismatch? In game: does Unique stop Ornn, Blacksmith
 * from drawing a second Cape off the top of the deck while one is already on the board? (No.)
 */
import { describe, expect, test } from "bun:test";
import type { CardDefLike } from "../../../harness";
import { P1, loadDefaultCardPool, scenario } from "../../../harness";
import { validateDeck } from "../../../validators/deck-validators";

const FIRE_BELOW = "sfd-189-221"; // Ornn legend, calm/mind
const CAPE = "sfd-190-221";
const DEATHCROWN = "sfd-191-221";
const REQUIEM = "sfd-192-221";
const ORNN_BLACKSMITH = "sfd-058-221"; // Ornn champion unit (calm)
const NINE_TAILED_FOX = "ogn-255-298"; // Ahri legend, calm/mind
const AHRI_ALLURING = "ogn-066-298"; // Ahri champion unit (calm)

const SIGNATURE_NAMES = new Set(["Forgefire Cape", "Rabadon's Deathcrown", "Shurelya's Requiem"]);

/** A 40-card deck: the given signature cards + 3-ofs of plain single-domain calm/mind cards. */
async function deck(legendId: string, championId: string, signatureIds: readonly string[]) {
  const pool = await loadDefaultCardPool();
  const get = (id: string) => pool.get(id) as CardDefLike;
  const seen = new Set<string>();
  const plain = pool
    .all()
    .filter(
      (c) =>
        (c.cardType === "unit" || c.cardType === "spell") &&
        (c.domain === "calm" || c.domain === "mind") &&
        c.isChampion !== true &&
        (c.tags ?? []).length === 0 &&
        !SIGNATURE_NAMES.has(c.name ?? ""),
    )
    .filter((c) => (seen.has(c.name ?? "") ? false : Boolean(seen.add(c.name ?? ""))));
  const signatures = signatureIds.map(get);
  const fillerCount = 40 - signatures.length;
  const filler = plain.flatMap((c) => [c, c, c]).slice(0, fillerCount);
  expect(filler).toHaveLength(fillerCount);
  const rune = pool.all().find((c) => c.cardType === "rune" && c.domain === "calm") as CardDefLike;
  const battlefields = pool
    .all()
    .filter((c) => c.cardType === "battlefield" && c.domain === undefined)
    .slice(0, 3);
  return validateDeck({
    battlefields,
    chosenChampion: get(championId),
    legend: get(legendId),
    mainDeck: [...signatures, ...filler],
    mode: "duel",
    runeDeck: Array.from({ length: 12 }, () => rune),
  } as never);
}

const codes = (r: { errors: readonly { code: string }[] }) => r.errors.map((e) => e.code);

describe("Ornn Signature trio × [Unique] × 103.2.d — deck construction and (non-)gameplay effect", () => {
  test("Side A: 1 Cape + 1 Deathcrown + 1 Requiem under Fire Below the Mountain is LEGAL (825.3.b: three signatures, one of each Unique name)", async () => {
    const r = await deck(FIRE_BELOW, ORNN_BLACKSMITH, [CAPE, DEATHCROWN, REQUIEM]);
    expect(r).toEqual({ errors: [], valid: true });
  });

  test("Side B: 2 Cape + 1 Deathcrown is ILLEGAL — 825.3.a Unique error names Forgefire Cape, even though the 3-signature total (103.2.d) and 3-per-name (103.2.b) limits pass", async () => {
    const r = await deck(FIRE_BELOW, ORNN_BLACKSMITH, [CAPE, CAPE, DEATHCROWN]);
    expect(r.valid).toBe(false);
    expect(codes(r)).toContain("TOO_MANY_UNIQUE_COPIES");
    expect(codes(r)).not.toContain("TOO_MANY_SIGNATURE_CARDS");
    expect(codes(r)).not.toContain("TOO_MANY_COPIES");
    const unique = r.errors.filter((e) => e.code === "TOO_MANY_UNIQUE_COPIES");
    expect(unique).toHaveLength(1);
    expect(unique[0]?.message).toContain("Forgefire Cape");
    expect(unique[0]?.message).not.toContain("Rabadon's Deathcrown");
  });

  test("Side C (Unique axis): Cape + Deathcrown + 2 Requiem is ILLEGAL — the 825.3.a error names Shurelya's Requiem only", async () => {
    const r = await deck(FIRE_BELOW, ORNN_BLACKSMITH, [CAPE, DEATHCROWN, REQUIEM, REQUIEM]);
    expect(r.valid).toBe(false);
    const unique = r.errors.filter((e) => e.code === "TOO_MANY_UNIQUE_COPIES");
    expect(unique).toHaveLength(1);
    expect(unique[0]?.message).toContain("Shurelya's Requiem");
  });

  // BUG — expected (103.2.d.1): four Ornn Signature cards is a second, independent violation reported
  // alongside the Unique one. Actual: sfd-190/191/192 carry neither `isSignature` nor `tags: ["Ornn"]`,
  // so the validator counts 0 signature cards and only the Unique error surfaces.
  test("Side C (Signature axis) — 4 Signature cards must ALSO raise TOO_MANY_SIGNATURE_CARDS (103.2.d.1); the data never marks Ornn's equipment as Signature/Ornn-tagged", async () => {
    const r = await deck(FIRE_BELOW, ORNN_BLACKSMITH, [CAPE, DEATHCROWN, REQUIEM, REQUIEM]);
    expect(codes(r)).toContain("TOO_MANY_UNIQUE_COPIES");
    expect(codes(r)).toContain("TOO_MANY_SIGNATURE_CARDS");
    expect(new Set(codes(r))).toEqual(new Set(["TOO_MANY_UNIQUE_COPIES", "TOO_MANY_SIGNATURE_CARDS"]));
  });

  // BUG — expected (103.2.d.2): a single Forgefire Cape in a Nine-Tailed Fox (Ahri) deck is illegal — the
  // domains fit (calm/mind ⊆ calm/mind, 103.1.b.4) and Unique is satisfied, but its Signature tag is Ornn ≠ Ahri.
  // Actual: the Cape has no isSignature/tags in the data, so validateSignatureTags skips it and the deck is accepted.
  test("Side D — one Forgefire Cape in an Ahri Calm/Mind deck must be rejected with SIGNATURE_TAG_MISMATCH (103.2.d.2)", async () => {
    const control = await deck(NINE_TAILED_FOX, AHRI_ALLURING, []);
    expect(control).toEqual({ errors: [], valid: true }); // the shell itself is a legal Ahri deck
    const r = await deck(NINE_TAILED_FOX, AHRI_ALLURING, [CAPE]);
    expect(r.valid).toBe(false);
    expect(codes(r)).toEqual(["SIGNATURE_TAG_MISMATCH"]);
    expect(r.errors[0]?.message).toContain("Forgefire Cape");
  });

  // BUG — expected: the three Ornn equipment are Signature cards tagged Ornn (that is what makes 103.2.d apply
  // to them at all). Actual: `isSignature` and `tags` are absent on all three definitions.
  test("card data — Forgefire Cape / Rabadon's Deathcrown / Shurelya's Requiem are flagged isSignature with Champion tag Ornn", async () => {
    const pool = await loadDefaultCardPool();
    for (const id of [CAPE, DEATHCROWN, REQUIEM]) {
      const def = pool.get(id);
      expect(def).toMatchObject({ isSignature: true, tags: expect.arrayContaining(["Ornn"]) });
    }
  });

  test("825.5: on the table Unique is still a readable characteristic — each of the three prints the Unique keyword", async () => {
    const game = await scenario().gear(P1, CAPE, "cape").gear(P1, DEATHCROWN, "crown").gear(P1, REQUIEM, "requiem").build();
    for (const id of ["cape", "crown", "requiem"]) {
      expect(game.state(id).keywords).toContain("Unique");
      expect(game.state(id).cardType).toBe("equipment");
    }
  });

  test("825.4: Unique does nothing in game — with a Cape already on the board, Ornn, Blacksmith still offers and draws a SECOND Cape from the top 4", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { calm: 1 } })
      .gear(P1, CAPE, "capeOnBoard")
      .hand(P1, ORNN_BLACKSMITH, "ornn")
      .deck(P1, ["ogn-175-298", CAPE, "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["u1", "cape2", "u3", "u4", "fifth"])
      .build();
    await game.p1.play("ornn");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(offered).toContain("cape2");
    await game.p1.pick("cape2");
    await game.settle();
    expect(game.p1.hand()).toEqual(["cape2"]);
    expect(game.zoneOf("capeOnBoard")).toBe("base");
    expect(game.p1.deck()[0]).toBe("fifth");
    expect(game.violations()).toEqual([]);
  });
});
