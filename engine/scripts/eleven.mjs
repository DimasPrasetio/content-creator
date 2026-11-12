// Akses ElevenLabs lewat SDK resmi @elevenlabs/elevenlabs-js. Key dibaca SDK dari ELEVENLABS_API_KEY
// (dimuat lib.mjs dari .env.local di root project); key tidak pernah ditulis di kode atau dicetak.
import { writeFileSync } from "node:fs";
import { ElevenLabsClient, ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import "./lib.mjs";

let client;
export const eleven = () => {
  if (!process.env.ELEVENLABS_API_KEY)
    throw new Error("ELEVENLABS_API_KEY belum ada. Jalankan di root project: npx -y @elevenlabs/cli@latest onboard init");
  return (client ??= new ElevenLabsClient());
};

/** Sisa kuota karakter akun. */
export const quota = async () => {
  const s = await eleven().user.subscription.get();
  return { tier: s.tier, used: s.characterCount, limit: s.characterLimit, left: s.characterLimit - s.characterCount };
};

/** true bila error karena voice library tidak boleh dipakai di paket free. */
export const isPaidPlanError = (e) => /paid_plan_required|library voices/i.test(JSON.stringify(e?.body ?? "") + (e?.message ?? ""));

/** Pesan error SDK yang ringkas dan aman (tanpa header/key). */
export const errText = (e) =>
  e instanceof ElevenLabsError ? `${e.statusCode ?? "?"} ${JSON.stringify(e.body ?? e.message).slice(0, 300)}` : String(e?.message ?? e);

/**
 * Text-to-speech ke file. `opt`: { modelId, voiceSettings:{stability, similarityBoost}, languageCode, seed,
 * outputFormat, previousText, nextText }. Eleven v4 hanya memakai stability + similarityBoost.
 */
export const ttsToFile = async (voiceId, text, opt, file) => {
  const stream = await eleven().textToSpeech.convert(voiceId, { text, ...opt });
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  writeFileSync(file, Buffer.concat(chunks.map((c) => Buffer.from(c))));
};

export { ElevenLabsError };
