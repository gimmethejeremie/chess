# ♞ Chess Playground (Sân Chơi Cờ Vua)

> A modern, mobile-first, zero-framework chess web application with rule-enforced standard play, freeform sandbox board editing, local hot-seat with precision chess clocks, and realtime online multiplayer powered by Firebase.
>
> *Ứng dụng web cờ vua hiện đại, tối ưu cho thiết bị di động, không sử dụng UI framework cồng kềnh, hỗ trợ chơi tiêu chuẩn, xếp cờ tự do (sandbox), đối kháng chung máy (hot-seat) với đồng hồ bấm giờ và chơi trực tuyến qua Firebase.*

---

## Table of Contents / Mục Lục
- [English Documentation](#-english-documentation)
  - [Tech Stack](#tech-stack)
  - [Key Features](#key-features)
  - [Local Development](#local-development)
  - [Firebase Setup Guide](#firebase-setup-guide)
  - [Deploying to GitHub Pages](#deploying-to-github-pages)
  - [GitHub Actions Secrets & Variables](#github-actions-secrets--variables)
  - [Live URL Format](#live-url-format)
  - [Asset Attributions](#asset-attributions)
- [Tài Liệu Tiếng Việt](#-tài-liệu-tiếng-việt)
  - [Công Nghệ Sử Dụng](#công-nghệ-sử-dụng)
  - [Các Chế Độ Chơi](#các-chế-độ-chơi)
  - [Chạy Dự Án Cục Bộ (Local Dev)](#chạy-dự-án-cục-bộ-local-dev)
  - [Hướng Dẫn Thiết Lập Firebase](#hướng-dẫn-thiết-lập-firebase)
  - [Cấu Hình GitHub Pages & GitHub Actions](#cấu-hình-github-pages--github-actions)
  - [Định Dạng Đường Dẫn Trực Tiếp](#định-dạng-đường-dẫn-trực-tiếp)

---

# 🇺🇸 English Documentation

## Tech Stack
- **Core**: Vite + Vanilla JavaScript (ES modules), HTML5, CSS3. No heavy UI framework.
- **Chess Engine & Validation**: `chess.js` (rule enforcement, SAN generation, FEN/PGN parser).
- **Board Renderer**: Custom 8x8 responsive board using **Pointer Events** (unified support for mouse and touch, floating drag ghost, no HTML5 drag-and-drop quirks, no page scroll while dragging).
- **Online Multiplayer**: Modular Firebase JS SDK v10 (Realtime Database + Anonymous Auth).
- **Testing**: Vitest unit test suite covering game logic, timing engines, network protocols, and storage persistence.
- **CI/CD**: GitHub Actions deploying automatically to GitHub Pages.

---

## Key Features

### 1. Standard Chess Mode (`/src/modes/standard`)
- **Full Legal Enforcement**: Castling, en passant, pawn promotion dialog (Queen, Rook, Bishop, Knight), check, checkmate, stalemate, threefold repetition, 50-move rule, and insufficient material.
- **Move List & Review**: Scrollable SAN notation list with step-by-step history review (`|◀`, `◀`, `▶`, `▶|`) and single-click return to live position.
- **Undo / Redo**: Step back or forward through played moves.
- **PGN / FEN Import & Export**: One-click clipboard copy or text load.
- **Actions**: Resign, Offer Draw, Flip Board, New Game with confirmation prompts.

### 2. Sandbox Mode (`/src/modes/sandbox`)
- **Freeform Board Editing**: Place any piece anywhere without legal constraints.
- **Piece Palette**: 12 draggable piece pieces (White & Black).
- **Tools**: Drag pieces onto board, drag off to delete, Eraser tool, right-click to remove.
- **Arrow Annotations**: Right-click-drag to draw colored tactical arrows (Lichess style).
- **FEN Management & Position Library**: Save custom positions to `localStorage` with custom names.

### 3. Multiplayer Mode (`/src/modes/multiplayer`)
- **Local Hot-Seat**:
  - Precision dual digital chess clocks computed from timestamps (`performance.now()`), avoiding `setInterval` drift and handling tab throttling.
  - Time presets: Bullet (`1+0`, `2+1`), Blitz (`3+0`, `3+2`, `5+0`, `5+3`), Rapid (`10+0`, `10+5`, `15+10`), Classical (`30+0`), and Custom.
  - Timing systems: Fischer increment, USCF Simple Delay, Bronstein Delay, and Sudden Death.
  - Low-time warning (< 15s) with pulsing visual state and audio cue.
- **Online Play (Firebase)**:
  - **Lobby**: Create rooms with short 6-character codes (e.g. `K7N2P9`) or join via shareable link (`?room=ABC123`).
  - **Roles**: Host chooses side (⚪ White, ⚫ Black, 🎲 Random); second player takes the opposing seat; 3rd+ arrivals become read-only **Spectators**.
  - **Drift-Free Clocks**: Clocks are computed locally from banked time, server timestamps of moves, and corrected via Firebase's `.info/serverTimeOffset`. Clock ticks are **never streamed** over the network.
  - **Atomic Timeouts**: Timeouts are claimed via `runTransaction()`, guaranteeing exact and race-free game-over writes.
  - **Presence & Session Recovery**: Tracks player connection state (`.info/connected` + `onDisconnect`). Restores match on page refresh via `localStorage`.
  - **Interactions**: In-game draw offer banner (Accept / Decline), resignation, rematch with color swap, PGN download.

### 4. Settings & Internationalization
- **Settings Screen**: Accessible modal dialog allowing live configuration of:
  - Theme (☀️ Light / 🌙 Dark)
  - Piece set (`cburnett`, `merida`, `alpha`)
  - Board theme (`classic`, `wood`, `ocean`, `slate`)
  - Sound effects (🔊 Enabled / 🔇 Muted)
  - Board coordinates (`a-h`, `1-8` toggle)
  - Language (🇺🇸 English / 🇻🇳 Tiếng Việt)
- **Keyboard Accessibility**: High-contrast `:focus-visible` outlines, `tabindex`, `Enter` and `Space` keyboard piece selection/movement, ARIA roles (`role="gridcell"`, `aria-label="e4, White Pawn"`).

---

## Local Development

### 1. Prerequisites
- **Node.js**: v20 or later
- **npm**: v10 or later

### 2. Installation & Run
```bash
# Clone the repository
git clone https://github.com/gimmethejeremie/chess.git
cd chess

# Install dependencies
npm install

# Setup local environment variables
cp .env.example .env
```

Edit `.env` with your Firebase web configuration (see below).

```bash
# Run local dev server (http://localhost:5173/)
npm run dev

# Run unit tests
npm test

# Build for production
npm run build

# Preview production build locally (http://localhost:4173/chess/)
npm run preview
```

---

## Firebase Setup Guide

Chess Playground uses **Firebase Realtime Database** and **Anonymous Authentication** on the free Spark plan.

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a project (e.g. `chess-playground`).
2. **Enable Anonymous Authentication**:
   - Go to **Build** &rarr; **Authentication** &rarr; **Sign-in method**.
   - Click **Anonymous**, switch toggle to **Enable**, and click **Save**.
3. **Create Realtime Database**:
   - Go to **Build** &rarr; **Realtime Database** &rarr; click **Create Database**.
   - Choose a location (e.g. `asia-southeast1` or `us-central1`).
4. **Deploy Security Rules**:
   - Under **Realtime Database** &rarr; click the **Rules** tab.
   - Paste the contents of `database.rules.json` and click **Publish**:
   ```json
   {
     "rules": {
       "rooms": {
         "$roomId": {
           ".read": "auth != null",
           ".write": "auth != null && (
             !data.exists() ||
             data.child('creator').val() === auth.uid ||
             data.child('players/white').val() === auth.uid ||
             data.child('players/black').val() === auth.uid ||
             (!data.child('players/white').exists() && data.child('status').val() === 'waiting') ||
             (!data.child('players/black').exists() && data.child('status').val() === 'waiting')
           )",
           "presence": {
             "$uid": {
               ".write": "auth != null && auth.uid === $uid"
             }
           }
         }
       }
     }
   }
   ```
5. **Get Web Configuration**:
   - Click Project Settings (⚙️ icon) &rarr; **General** &rarr; **Your apps** &rarr; **Web app** (`</>`).
   - Copy the configuration values into your `.env` file.

---

## Deploying to GitHub Pages

1. In your GitHub repository, open **Settings**.
2. Go to **Pages** (under Code and automation).
3. Under **Build and deployment** &rarr; **Source**, select **GitHub Actions**.

Whenever you push to the `main` branch, the workflow at `.github/workflows/deploy.yml` runs the unit tests, compiles the production bundle, and deploys to GitHub Pages automatically.

---

## GitHub Actions Secrets & Variables

To allow GitHub Actions to build the site with online multiplayer support, add your Firebase keys in **Settings** &rarr; **Secrets and variables** &rarr; **Actions**:

### Secrets (`Repository secrets`)
- `VITE_FIREBASE_API_KEY`: Your Firebase API key

### Variables (`Repository variables`)
- `VITE_FIREBASE_AUTH_DOMAIN`: `your-app.firebaseapp.com`
- `VITE_FIREBASE_DATABASE_URL`: `https://your-app-default-rtdb.firebaseio.com`
- `VITE_FIREBASE_PROJECT_ID`: `your-app-id`
- `VITE_FIREBASE_STORAGE_BUCKET`: `your-app.firebasestorage.app`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`: `your-sender-id`
- `VITE_FIREBASE_APP_ID`: `your-app-id`
- `VITE_FIREBASE_MEASUREMENT_ID`: `your-measurement-id`

---

## Live URL Format

Since the repository is named `chess`, the deployed website will be accessible at:
```text
https://gimmethejeremie.github.io/chess/
```

Direct room joining link format:
```text
https://gimmethejeremie.github.io/chess/?room=ABC123
```

---

## Asset Attributions
All piece SVGs and sound effects are 100% free and open-source. For details regarding sources, creators, and licenses (CC-BY-SA, CC0, MIT), refer to [ATTRIBUTIONS.md](./ATTRIBUTIONS.md).

---

# 🇻🇳 Tài Liệu Tiếng Việt

## Công Nghệ Sử Dụng
- **Giao diện & Nền tảng**: Vite + Vanilla JavaScript (ES Modules), HTML5, CSS3 thuần.
- **Bộ máy luật cờ vua**: `chess.js` (kiểm tra tính hợp lệ của nước đi, kiểm tra chiếu/chiếu bí/hòa cờ, biên bản SAN/PGN/FEN).
- **Bàn cờ tùy biến**: Xây dựng hoàn toàn bằng **Pointer Events** (hoạt động đồng nhất trên cả chuột máy tính và màn hình cảm ứng, có quân cờ bay theo ngón tay, không làm cuộn trang khi kéo cờ).
- **Chơi Online thời gian thực**: Firebase SDK v10 (Realtime Database + Xác thực ẩn danh Anonymous Auth).
- **Kiểm thử tự động**: Vitest với 45+ bài test bao phủ toàn bộ logic cờ, bộ đếm thời gian, mạng kết nối và lưu trữ.

---

## Các Chế Độ Chơi

### 1. Chế Độ Tiêu Chuẩn (Standard)
- Tuân thủ toàn bộ luật cờ vua quốc tế FIDE: nhập thành, bắt tốt qua đường (en passant), phong cấp tốt (Hậu, Xe, Tượng, Mã), chiếu tướng, chiếu bí, hòa do hết nước đi (stalemate), lặp lại 3 lần thế cờ, luật 50 nước đi, và không đủ lực lượng chiếu bí.
- Xem lại lịch sử các nước đi (Review mode) theo biên bản chuẩn SAN.
- Nhập/xuất thế cờ qua chuỗi ký hiệu FEN hoặc tệp PGN.
- Các thao tác: Xin hòa, Đầu hàng, Đi lại (Undo), Tiến tới (Redo), Xoay bàn cờ.

### 2. Chế Độ Tự Do (Sandbox)
- Xếp quân và kéo thả quân cờ tự do vào bất kỳ ô nào mà không bị ràng buộc bởi luật.
- Hộp công cụ quân cờ (12 quân Trắng và Đen), công cụ Tẩy xóa (Eraser), kéo quân ra khỏi bàn để xóa.
- Vẽ mũi tên chiến thuật bằng thao tác kéo chuột phải (chuẩn Lichess).
- Lưu và quản lý các thế cờ tự tạo trong `localStorage`.

### 3. Chế Độ Đối Kháng (Multiplayer)
- **Chung máy (Hot-Seat)**:
  - Đồng hồ bấm giờ chuẩn thi đấu, tính toán theo dấu thời gian chính xác, chống giật lag và không bị sai lệch khi chuyển tab.
  - Các chế độ giờ chuẩn: Bullet (`1+0`, `2+1`), Blitz (`3+0`, `3+2`, `5+0`, `5+3`), Rapid (`10+0`, `15+10`), Classical (`30+0`), và Giờ tùy chỉnh (Custom).
  - Các cơ chế cộng giờ: Tích lũy Fischer, Trì hoãn USCF Delay, Trì hoãn Bronstein, và Giờ tuyệt đối (Sudden Death).
  - Cảnh báo trực quan và âm thanh khi thời gian còn dưới 15 giây.
- **Chơi Trực Tuyến (Online Firebase)**:
  - **Tạo phòng**: Tạo phòng chơi với mã 6 ký tự (ví dụ: `K7N2P9`) hoặc gửi link trực tiếp (`?room=ABC123`).
  - **Phân vai**: Người tạo phòng chọn quân (Trắng, Đen, hoặc Ngẫu nhiên); người thứ hai vào phòng nhận quân còn lại; người thứ ba trở đi tự động trở thành **Khán giả** (chế độ chỉ xem).
  - **Đồng hồ đồng bộ**: Không truyền tải từng nhịp tích tắc qua mạng nhằm tiết kiệm băng thông. Mỗi máy tự tính thời gian dựa trên mốc thời gian máy chủ của nước đi cuối cùng và hiệu chỉnh lệch giờ bằng `.info/serverTimeOffset`.
  - **Xử lý hết giờ nguyên tử**: Ghi nhận kết quả thắng/thua do hết giờ qua `runTransaction()` chống trùng lặp.
  - **Trạng thái kết nối**: Hiển thị đối thủ đang online hay mất kết nối; tự động khôi phục ván cờ khi tải lại trang web.
  - **Đấu lại (Rematch)**: Tự động đổi bên cầm quân (Trắng &harr; Đen) và bắt đầu trận đấu mới.

### 4. Cài Đặt & Đa Ngôn Ngữ
- Màn hình cài đặt cho phép thay đổi: Ngôn ngữ (English / Tiếng Việt), Giao diện (Sáng / Tối), Kiểu quân cờ (`cburnett`, `merida`, `alpha`), Màu sắc bàn cờ (`classic`, `wood`, `ocean`, `slate`), Âm thanh và Hiển thị tọa độ.
- Toàn bộ cài đặt được lưu tự động trong `localStorage`.

---

## Chạy Dự Án Cục Bộ (Local Dev)

```powershell
# Cài đặt thư viện
npm install

# Khởi chạy server phát triển
npm run dev

# Chạy kiểm thử tự động
npm test

# Đóng gói sản phẩm (Build)
npm run build

# Xem thử bản đóng gói production
npm run preview
```

---

## Hướng Dẫn Thiết Lập Firebase

1. Truy cập [Firebase Console](https://console.firebase.google.com/) và tạo project mới.
2. Vào **Authentication** &rarr; **Sign-in method** &rarr; bật **Anonymous** &rarr; nhấn **Save**.
3. Vào **Realtime Database** &rarr; nhấn **Create Database** &rarr; chọn khu vực lưu trữ.
4. Mở tab **Rules** của Realtime Database, dán nội dung tệp `database.rules.json` và nhấn **Publish**.
5. Sao chép các khóa cấu hình web vào tệp `.env` tại thư mục gốc.

---

## Cấu Hình GitHub Pages & GitHub Actions

1. Trong repository GitHub, vào mục **Settings** &rarr; **Pages**.
2. Tại phần **Source**, chọn **GitHub Actions**.
3. Vào **Settings** &rarr; **Secrets and variables** &rarr; **Actions** để thêm các biến môi trường Firebase (`VITE_FIREBASE_*`).

---

## Định Dạng Đường Dẫn Trực Tiếp

Trang web sau khi phát hành trên GitHub Pages sẽ có địa chỉ:
```text
https://gimmethejeremie.github.io/chess/
```
Liên kết vào thẳng phòng chơi online:
```text
https://gimmethejeremie.github.io/chess/?room=ABC123
```
