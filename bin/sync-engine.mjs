// Salin mesin plugin ke <workspace>/Engine tanpa menyentuh data workspace (pengganti rsync --delete, tanpa dependensi).
// Pemakaian: node bin/sync-engine.mjs <plugin>/engine <workspace>/Engine
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const [src, dst] = process.argv.slice(2).map((p) => path.resolve(p));
if (!src || !dst || !existsSync(src)) throw new Error("Pemakaian: node sync-engine.mjs <src> <dst>");
// milik workspace: tidak pernah disalin dari plugin dan tidak pernah dihapus
const KEEP = ["node_modules", ".venv", "work", "config.local.json", ".env", ".deps-npm", ".deps-py", "src/pop/custom", "voices", "public/brand", "public/audio", "public/media", "public/sfx/eleven"];
const kept = (rel) => rel.split(path.sep).includes(".DS_Store") || KEEP.some((k) => rel === k || rel.startsWith(k + "/"));

let copied = 0;
let removed = 0;
// telusuri pohon `root`; folder milik workspace (node_modules, .venv, ...) tidak dimasuki sama sekali
const walk = (dir, fn, root = dir) => {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, d.name);
    if (kept(path.relative(root, abs))) continue;
    fn(abs, d);
    if (d.isDirectory() && !d.isSymbolicLink() && existsSync(abs)) walk(abs, fn, root);
  }
};
// 1) salin semua file plugin (kecuali yang milik workspace)
walk(src, (abs, d) => {
  const rel = path.relative(src, abs);
  if (kept(rel) || d.isDirectory()) return;
  const out = path.join(dst, rel);
  mkdirSync(path.dirname(out), { recursive: true });
  // ukuran beda -> salin; ukuran sama tetapi waktu beda -> bandingkan isinya (mtime tidak selalu tersalin persis)
  const same = existsSync(out) && statSync(out).size === statSync(abs).size &&
    (Math.abs(statSync(out).mtimeMs - statSync(abs).mtimeMs) < 1 || readFileSync(out).equals(readFileSync(abs)));
  if (!same) {
    cpSync(abs, out, { preserveTimestamps: true });
    copied++;
  }
});
// 2) hapus file mesin lama yang tidak ada lagi di plugin (kecuali milik workspace)
if (existsSync(dst))
  walk(dst, (abs, d) => {
    const rel = path.relative(dst, abs);
    if (kept(rel) || !existsSync(abs)) return;
    if (!existsSync(path.join(src, rel))) {
      rmSync(abs, { recursive: true, force: true });
      removed++;
    }
  });
// 3) folder milik workspace + contoh scene Pop
mkdirSync(path.join(dst, "src/pop/custom"), { recursive: true });
mkdirSync(path.join(dst, "voices"), { recursive: true });
const ex = path.join(dst, "src/pop/custom/example.tsx");
if (!existsSync(ex)) cpSync(path.join(src, "src/pop/custom/example.tsx"), ex);
console.log(`  OK    ${copied} file diperbarui, ${removed} file usang dihapus`);
