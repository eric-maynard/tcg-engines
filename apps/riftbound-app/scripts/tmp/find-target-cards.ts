import { getAllCards } from "@tcg/riftbound-cards";

const cards = getAllCards();
const want = (a: any, ...path: string[]) => {
  let cur = a;
  for (const k of path) { cur = cur?.[k]; if (cur == null) {return undefined;} }
  return cur;
};

const lookup: Record<string, any[]> = {
  "card-generic": [],
  "card@deck": [],
  "card@hand": [],
  "card@trash": [],
  "gear@trash": [],
  "legend@trash": [],
  "permanent@trash": [],
  "rune": [],
  "spell@trash": [],
  "unit@trash": [],
};

for (const c of cards) {
  const abilities = (c as any).abilities ?? [];
  for (const a of abilities) {
    const t = a.effect?.target;
    if (!t) {continue;}
    const loc = t.location;
    const ty = t.type;
    if (ty === "rune") {lookup.rune.push(c);}
    else if (loc === "trash") {
      if (ty === "card") {lookup["card@trash"].push(c);}
      else if (ty === "spell") {lookup["spell@trash"].push(c);}
      else if (ty === "unit") {lookup["unit@trash"].push(c);}
      else if (ty === "gear") {lookup["gear@trash"].push(c);}
      else if (ty === "legend") {lookup["legend@trash"].push(c);}
      else if (ty === "permanent") {lookup["permanent@trash"].push(c);}
    } else if (loc === "hand" && ty === "card") {lookup["card@hand"].push(c);}
    else if (loc === "deck") {lookup["card@deck"].push(c);}
    else if (ty === "card" && !loc) {lookup["card-generic"].push(c);}
  }
}

for (const [k, v] of Object.entries(lookup)) {
  console.log(`\n=== ${k} (${v.length}) ===`);
  for (const c of v.slice(0, 4)) {
    console.log(`  ${c.id} ${c.name} cardType=${c.cardType} timing=${c.timing ?? '-'}`);
    const rt = c.rulesText?.split("\n")[0] ?? "";
    console.log(`    "${rt}"`);
  }
}
