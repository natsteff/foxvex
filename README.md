# FoxVex

<img src="public/foxvex-logo.png" width="280" alt="FoxVex logo">

**Version 0.1.1 · Alpha**

<p align="center">
  <a href="https://natsteff.github.io/foxvex/"><img src="docs/play-now.svg" width="280" alt="Play FoxVex now"></a>
</p>

**Play FoxVex in your browser.** [Open the game](https://natsteff.github.io/foxvex/)

Inspired by classic TetraVex-style puzzles, FoxVex brings traditional number-matching gameplay to a modern interface. Drag tiles from the tray onto the board and match touching numbers to solve puzzles from 2×2 to 5×5.

- **Three difficulty levels** vary how many edges give away a tile’s position.
- **Matching Assistant** can prevent mismatches, outline them in red, or leave them unmarked.
- **Optional Cheat Mode** marks tiles that have an unmatched edge and must go on the border.
- **Local saves** let you resume a puzzle in the same browser. You can also undo moves or reveal the solution.

FoxVex supports mouse and keyboard on desktop and touch on phones and tablets. Wide screens show the board and tray side by side. Phone portrait stacks them, with options to use smaller tiles, scroll, or rotate to landscape. Controller support and FOX Arcade validation are planned.

## Add FoxVex to your Home Screen

1. Open [FoxVex](https://natsteff.github.io/foxvex/) on your phone or tablet.
2. **iPhone or iPad** — In Safari, tap **Share**, choose **Add to Home Screen**, turn on **Open as Web App** if offered, then tap **Add**.
3. **Android** — In Chrome, open the **⋮** menu and choose **Install and create shortcut** or **Add to Home screen**. Choose **Install** if prompted.
4. Launch **FoxVex** from its fox logo. Internet access is required to load the game.

## Controls

| Action | Mouse or touch | Keyboard |
| --- | --- | --- |
| Move or swap a tile | Drag and drop | Tab between grids, use arrows to focus a slot, and press Enter or Space to pick up or drop |
| Cancel a move | Release outside the grids | Escape |
| Undo, check, or reveal the solution | Use the puzzle toolbar | Tab to a toolbar control and press Enter |

Tiles keep their orientation. A move into an occupied slot swaps the two tiles. **Matching Assistant** in Settings lets you prevent mismatches, highlight them in red (the default), or leave them unmarked. **Check** reports whether any touching numbers differ.

Choose **Size** and **Difficulty**, then select **New puzzle** to apply them. The Play area heading shows the size and difficulty of the puzzle in progress. Easy has two forced corners and two more border clues. Normal has two border clues, and Hard has none. An edge with no match on the opposite side of any other tile must face out.

Turn on **Cheat Mode** in Settings to see cyan outlines on tiles with unmatched edges. Each notch marks a side with no opposite-side match on any other tile, so that side must face out. The marks follow the tile onto the board.

On phones, the board sits above the tray in portrait. In Settings, **Fit screen with smaller tiles** lets tiles shrink further when space is tight. If the page scrolls, hold a dragged tile near the top or bottom of the screen to scroll.

The current puzzle saves in your browser. Undo history lasts until you reload or start a new puzzle. Solve reveals a valid arrangement and can be undone.

The version appears during startup, in the Alpha badge, and in Settings. **Auto update** checks for a newer build when you open FoxVex or return to it. Use **Check for updates** in Settings to check manually.

## Run locally

Use Node.js 24 and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite. Run `pnpm build` followed by `pnpm preview` to try the production build.

Built with Phaser and TypeScript. Project owner **Nate S**.
