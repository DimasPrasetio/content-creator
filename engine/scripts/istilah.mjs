// Cek istilah sebelum voice over: setiap singkatan (huruf kapital >= 2, mis. IPO, AOL, SOP) di narasi WAJIB punya
// cara baca yang sudah diputuskan di kamus pelafalan (config.json/config.local.json "pronounce" atau profil brand).
// Tanpa itu TTS menebak, dan tebakannya sering salah bahasa (IPO dibaca gaya Indonesia, padahal istilah Inggris).
//
//   npm run istilah -- <nama>          daftar istilah + usulan ejaan; exit 2 bila ada singkatan tanpa cara baca
//
// Cara memutuskan (agent, bukan mesin): pahami ARTI istilah dari kalimatnya → tentukan BAHASA asalnya → baru ejaannya.
//   - singkatan Inggris (IPO, AI, IT, CEO)  → nama huruf Inggris, ditulis agar dibaca benar oleh TTS berbahasa Indonesia
//   - singkatan Indonesia (SOP, KTP, DPR)   → nama huruf Indonesia
//   - singkatan yang dibaca sebagai kata (NASA, ASEAN) → petakan ke dirinya sendiri, mis. "NASA": "NASA"
// Ejaan yang sudah divalidasi pengguna menang atas usulan tabel di bawah. Ragu → audisi dulu (npm run voices -- --sample).
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { P, brandProfile, config, parseScript, resolveName } from "./lib.mjs";

// Nama huruf, ditulis supaya dibaca benar oleh voice berbahasa Indonesia (eleven_v4).
// Sumber: ejaan yang divalidasi pengguna (IT = "ay-tee", IPO = "ay-pi-o", SOP = "es-o-pe"); sisanya usulan.
export const LETTERS = {
  en: { A: "é", B: "bi", C: "si", D: "di", E: "i", F: "ef", G: "ji", H: "eich", I: "ay", J: "jei", K: "kei", L: "el", M: "em",
    N: "en", O: "o", P: "pi", Q: "kyu", R: "ar", S: "es", T: "ti", U: "yu", V: "vi", W: "dabel-yu", X: "eks", Y: "wai", Z: "zi" },
  id: { A: "a", B: "be", C: "ce", D: "de", E: "e", F: "ef", G: "ge", H: "ha", I: "i", J: "je", K: "ka", L: "el", M: "em",
    N: "en", O: "o", P: "pe", Q: "ki", R: "er", S: "es", T: "te", U: "u", V: "fe", W: "we", X: "eks", Y: "ye", Z: "zet" },
};
export const spell = (term, lang) => [...term].map((c) => LETTERS[lang][c] ?? c).filter((c) => c !== "&").join("-");

const ACRONYM = /(?<![\p{L}\p{N}])[A-Z][A-Z0-9&]*[A-Z0-9](?![\p{L}\p{N}])/gu;

/** Kamus gabungan: bawaan plugin < config.local.json < profil brand. */
export const lexiconFor = (profile) => ({ ...(config().pronounce ?? {}), ...(profile?.pronounce ?? {}) });

/** Cari singkatan di teks narasi (tag [ekspresi] diabaikan). */
export function findTerms(text, lexicon) {
  const clean = text.replace(/\[[^\]]*\]/g, " ");
  const sentences = clean.split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const terms = new Map();
  for (const s of sentences)
    for (const m of s.matchAll(ACRONYM)) {
      const t = m[0];
      if ((t.match(/[A-Z]/g) ?? []).length < 2) continue;
      if (!terms.has(t)) terms.set(t, { term: t, context: s, spoken: lexicon[t] ?? null });
    }
  return [...terms.values()];
}

export function report(terms, log = console.log) {
  const missing = terms.filter((t) => t.spoken == null);
  for (const t of terms.filter((x) => x.spoken != null)) log(`    OK  ${t.term} → "${t.spoken}"`);
  for (const t of missing) {
    log(`    !   ${t.term} belum punya cara baca · konteks: "${t.context}"`);
    log(`        usulan: Inggris "${spell(t.term, "en")}" · Indonesia "${spell(t.term, "id")}" · dibaca sebagai kata "${t.term}"`);
  }
  if (missing.length) {
    log("    Putuskan per istilah: arti dalam kalimat → bahasa asal → ejaan, lalu tulis ke \"pronounce\" profil brand");
    log("    (atau Engine/config.local.json agar berlaku di semua brand). Ragu → audisi dulu: npm run voices -- --sample.");
  }
  return missing;
}

/** Cek satu video. Mengembalikan daftar istilah yang belum punya cara baca. */
export function checkProject(name, { profileName, log = console.log } = {}) {
  const paths = P(name);
  const src = existsSync(paths.plain) ? readFileSync(paths.plain, "utf8") : null;
  const md = existsSync(paths.script) ? readFileSync(paths.script, "utf8") : null;
  if (!src && !md) throw new Error(`Naskah tidak ditemukan: ${paths.script}`);
  const parsed = md ? parseScript(md) : { meta: {}, scenes: [] };
  const text = src ?? parsed.scenes.map((s) => s.text).join("\n\n");
  const slug = profileName || parsed.meta.profile;
  const terms = findTerms(text, lexiconFor(brandProfile(slug)));
  log(`    ${terms.length} singkatan di narasi${slug ? ` (kamus: plugin + workspace + profil ${slug})` : ""}`);
  return report(terms, log);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const name = resolveName(args.find((a) => !a.startsWith("--")));
  const profileName = args.find((a) => a.startsWith("--profile="))?.slice("--profile=".length);
  const missing = checkProject(name, { profileName });
  process.exit(missing.length ? 2 : 0);
}
