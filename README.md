# Voxora

**Think out loud. Code through.** An AI mock technical interview coach for CS students. You solve a problem in a Monaco editor while
explaining your approach. A Llama-powered interviewer follows what you say and how your code changes, asks one relevant question at a
time, and gives staged hints without revealing the solution. When you finish, you get a four-category scorecard where every score is
backed by a quote from your transcript, a line of your code, or a test run.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. With no model configured, Voxora uses its built-in rule-based coach, so the whole flow still works.

### Interviewer model (pick one)

- **Local (default, private):** install [Ollama](https://ollama.com), then run `ollama pull llama3.1:8b`. Voxora finds it at
  `OLLAMA_URL`. You need about 8 GB of free RAM.
- **Hosted:** set `HOSTED_LLM_BASE_URL`, `HOSTED_LLM_API_KEY`, and `HOSTED_LLM_MODEL` to any OpenAI-compatible endpoint that serves Llama
  (for example Groq or Together).

### Code sandbox

Candidate code runs in a locked-down Docker container: no network, 128 MB of memory, half a CPU, a pids limit, a read-only filesystem,
all capabilities dropped, and a non-root user. Start Docker, then run:

```bash
npm run sandbox:pull
```

When the server has no sandbox (no Docker, or a serverless host like Vercel), **Run tests** runs the same harness in the visitor's
browser instead, using [Pyodide](https://pyodide.org) in a Web Worker. It's isolated from the server, and an infinite loop is stopped by
discarding the worker. The first run downloads Python, about 10 MB, which the browser then caches.

For development without Docker only, `VOXORA_ALLOW_UNSANDBOXED=1` runs code in a local Python subprocess with a timeout. That is
**not** isolation. The UI warns when it's active.

## Deploying (Vercel)

The app deploys to Vercel as-is. On a serverless host, Docker and a local Ollama aren't available, so:

- **Run tests** uses in-browser Python, as described above.
- **The interviewer** uses the built-in coach, unless you set `HOSTED_LLM_BASE_URL`, `HOSTED_LLM_API_KEY` and `HOSTED_LLM_MODEL` in the
  Vercel project's environment variables, for example a Groq endpoint serving Llama.
- **The natural voice** downloads from Hugging Face. `public/models` is git-ignored because it's too large to deploy.

## How it maps to the PRD

| Requirement | Where |
| --- | --- |
| Curated problems with prompt, examples, constraints, starter code | `src/lib/problems.ts` (5 Python problems) |
| Monaco + run visible sample tests in isolation | `src/components/InterviewRoom.tsx`, `src/lib/runner.ts`, `/api/run` |
| Mic requested only on "Start speaking"; Whisper transcription; live transcript | `src/lib/useVoice.ts`, `src/workers/whisper.worker.ts` (in-browser, `whisper-base.en`) |
| Text fallback, transcript corrections | Composer + "edit" on each of your turns |
| Interviewer gets the problem, recent transcript, and concise code-change summaries | `src/lib/codeSummary.ts`, `src/lib/prompts.ts` |
| One question at a time, never interrupting speech | Turn-taking in `InterviewRoom.tsx`: waits for a pause, holds questions while you speak, drops stale replies, no unprompted question while one is still unanswered |
| Three hint levels, never the full solution | `/api/hint` with authored reference hints as a ceiling; `src/lib/guard.ts` blocks code and early technique names |
| 1–5 scores with evidence, "insufficient evidence", 2 strengths, ≤3 actions | `/api/score`, `src/lib/scoring.ts` (every quote is checked against the session; unverifiable scores become "insufficient evidence") |
| Communication not scored on accent or speed | Grader prompt + a post-check that discards delivery-based rationales |
| Local vs hosted explained up front; optional saving; delete; no raw audio | Setup screen, `src/lib/storage.ts`, `/history` |

## Interviewer behavior

The interviewer is paced like a real one by `src/lib/pacing.ts`, which decides when to speak; the model only phrases the move:

- It always answers direct questions and kindly declines requests for the solution.
- It briefly acknowledges your answer to its question (at most one follow-up).
- Otherwise it stays quiet and speaks only at natural checkpoints, each used once and at least 60 seconds apart: a go-ahead after you explain your plan, asking for your approach if you jump into code, complexity once tests pass, "can you do better?" for a brute-force solution, one edge case, a wrap-up, and a check-in if you go quiet for a while.

## Interviewer voice

"Natural" uses Kokoro-82M (via `kokoro-js`) running locally in a Web Worker, which sounds far more human than system speech. It runs on the GPU through WebGPU when available (one-time ~330 MB download, audio starts in about a second) and falls back to the CPU (~90 MB, noticeably slower). It starts loading on the setup screen. Run `npm run models:fetch` once to save the model into `public/models` so the browser loads it from this machine. Browsers often refuse to cache the large GPU model, which otherwise means a full re-download on every visit. While the voice is still loading, the interviewer waits for it instead of switching to the system voice. If natural audio hasn't started within 6 seconds, or synthesis fails, that line is spoken with the system voice so the interviewer is never silent. "System" uses the best built-in browser voice, and "Off" keeps it text-only. The app sends cross-origin isolation headers (`next.config.mjs`) so the in-browser models can use multithreaded WebAssembly.

## Project layout

```
src/app/            pages (/, /practice/[id], /history) and API routes (run, interviewer, hint, score, health, warmup)
src/components/     Setup, InterviewRoom, ScorecardView, PracticeApp, SiteHeader, ThemeSwitch
src/lib/            problems, runner + shared harness, browser runner, llm client, prompts, pacing, signals, scoring, guard,
                    fallback coach, voice hooks, theme, storage
src/workers/        Whisper speech-to-text, Kokoro voice, and Pyodide Python workers
scripts/            fetch-models.mjs (downloads the natural-voice model into public/models)
```
