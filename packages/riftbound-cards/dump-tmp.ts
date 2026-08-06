import { getAllCards } from "./src/data/all-cards";
const ids = process.argv.slice(2);
const all = getAllCards();
for (const id of ids) { const c = all.find((x:any)=>x.id===id); console.log("=== "+id, JSON.stringify({name:c?.name, energyCost:(c as any)?.energyCost, powerCost:(c as any)?.powerCost, might:(c as any)?.might, abilities:c?.abilities, text:(c as any)?.rulesText}, null, 0)); }
