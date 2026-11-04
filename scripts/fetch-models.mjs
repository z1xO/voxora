// Downloads the interviewer's natural-voice model (Kokoro-82M) into public/models so the browser loads it
// from this machine. Browsers often refuse to cache the ~330 MB GPU model, which otherwise means a
// full re-download on every visit. Run once with: npm run models:fetch
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const REPO = "onnx-community/Kokoro-82M-v1.0-ONNX";
const FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model.onnx", "onnx/model_quantized.onnx"];
const OUT = join(process.cwd(), "public", "models", REPO);

for (const file of FILES) {
  const url = `https://huggingface.co/${REPO}/resolve/main/${file}`;
  const dest = join(OUT, file);
  const head = await fetch(url, { method: "HEAD", redirect: "follow" });
  const size = Number(head.headers.get("content-length") || 0);
  if (existsSync(dest) && size && statSync(dest).size === size) {
    console.log(`✓ ${file} (already downloaded)`);
    continue;
  }
  mkdirSync(dirname(dest), { recursive: true });
  process.stdout.write(`↓ ${file} (${(size / 1e6).toFixed(1)} MB)… `);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Failed to download ${file}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log("done");
}
console.log(`Models saved to ${OUT}`);
