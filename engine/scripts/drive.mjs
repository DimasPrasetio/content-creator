// Unggah hasil video yang SUDAH DISETUJUI pengguna ke Google Drive: <drive.rootFolderId>/<brand>/<nama>/
// (video, thumbnail.jpg, caption.txt, dan format lain bila ada). Isi sama persis dengan Result/<brand>/<nama>/.
//
//   npm run drive -- <nama>              unggah lewat rclone (remote "gdrive", root = folder Drive tujuan di config.local.json).
//                                        File yang isinya sama tidak diunggah ulang (cek checksum); render ulang
//                                        menimpa file lama. Hasil (ID & link folder) dicatat di Projects/<nama>/drive.json.
//   npm run drive -- <nama> --manifest   cadangan tanpa rclone: daftar file + referensi sha256 untuk konektor
//                                        Google Drive (batas 10 MB per file, jadi video biasanya tidak muat).
// Persiapan sekali: brew install rclone && rclone config create gdrive drive scope=drive root_folder_id=<id>
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { P, ROOT, config, readJson, resolveName } from "./lib.mjs";

const args = process.argv.slice(2);
const name = resolveName(args.find((a) => !a.startsWith("--")));
const p = P(name);
const cfg = config().drive ?? {};
const REMOTE = cfg.remote ?? "gdrive";
if (!cfg.rootFolderId) throw new Error('Unggah Drive belum diatur: isi "drive.rootFolderId" di Engine/config.local.json (lihat /content-creator:setup)');
if (!existsSync(p.resultDir)) throw new Error(`Folder hasil belum ada: ${path.relative(ROOT, p.resultDir)}`);
const recPath = path.join(p.dir, "drive.json");
const prev = readJson(recPath, {});
const MIME = { ".mp4": "video/mp4", ".jpg": "image/jpeg", ".png": "image/png", ".txt": "text/plain" };
const local = readdirSync(p.resultDir).filter((f) => MIME[path.extname(f)] && !f.startsWith(".")).sort();
const missing = ["thumbnail.jpg", "caption.txt", `${name}.mp4`].filter((f) => !local.includes(f));
if (missing.length) throw new Error(`Hasil belum lengkap, kurang: ${missing.join(", ")} (jalankan render + npm run posting)`);

if (args.includes("--manifest")) {
  const files = local.map((f) => {
    const abs = path.join(p.resultDir, f);
    const sha256 = createHash("sha256").update(readFileSync(abs)).digest("hex");
    return { name: f, mime: MIME[path.extname(f)], bytes: readFileSync(abs).length, ref: `sha256:${sha256}:${abs}`, sha256 };
  });
  console.log(JSON.stringify({ root: cfg.rootFolderId, brand: p.brand, folder: name, brandFolderId: prev.brandFolderId ?? null, folderId: prev.folderId ?? null, files }, null, 2));
  process.exit(0);
}

const rclone = (a, opt = {}) => execFileSync("rclone", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opt });
let remotes = "";
try {
  remotes = rclone(["listremotes"]);
} catch {
  throw new Error("rclone belum terpasang: brew install rclone");
}
if (!remotes.split("\n").includes(`${REMOTE}:`))
  throw new Error(`Remote "${REMOTE}" belum ada: rclone config create ${REMOTE} drive scope=drive root_folder_id=${cfg.rootFolderId}`);

const dest = `${REMOTE}:${p.brand}/${name}`;
console.log(`Unggah ${path.relative(ROOT, p.resultDir)}/ -> Google Drive ${cfg.rootName ?? "root"}/${p.brand}/${name}/`);
const r = spawnSync("rclone", ["copy", p.resultDir, dest, "--checksum", "--exclude", ".*", "--drive-chunk-size", "16M", "--stats-one-line", "--stats", "5s", "-v"], {
  encoding: "utf8",
  stdio: ["ignore", "inherit", "pipe"],
});
const log = r.stderr ?? "";
for (const l of log.split("\n").filter((x) => /Copied|Updated|Transferred:|ERROR/.test(x))) console.log("  " + l.replace(/^.*?(INFO|ERROR)\s*:\s*/, ""));
if (r.status !== 0) throw new Error(`rclone gagal (exit ${r.status})`);

// catat ID & link
const ls = JSON.parse(rclone(["lsjson", dest, "--hash"]));
const dirs = JSON.parse(rclone(["lsjson", `${REMOTE}:${p.brand}`, "--dirs-only"]));
const top = JSON.parse(rclone(["lsjson", `${REMOTE}:`, "--dirs-only"]));
const folderId = dirs.find((d) => d.Name === name)?.ID;
const brandFolderId = top.find((d) => d.Name === p.brand)?.ID;
const remoteNames = new Set(ls.map((f) => f.Name));
const notThere = local.filter((f) => !remoteNames.has(f));
const rec = {
  ...prev,
  brand: p.brand,
  brandFolderId,
  folderId,
  folderUrl: folderId ? `https://drive.google.com/drive/folders/${folderId}` : prev.folderUrl,
  files: Object.fromEntries(ls.map((f) => [f.Name, { id: f.ID, bytes: f.Size, md5: f.Hashes?.md5 ?? f.Hashes?.MD5 ?? null }])),
  at: new Date().toISOString(),
};
writeFileSync(recPath, JSON.stringify(rec, null, 2) + "\n");
if (notThere.length) throw new Error(`Belum ada di Drive: ${notThere.join(", ")}`);
// verifikasi isi: md5 lokal = md5 Drive
const bad = ls.filter((f) => {
  const md5 = createHash("md5").update(readFileSync(path.join(p.resultDir, f.Name))).digest("hex");
  const remote = f.Hashes?.md5 ?? f.Hashes?.MD5;
  return local.includes(f.Name) && remote && remote !== md5;
});
if (bad.length) throw new Error(`Isi berbeda dengan file lokal: ${bad.map((f) => f.Name).join(", ")}`);
console.log(`\nTersimpan di Google Drive (${ls.length} file, isi terverifikasi): ${rec.folderUrl}`);
