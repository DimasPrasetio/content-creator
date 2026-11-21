// Jembatan ke Higgsfield lewat CLI resmi `higgsfield` (github.com/higgsfield-ai/cli, MIT; dipasang otomatis oleh setup).
// Login sekali per komputer: `higgsfield auth login` (OAuth di browser). Token disimpan CLI di folder pengguna, tidak pernah
// di workspace/repo. Semua generate memakai KREDIT paket Higgsfield (paket "unlimited" tidak berlaku untuk pemakaian otomatis).
//
// HIGGSFIELD_BIN = path CLI lain (mis. stub untuk selftest). Format JSON CLI tidak dibakukan, jadi pembacaan hasil dibuat
// longgar: URL hasil, id job, status, dan angka kredit dicari di kunci yang lazim (url/result_url/output_url/results[]...).
import { execFileSync } from "node:child_process";
import { config } from "./lib.mjs";

export const bin = () => process.env.HIGGSFIELD_BIN || config().higgsfield?.bin || "higgsfield";

export class HiggsError extends Error {}

/** Jalankan CLI dengan --json; kembalikan objek JSON (atau teks bila bukan JSON). */
export const hf = (args, { timeoutMs = 30 * 60 * 1000 } = {}) => {
  let out;
  try {
    out = execFileSync(bin(), [...args, "--json", "--no-color"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs, maxBuffer: 64 << 20 });
  } catch (e) {
    if (e.code === "ENOENT") throw new HiggsError("CLI higgsfield belum terpasang: jalankan ulang /content-creator:setup");
    const msg = `${e.stderr ?? ""}${e.stdout ?? ""}`.trim() || e.message;
    if (/not authenticated|session expired|unauthori[sz]ed|no workspace selected|401/i.test(msg))
      throw new HiggsError(`belum login Higgsfield (${msg.split("\n")[0]}): jalankan sekali di terminal \`higgsfield auth login\``);
    if (/insufficient|not enough credits|balance/i.test(msg)) throw new HiggsError(`kredit Higgsfield tidak cukup: ${msg.split("\n")[0]}`);
    throw new HiggsError(msg.split("\n").slice(0, 4).join(" | "));
  }
  const t = out.trim();
  try {
    return JSON.parse(t);
  } catch {
    // beberapa perintah mencetak baris log sebelum JSON
    const i = t.search(/[[{]/);
    if (i >= 0)
      try {
        return JSON.parse(t.slice(i));
      } catch {}
    return t;
  }
};

/** Cari nilai pertama yang lolos `test` di objek bersarang (BFS, kunci prioritas lebih dulu). */
const find = (o, test, keys = []) => {
  const q = [o];
  while (q.length) {
    const x = q.shift();
    if (x && typeof x === "object") {
      for (const k of keys) if (k in x && test(x[k], k)) return x[k];
      for (const [k, v] of Object.entries(x)) {
        if (test(v, k)) return v;
        if (v && typeof v === "object") q.push(v);
      }
    }
  }
  return undefined;
};

const isUrl = (v) => typeof v === "string" && /^(https?|file):\/\/\S+$/.test(v); // file:// hanya dari stub selftest
const MEDIA = /\.(mp4|mov|webm|png|jpe?g|webp|gif|svg|wav|mp3|m4a|glb)(\?|$)/i;

/** Semua URL hasil (media) dari respons generate create/get, urutan sesuai respons. */
export const resultUrls = (o) => {
  if (isUrl(o)) return [o];
  if (typeof o === "string") return [...o.matchAll(/https?:\/\/\S+/g)].map((m) => m[0]);
  const urls = [];
  const walk = (x, k = "") => {
    if (isUrl(x)) {
      if (MEDIA.test(x) || /url|result|output|media|file|raw/i.test(k)) urls.push(x);
    } else if (Array.isArray(x)) x.forEach((v) => walk(v, k));
    else if (x && typeof x === "object") for (const [kk, v] of Object.entries(x)) if (!/thumb|preview|avatar|input|reference|upload/i.test(kk)) walk(v, kk);
  };
  walk(o);
  return [...new Set(urls)];
};

export const jobId = (o) => (typeof o === "object" ? find(o, (v, k) => /^(job_?id|id)$/i.test(k) && typeof v === "string", ["job_id", "id"]) : undefined);
export const jobStatus = (o) => (typeof o === "object" ? find(o, (v, k) => /^status$/i.test(k) && typeof v === "string", ["status"]) : undefined);

/** Angka kredit dari respons cost / status. */
export const creditsOf = (o) => {
  if (typeof o === "number") return o;
  if (typeof o === "string") {
    const m = o.match(/(\d+(?:[.,]\d+)?)\s*credits?/i) ?? o.match(/(\d+(?:[.,]\d+)?)/);
    return m ? Number(m[1].replace(",", ".")) : NaN;
  }
  const v = find(o, (v, k) => typeof v === "number" && /^(credits?|cost|total(_credits)?|price|amount|estimated(_credits|_cost)?|available(_credits)?|balance)$/i.test(k),
    ["credits", "cost", "total_credits", "estimated_credits", "available_credits", "balance"]);
  return typeof v === "number" ? v : NaN;
};

/** Status akun: {ok, email, plan, credits, error}. Tidak memakai kredit. */
export const account = () => {
  try {
    const a = hf(["account", "status"], { timeoutMs: 30000 });
    if (typeof a === "string") {
      // "<email> — <plan> plan, <N> credits"
      const m = a.match(/(\S+@\S+)\s*[—-]\s*(.+?)\s+plan,\s*([\d.,]+)\s*credits/i);
      return { ok: true, email: m?.[1], plan: m?.[2], credits: m ? Number(m[3].replace(/,/g, "")) : creditsOf(a) };
    }
    return { ok: true, email: find(a, (v, k) => k === "email"), plan: find(a, (v, k) => /^plan(_name)?$/i.test(k) && typeof v === "string"), credits: creditsOf(a) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

export const version = () => {
  try {
    return execFileSync(bin(), ["version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10000 }).trim().split(/\s+/)[1] ?? "?";
  } catch {
    return null;
  }
};
