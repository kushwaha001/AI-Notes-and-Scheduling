# Whisper (voice → text) — offline setup for the app PC

Whisper is the **only AI model that runs locally** on the app PC (on its GPU).
Everything else (LLM, embeddings, Docling, Qdrant) is reached over the network by
URL, so this folder is all you need for voice transcription to work air-gapped.

The model files live in the bundle at
`offline\models\huggingface-cache\hub\models--Systran--faster-distil-whisper-large-v3`
(plus `…faster-whisper-base` as a CPU fallback). The script here copies them into
the right place on the app PC — with the correct `hub\` structure, which is the
part people get wrong by hand.

---

## Steps (on the OFFLINE app PC)

1. **Copy the project** across (with the `offline\` folder) as usual.

2. **Run the installer** from this folder:
   ```powershell
   cd offline\whisper
   powershell -ExecutionPolicy Bypass -File .\install-whisper-cache.ps1
   ```
   It copies the Whisper model(s) to
   `%USERPROFILE%\.cache\huggingface\hub\` and prints what it installed.

3. **Confirm the layout** (must look exactly like this — note `hub`):
   ```
   %USERPROFILE%\.cache\huggingface\
         └── hub\
               ├── models--Systran--faster-distil-whisper-large-v3
               └── models--Systran--faster-whisper-base
   ```
   Check quickly:
   ```powershell
   dir "$env:USERPROFILE\.cache\huggingface\hub"
   ```

4. **Set offline mode** in `backend\.env` (so Whisper never tries to download):
   ```ini
   OFFLINE_MODE=true
   WHISPER_MODEL=distil-large-v3
   WHISPER_DEVICE=cuda          # cpu if the box has no NVIDIA GPU
   WHISPER_COMPUTE_TYPE=float16 # int8 if WHISPER_DEVICE=cpu
   WHISPER_BEAM_SIZE=5          # 1 = fastest, 5 = more accurate
   WHISPER_LANGUAGE=en          # clear (=) only for a multilingual model
   ```

5. **Start the backend**, open the app, record a short voice note. The first one
   loads the model (a few seconds on GPU); after that it stays warm.

That's it — voice transcription now works with no internet.

---

## How to tell it worked

- `GET /services` always lists `whisper` (it loads on first use), so the real
  test is: **record a voice note and see a transcript.**
- Backend log on first audio: `Whisper 'distil-large-v3' loaded on cuda/float16`.
- If you see a download attempt or a hang on a dead network → `OFFLINE_MODE`
  isn't set, or the cache isn't under `hub\` (re-run step 2).

---

## Common mistakes

| Symptom | Cause / fix |
|---|---|
| Whisper tries to download / hangs offline | `OFFLINE_MODE=true` missing, **or** files not under `…\.cache\huggingface\hub\` (run the script, don't copy by hand). |
| `cublas64_12.dll not found` | No GPU runtime — set `WHISPER_DEVICE=cpu`, `WHISPER_COMPUTE_TYPE=int8`. |
| Want Hindi/mixed audio | Pre-stage `large-v3-turbo` first (see below); `distil-large-v3` is English-only. |

---

## Optional — using a different Whisper model

`distil-large-v3` (English) is bundled. For another model (e.g.
`large-v3-turbo` for Hindi/mixed), pre-download its cache **on an internet PC**,
because the offline PC can't fetch it:

```powershell
# on an INTERNET PC, inside the backend venv:
python -c "from faster_whisper import WhisperModel; WhisperModel('large-v3-turbo')"
robocopy "$env:USERPROFILE\.cache\huggingface\hub" `
         "<repo>\offline\models\huggingface-cache\hub" /E
```
Carry it over, run `install-whisper-cache.ps1` again (it copies every `*whisper*`
folder), then set `WHISPER_MODEL=large-v3-turbo` and clear `WHISPER_LANGUAGE`.

---

## Optional — slimming the shipped bundle

The app PC no longer needs the Docling model caches (Docling is a remote
service). To ship a Whisper-only cache, stage just the Whisper folders here once
on the internet PC:
```powershell
robocopy "<repo>\offline\models\huggingface-cache\hub" "<repo>\offline\whisper\hub" `
         models--Systran--faster-distil-whisper-large-v3 `
         models--Systran--faster-whisper-base /E
```
Then you can exclude `offline\models\huggingface-cache` and `offline\models\EasyOCR`
from the transfer. The installer auto-prefers `offline\whisper\hub` when present.
