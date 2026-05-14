import { getAllCards } from "@tcg/riftbound-cards";

const cards = getAllCards();
for (const c of cards) {
  const abilities = (c as any).abilities ?? [];
  for (const a of abilities) {
    const t = a.effect?.target;
    if (!t) {continue;}
    if (t.location === "deck" || t.from === "deck" || a.effect?.from === "deck") {
      console.log(`${c.id} ${c.name} cardType=${c.cardType} ability=${a.type} target=`, JSON.stringify(t).slice(0, 200));
    }
  }
}
