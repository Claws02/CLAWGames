# CLAWGames: notes for Claude

## Shipping: every change must be playable from GitHub Pages

The app is published by GitHub Pages ("deploy from branch", `main`, root) at
**https://claws02.github.io/CLAWGames/**. Caleb merges PRs from his phone and
plays the result there, so a pushed change is only done when merging ONE PR
makes it live:

1. **Branch from the latest `origin/main`**, and merge `origin/main` back in
   before opening or updating the PR. A stale branch conflicts on the
   submodule pointer.
2. **If claw-core changed:** push the claw-core branch and open its PR first.
   Once it is merged, pin `src/claw-core` to **claw-core `main`**, never to a
   feature-branch commit. Pages builds the submodule from the pinned commit,
   and a squashed or deleted branch would strand it. If the core PR isn't
   merged yet, say so at the top of the CLAWGames PR: "merge claw-core #N
   first".
3. **Open the PR to `main`** (one PR per deliverable) with a "Play it"
   line: the Pages URL and how to reach the new thing in the app.
4. **Static files only.** Pages serves the repo as-is: no build step, so
   anything the browser loads must be committed (vendor/, assets/, css/).
   Paths must be relative (the site lives under `/CLAWGames/`).
5. **Before pushing:** `npm run smoke` and the game's own probe in `qa/`
   (with `npm run serve` on :8140).
6. **Phones cache Pages for 10 minutes.** `sw.js` (network-first, github.io
   only) stops a phone mixing old and new modules after a merge. Keep it, and
   never make a new cross-file named import a single point of failure (see
   the namespace import in `src/games/index.js`). After a merge, check the
   "pages build and deployment" run succeeded before saying it's live.
