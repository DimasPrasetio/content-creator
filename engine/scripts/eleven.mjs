// Akses ElevenLabs lewat SDK resmi @elevenlabs/elevenlabs-js. Key dibaca SDK dari ELEVENLABS_API_KEY
// (dimuat lib.mjs dari .env.local di folder workspace); key tidak pernah ditulis di kode atau dicetak.
import { createReadStream, writeFileSync } from "node:fs";
import { ElevenLabsClient, ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import "./lib.mjs";

let client;
export const eleven = () => {
  if (!process.env.ELEVENLABS_API_KEY)
    throw new Error("ELEVENLABS_API_KEY belum ada. Jalankan di folder workspace (bukan Engine/): npx -y @elevenlabs/cli@latest onboard init");
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

/**
 * Text-to-speech + waktu per huruf dalam satu panggilan (tanpa biaya tambahan). Audio ditulis ke `file`;
 * yang dikembalikan: alignment { characters, characterStartTimesSeconds, characterEndTimesSeconds } dari teks yang dikirim.
 */
export const ttsWithTimestamps = async (voiceId, text, opt, file) => {
  const r = await eleven().textToSpeech.convertWithTimestamps(voiceId, { text, ...opt });
  if (!r?.audioBase64 || !r.alignment?.characters?.length) throw new Error("respons tanpa audio/timestamps");
  writeFileSync(file, Buffer.from(r.audioBase64, "base64"));
  const { characters, characterStartTimesSeconds, characterEndTimesSeconds } = r.alignment;
  return { characters, characterStartTimesSeconds, characterEndTimesSeconds };
};

/**
 * Alignment per huruf -> kata [{w, s, e, p}] (format sama dengan hasil whisper). Tag ekspresi [..] dilewati; waktu kata
 * diambil dari huruf/angka saja (tanda baca seperti "..." dan "," ikut diberi durasi oleh ElevenLabs).
 * `offset` = posisi potongan ini di audio gabungan, `maxEnd` = panjang potongan (batas atas).
 */
export const alignmentWords = (al, offset = 0, maxEnd = Infinity) => {
  const { characters: c, characterStartTimesSeconds: st, characterEndTimesSeconds: en } = al;
  const out = [];
  let cur = null;
  let tag = false;
  const flush = () => {
    if (cur?.s !== undefined) {
      const e = Math.min(cur.e, maxEnd);
      out.push({ w: cur.w, s: +(offset + Math.min(cur.s, e)).toFixed(3), e: +(offset + e).toFixed(3), p: 1 });
    }
    cur = null;
  };
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (ch === "[") tag = true;
    if (tag) {
      if (ch === "]") tag = false;
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    cur ??= { w: "" };
    cur.w += ch;
    if (/[\p{L}\p{N}]/u.test(ch)) {
      cur.s ??= st[i];
      cur.e = en[i];
    }
  }
  flush();
  return out;
};

/** Forced alignment ElevenLabs: audio + teks -> kata [{w, s, e, p}] (tarif Speech to Text; dipakai bila timestamps tidak ada). */
export const forcedAlign = async (file, text) => {
  const r = await eleven().forcedAlignment.create({ file: createReadStream(file), text });
  return (r.words ?? []).filter((w) => w.text.trim()).map((w) => ({ w: w.text.trim(), s: w.start, e: w.end, p: 1 }));
};

/** Speech to Text (Scribe) -> kata [{w, s, e, p}], p = peluang kata (exp logprob). Memakai kuota STT. */
export const transcribe = async (file, languageCode = "id") => {
  const r = await eleven().speechToText.convert({ file: createReadStream(file), modelId: "scribe_v2", languageCode, timestampsGranularity: "word", tagAudioEvents: false });
  return (r.words ?? []).filter((w) => w.type === "word").map((w) => ({ w: w.text, s: w.start ?? 0, e: w.end ?? 0, p: +Math.exp(w.logprob ?? 0).toFixed(3) }));
};

export { ElevenLabsError };
