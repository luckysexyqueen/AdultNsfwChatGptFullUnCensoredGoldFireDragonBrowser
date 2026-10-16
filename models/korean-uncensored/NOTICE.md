# Lightweight Korean-capable uncensored model

- Model: `mlabonne/Qwen3-0.6B-abliterated-GGUF`, Q4_K_M, 0.6B parameters.
- Author describes the model as an uncensored/abliterated version of Qwen3-0.6B.
- Source revision: `92351f431cfdd36f71149aaf072a6490a68e144e`.
- Original file: `qwen3-0.6b-abliterated.q4_k_m.gguf`.
- Original size: 396,704,896 bytes (about 378 MiB).
- Original SHA-256: `a5ee9177eeb334fc06883ae2ac5471e783a4ac2480f3a3bd6df852c5b20243e1`.
- License: Apache-2.0, supplied in `LICENCE`.
- Model card: https://huggingface.co/mlabonne/Qwen3-0.6B-abliterated-GGUF
- Base model: https://huggingface.co/Qwen/Qwen3-0.6B
- Single-file release: https://github.com/luckysexyqueen/AdultNsfwChatGptFullUnCensoredGoldFireDragonBrowser/releases/tag/model-qwen3-0.6b-abliterated-q4-k-m

The weights are unchanged. These are byte parts of one GGUF, not independent GGUF
shards. Each part is at most 20 MiB for ordinary GitHub and static-hosting uploads.
Concatenate them in manifest order to recover the original GGUF. The browser validates
each part and assembles one File before passing it to Wllama; do not pass each part
as an independent model. `manifest.json` records all part sizes/hashes.

The app applies Korean response instructions and disables Qwen's thinking template
for concise chat. The author's uncensored classification does not guarantee every
answer, language quality or accuracy. Original bundled GPT-2 weights are preserved
separately. No Python model code or pickle file is loaded or executed.
