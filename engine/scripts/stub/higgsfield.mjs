#!/usr/bin/env node
// Tiruan CLI `higgsfield` untuk selftest (tanpa login, tanpa kredit). Dipakai lewat HIGGSFIELD_BIN.
// Meniru: version · account status · model list · generate cost · generate create --wait (membuat media uji dengan ffmpeg).
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const a = process.argv.slice(2).filter((x) => x !== "--json" && x !== "--no-color");
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const val = (k) => a[a.indexOf(`--${k}`) + 1];
const COST = { seedance_2_5: 35, gpt_image_2_6: 0.25, seed_audio: 1 };

if (a[0] === "version") console.log("higgsfield 0.0.0-stub (stub) built -");
else if (a[0] === "account") out({ email: "uji@contoh.test", plan: "stub", credits: 100 });
else if (a[0] === "model") out([{ job_set_type: "seedance_2_5", name: "Seedance 2.5", category: "video" }, { job_set_type: "gpt_image_2_6", name: "GPT Image 2.6", category: "image" }]);
else if (a[0] === "generate" && a[1] === "cost") out({ credits: COST[a[2]] ?? 2 });
else if (a[0] === "generate" && a[1] === "create") {
  const model = a[2];
  const dir = mkdtempSync(path.join(os.tmpdir(), "hf-stub-"));
  const video = /seedance|kling|veo|video/.test(model);
  const audio = /audio/.test(model);
  const file = path.join(dir, video ? "result.mp4" : audio ? "result.wav" : "result.png");
  const dur = String(val("duration") ?? 4);
  const ff = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "ignore" });
  if (video) ff(["-f", "lavfi", "-i", `testsrc2=s=720x1280:r=24:d=${dur}`, "-pix_fmt", "yuv420p", "-c:v", "libx264", file]);
  else if (audio) ff(["-f", "lavfi", "-i", `sine=f=440:d=${dur}`, file]);
  else ff(["-f", "lavfi", "-i", "testsrc2=s=1024x1536", "-frames:v", "1", file]);
  out({ id: "00000000-0000-4000-8000-000000000001", status: "completed", job_set_type: model, results: [{ type: video ? "video" : audio ? "audio" : "image", url: `file://${file}` }] });
} else {
  console.error(`stub: perintah tidak dikenal: ${a.join(" ")}`);
  process.exit(2);
}
