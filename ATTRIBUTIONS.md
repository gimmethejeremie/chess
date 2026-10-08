# Asset Attributions and Licenses

All graphical and audio assets used in **Chess Playground** are strictly free and open-licensed. Assets are hosted locally within `/public/assets` and require no runtime external CDN.

---

## 1. Chess Piece Sets (SVG)

### **cburnett**
- **Creator**: Colin M.L. Burnett
- **Source**: [Lichess Lila Repository](https://github.com/lichess-org/lila/tree/master/public/piece/cburnett) & [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces)
- **License**: Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0) / GPLv3+ compatible
- **Files**: `wP.svg`, `wN.svg`, `wB.svg`, `wR.svg`, `wQ.svg`, `wK.svg`, `bP.svg`, `bN.svg`, `bB.svg`, `bR.svg`, `bQ.svg`, `bK.svg`
- **Location**: `/public/assets/pieces/cburnett/`

### **merida**
- **Creator**: Armando H. Marroquín (adapted for Lichess)
- **Source**: [Lichess Lila Repository](https://github.com/lichess-org/lila/tree/master/public/piece/merida)
- **License**: Free Software / CC BY-SA 3.0 / GPL compatible
- **Files**: `wP.svg`, `wN.svg`, `wB.svg`, `wR.svg`, `wQ.svg`, `wK.svg`, `bP.svg`, `bN.svg`, `bB.svg`, `bR.svg`, `bQ.svg`, `bK.svg`
- **Location**: `/public/assets/pieces/merida/`

### **alpha**
- **Creator**: Eric Bentzen (Pytha/En Passant, adapted for Lichess)
- **Source**: [Lichess Lila Repository](https://github.com/lichess-org/lila/tree/master/public/piece/alpha)
- **License**: Free open license / CC BY-SA 3.0 / GPL compatible
- **Files**: `wP.svg`, `wN.svg`, `wB.svg`, `wR.svg`, `wQ.svg`, `wK.svg`, `bP.svg`, `bN.svg`, `bB.svg`, `bR.svg`, `bQ.svg`, `bK.svg`
- **Location**: `/public/assets/pieces/alpha/`

---

## 2. Audio Effects (MP3)

- **Source**: [Lichess Open Audio Soundpacks](https://github.com/lichess-org/lila/tree/master/public/sound)
- **License**: Creative Commons Zero (CC0 1.0 Universal) / Public Domain / GPL compatible
- **Location**: `/public/assets/sounds/`

| Audio File | Event | Source Pack | License |
|---|---|---|---|
| `move.mp3` | Piece move | Lichess `standard/Move.mp3` | CC0 / Open Source |
| `capture.mp3` | Piece capture | Lichess `standard/Capture.mp3` | CC0 / Open Source |
| `check.mp3` | King in check | Lichess `sfx/Check.mp3` | CC0 / Open Source |
| `castle.mp3` | Castling | Lichess `standard/GenericNotify.mp3` | CC0 / Open Source |
| `game-end.mp3` | Checkmate / Victory | Lichess `sfx/Victory.mp3` | CC0 / Open Source |
| `low-time.mp3` | Low time warning | Lichess `standard/LowTime.mp3` | CC0 / Open Source |

---

## 3. Chess Engine (Stockfish.js)

- **Engine**: Stockfish Chess Engine compiled to WebAssembly / JavaScript
- **Original Authors**: Tord Romstad, Marco Costalba, Joona Kiiski, Gary Linscott, and the Stockfish contributors
- **WebAssembly/JS Port**: Niklas Fiekas ([stockfish.js](https://github.com/niklasf/stockfish.js))
- **Source**: [https://github.com/official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish) & [https://github.com/niklasf/stockfish.js](https://github.com/niklasf/stockfish.js)
- **License**: GNU General Public License v3.0 (GPLv3)
- **Location**: `/public/stockfish/stockfish.wasm.js`, `/public/stockfish/stockfish.wasm`, `/public/stockfish/stockfish.js`

