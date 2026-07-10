# James ♥ Hannah — Countdown

A walkable 3D world counting down to **July 25, 2026 · 3:30 PM Pacific**.

- **The Gallery** — a countdown on the wall, surrounded by framed photos of us.
- **The Arcade** — through the doorway: shoot hoops, chase your best streak.
- **The Parlor** — south of the arcade: a game table for two. Sit down and play
  Yahtzee together — dice roll on the table, live, when you're both inside.

When you're both online you'll see each other wandering the world as a little
glowing heart.

## Controls

| | Desktop | Mobile |
|---|---|---|
| Walk | `WASD` / arrows (`Shift` to run) | left side of screen |
| Look | mouse | drag right side |
| Shoot | hold click, release | hold 🏀 button |
| Sit at the game table | `E` near the table | tap 🎲 near the table |
| Leave the table | `Esc` or Stand Up | Stand Up |

## Develop

```sh
npm install
npm run dev     # local dev server
npm run build   # production build → dist/
```

Built with [Three.js](https://threejs.org) + [Vite](https://vite.dev). Deployed on Vercel.

## Two-player setup (optional)

Multiplayer runs over one Supabase Realtime channel — broadcast + presence only,
**no database tables, no auth**. Without the env vars below the site simply runs
in solo mode.

1. Create a free [Supabase](https://supabase.com) project.
2. Copy the **Project URL** and **anon public key** (Settings → API).
3. Local dev — create `.env.local`:

   ```sh
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

4. Vercel — add the same two variables in Project → Settings → Environment
   Variables, then redeploy.

First visit asks "who's stepping inside?" (James or Hannah) and remembers the
answer in `localStorage`.
