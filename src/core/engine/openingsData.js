/**
 * Curated FIDE Standard Opening Database
 * Indexed by move sequence string (clean SAN moves separated by single spaces, e.g. "e4 e5 Nf3 Nc6 Bb5")
 * Contains ECO code, English name, and Vietnamese name.
 */

export const OPENINGS_DATA = [
  // 1. e4 Openings
  { eco: 'B00', moves: 'e4', name: "King's Pawn Opening", nameVi: 'Khai cuộc Tốt Vua' },
  { eco: 'C20', moves: 'e4 e5', name: "King's Pawn Game", nameVi: 'Khai cuộc Mở' },
  { eco: 'C23', moves: 'e4 e5 Bc4', name: "Bishop's Opening", nameVi: 'Khai cuộc Tượng' },
  { eco: 'C25', moves: 'e4 e5 Nc3', name: 'Vienna Game', nameVi: 'Khai cuộc Vienna' },
  { eco: 'C30', moves: 'e4 e5 f4', name: "King's Gambit", nameVi: 'Gambit Vua' },
  { eco: 'C33', moves: 'e4 e5 f4 exf4', name: "King's Gambit Accepted", nameVi: 'Gambit Vua Chấp nhận' },
  { eco: 'C31', moves: 'e4 e5 f4 d5', name: "Falkbeer Counter-Gambit", nameVi: 'Gambit Phản công Falkbeer' },
  { eco: 'C40', moves: 'e4 e5 Nf3', name: "King's Knight Opening", nameVi: 'Khai cuộc Mã Vua' },
  { eco: 'C41', moves: 'e4 e5 Nf3 d6', name: 'Philidor Defense', nameVi: 'Phòng thủ Philidor' },
  { eco: 'C42', moves: 'e4 e5 Nf3 Nf6', name: "Petrov's Defense", nameVi: 'Phòng thủ Petrov' },
  { eco: 'C44', moves: 'e4 e5 Nf3 Nc6', name: 'Open Game: Two Knights Defense Setup', nameVi: 'Khai cuộc Mở: Phát triển Mã' },
  { eco: 'C45', moves: 'e4 e5 Nf3 Nc6 d4', name: 'Scotch Game', nameVi: 'Khai cuộc Scotland' },
  { eco: 'C45', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', name: 'Scotch Game: Main Line', nameVi: 'Khai cuộc Scotland: Nhánh chính' },
  { eco: 'C46', moves: 'e4 e5 Nf3 Nc6 Nc3', name: 'Three Knights Game', nameVi: 'Khai cuộc Ba Mã' },
  { eco: 'C47', moves: 'e4 e5 Nf3 Nc6 Nc3 Nf6', name: 'Four Knights Game', nameVi: 'Khai cuộc Bốn Mã' },
  { eco: 'C48', moves: 'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5', name: 'Four Knights: Spanish Variation', nameVi: 'Bốn Mã: Biến Tây Ban Nha' },
  
  // Italian Game (C50 - C59)
  { eco: 'C50', moves: 'e4 e5 Nf3 Nc6 Bc4', name: 'Italian Game', nameVi: 'Khai cuộc Ý' },
  { eco: 'C50', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5', name: 'Giuoco Piano', nameVi: 'Giuoco Piano (Khai cuộc Ý Cổ điển)' },
  { eco: 'C51', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4', name: 'Evans Gambit', nameVi: 'Gambit Evans' },
  { eco: 'C53', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3', name: 'Giuoco Piano: Classical', nameVi: 'Giuoco Piano: Cổ điển' },
  { eco: 'C54', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4', name: 'Giuoco Piano: Center Attack', nameVi: 'Giuoco Piano: Tấn công Trung tâm' },
  { eco: 'C55', moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6', name: 'Two Knights Defense', nameVi: 'Phòng thủ Hai Mã' },
  { eco: 'C57', moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5', name: 'Two Knights: Fried Liver Attack Setup', nameVi: 'Phòng thủ Hai Mã: Tấn công Fried Liver' },

  // Ruy Lopez / Spanish (C60 - C99)
  { eco: 'C60', moves: 'e4 e5 Nf3 Nc6 Bb5', name: 'Ruy Lopez', nameVi: 'Khai cuộc Tây Ban Nha (Ruy Lopez)' },
  { eco: 'C65', moves: 'e4 e5 Nf3 Nc6 Bb5 Nf6', name: 'Ruy Lopez: Berlin Defense', nameVi: 'Ruy Lopez: Phòng thủ Berlin' },
  { eco: 'C68', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6', name: 'Ruy Lopez: Exchange Variation', nameVi: 'Ruy Lopez: Biến Đổi quân' },
  { eco: 'C70', moves: 'e4 e5 Nf3 Nc6 Bb5 a6', name: 'Ruy Lopez: Morphy Defense', nameVi: 'Ruy Lopez: Phòng thủ Morphy' },
  { eco: 'C78', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O', name: 'Ruy Lopez: Closed Setup', nameVi: 'Ruy Lopez: Nhập thành' },
  { eco: 'C88', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O', name: 'Ruy Lopez: Closed Main Line', nameVi: 'Ruy Lopez: Nhánh chính Đóng' },
  { eco: 'C80', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4', name: 'Ruy Lopez: Open Defense', nameVi: 'Ruy Lopez: Phòng thủ Mở' },

  // Sicilian Defense (B20 - B99)
  { eco: 'B20', moves: 'e4 c5', name: 'Sicilian Defense', nameVi: 'Phòng thủ Sicilia' },
  { eco: 'B21', moves: 'e4 c5 f4', name: 'Sicilian: Grand Prix Attack', nameVi: 'Sicilia: Tấn công Grand Prix' },
  { eco: 'B21', moves: 'e4 c5 d4 cxd4 c3', name: 'Sicilian: Smith-Morra Gambit', nameVi: 'Sicilia: Gambit Smith-Morra' },
  { eco: 'B22', moves: 'e4 c5 c3', name: 'Sicilian: Alapin Variation', nameVi: 'Sicilia: Biến Alapin' },
  { eco: 'B23', moves: 'e4 c5 Nc3', name: 'Closed Sicilian', nameVi: 'Sicilia Đóng' },
  { eco: 'B27', moves: 'e4 c5 Nf3', name: 'Open Sicilian Setup', nameVi: 'Sicilia: Chuẩn bị Mở' },
  { eco: 'B30', moves: 'e4 c5 Nf3 Nc6', name: 'Old Sicilian', nameVi: 'Sicilia Cổ điển' },
  { eco: 'B32', moves: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4', name: 'Open Sicilian', nameVi: 'Sicilia Mở' },
  { eco: 'B33', moves: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5', name: 'Sicilian: Sveshnikov Variation', nameVi: 'Sicilia: Biến Sveshnikov' },
  { eco: 'B40', moves: 'e4 c5 Nf3 e6', name: 'Sicilian: French Variation', nameVi: 'Sicilia: Biến Pháp' },
  { eco: 'B41', moves: 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6', name: 'Sicilian: Kan Variation', nameVi: 'Sicilia: Biến Kan' },
  { eco: 'B45', moves: 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6', name: 'Sicilian: Four Knights', nameVi: 'Sicilia: Bốn Mã' },
  { eco: 'B50', moves: 'e4 c5 Nf3 d6', name: 'Sicilian: Classical Setup', nameVi: 'Sicilia: Nhánh d6' },
  { eco: 'B53', moves: 'e4 c5 Nf3 d6 d4 cxd4 Qxd4', name: 'Sicilian: Chekhover Variation', nameVi: 'Sicilia: Biến Chekhover' },
  { eco: 'B70', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6', name: 'Sicilian: Dragon Variation', nameVi: 'Sicilia: Biến Rồng (Dragon)' },
  { eco: 'B90', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', name: 'Sicilian: Najdorf Variation', nameVi: 'Sicilia: Biến Najdorf' },

  // French Defense (C00 - C19)
  { eco: 'C00', moves: 'e4 e6', name: 'French Defense', nameVi: 'Phòng thủ Pháp' },
  { eco: 'C01', moves: 'e4 e6 d4 d5 exd5 exd5', name: 'French: Exchange Variation', nameVi: 'Pháp: Biến Đổi quân' },
  { eco: 'C02', moves: 'e4 e6 d4 d5 e5', name: 'French: Advance Variation', nameVi: 'Pháp: Biến Đẩy tốt e5' },
  { eco: 'C03', moves: 'e4 e6 d4 d5 Nd2', name: 'French: Tarrasch Variation', nameVi: 'Pháp: Biến Tarrasch' },
  { eco: 'C10', moves: 'e4 e6 d4 d5 Nc3', name: 'French: Paulsen / Classical Line', nameVi: 'Pháp: Biến Paulsen' },
  { eco: 'C11', moves: 'e4 e6 d4 d5 Nc3 Nf6', name: 'French: Classical Variation', nameVi: 'Pháp: Biến Cổ điển' },
  { eco: 'C15', moves: 'e4 e6 d4 d5 Nc3 Bb4', name: 'French: Winawer Variation', nameVi: 'Pháp: Biến Winawer' },

  // Caro-Kann Defense (B10 - B19)
  { eco: 'B10', moves: 'e4 c6', name: 'Caro-Kann Defense', nameVi: 'Phòng thủ Caro-Kann' },
  { eco: 'B12', moves: 'e4 c6 d4 d5 e5', name: 'Caro-Kann: Advance Variation', nameVi: 'Caro-Kann: Biến Đẩy tốt e5' },
  { eco: 'B13', moves: 'e4 c6 d4 d5 exd5 cxd5', name: 'Caro-Kann: Exchange Variation', nameVi: 'Caro-Kann: Biến Đổi quân' },
  { eco: 'B14', moves: 'e4 c6 d4 d5 exd5 cxd5 c4', name: 'Caro-Kann: Panov-Botvinnik Attack', nameVi: 'Caro-Kann: Tấn công Panov-Botvinnik' },
  { eco: 'B15', moves: 'e4 c6 d4 d5 Nc3', name: 'Caro-Kann: Modern Line', nameVi: 'Caro-Kann: Nhánh Hiện đại' },
  { eco: 'B18', moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5', name: 'Caro-Kann: Classical Variation', nameVi: 'Caro-Kann: Biến Cổ điển' },

  // Other 1. e4 Defenses
  { eco: 'B01', moves: 'e4 d5', name: 'Scandinavian Defense', nameVi: 'Phòng thủ Scandinavia' },
  { eco: 'B01', moves: 'e4 d5 exd5 Qxd5', name: 'Scandinavian: Mieses-Kotroc Variation', nameVi: 'Scandinavia: Hậu ăn d5' },
  { eco: 'B01', moves: 'e4 d5 exd5 Nf6', name: 'Scandinavian: Modern Variation', nameVi: 'Scandinavia: Mã f6' },
  { eco: 'B02', moves: 'e4 Nf6', name: "Alekhine's Defense", nameVi: 'Phòng thủ Alekhine' },
  { eco: 'B07', moves: 'e4 d6 d4 Nf6 Nc3 g6', name: 'Pirc Defense', nameVi: 'Phòng thủ Pirc' },
  { eco: 'B06', moves: 'e4 g6', name: 'Modern Defense', nameVi: 'Phòng thủ Hiện đại' },

  // 1. d4 Openings
  { eco: 'A40', moves: 'd4', name: "Queen's Pawn Opening", nameVi: 'Khai cuộc Tốt Hậu' },
  { eco: 'D00', moves: 'd4 d5', name: "Queen's Pawn Game", nameVi: 'Khai cuộc Tốt Hậu Đóng' },
  { eco: 'D00', moves: 'd4 d5 Bf4', name: 'London System: Early Bishop', nameVi: 'Hệ thống London: Tượng f4 sớm' },
  { eco: 'D02', moves: 'd4 d5 Nf3 Nf6 Bf4', name: 'London System', nameVi: 'Hệ thống London' },
  { eco: 'D05', moves: 'd4 d5 Nf3 Nf6 e3 e6 Bd3 c5 c3', name: 'Colle System', nameVi: 'Hệ thống Colle' },

  // Queen's Gambit (D06 - D69)
  { eco: 'D06', moves: 'd4 d5 c4', name: "Queen's Gambit", nameVi: "Gambit Hậu (Queen's Gambit)" },
  { eco: 'D20', moves: 'd4 d5 c4 dxc4', name: "Queen's Gambit Accepted", nameVi: 'Gambit Hậu Chấp nhận' },
  { eco: 'D30', moves: 'd4 d5 c4 e6', name: "Queen's Gambit Declined", nameVi: 'Gambit Hậu Từ chối' },
  { eco: 'D35', moves: 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5', name: "Queen's Gambit Declined: Exchange", nameVi: 'Gambit Hậu Từ chối: Biến Đổi quân' },
  { eco: 'D50', moves: 'd4 d5 c4 e6 Nc3 Nf6 Bg5', name: "Queen's Gambit Declined: Modern", nameVi: 'Gambit Hậu Từ chối: Tượng g5' },
  { eco: 'D10', moves: 'd4 d5 c4 c6', name: 'Slav Defense', nameVi: 'Phòng thủ Slav' },
  { eco: 'D15', moves: 'd4 d5 c4 c6 Nf3 Nf6 Nc3', name: 'Slav Defense: Three Knights', nameVi: 'Phòng thủ Slav: Ba Mã' },
  { eco: 'D43', moves: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6', name: 'Semi-Slav Defense', nameVi: 'Phòng thủ Bán Slav (Semi-Slav)' },

  // Indian Defenses (A45, E00 - E99)
  { eco: 'A45', moves: 'd4 Nf6', name: 'Indian Defense', nameVi: 'Phòng thủ Ấn Độ' },
  { eco: 'E00', moves: 'd4 Nf6 c4 e6 g3', name: 'Catalan Opening', nameVi: 'Khai cuộc Catalan' },
  { eco: 'E12', moves: 'd4 Nf6 c4 e6 Nf3 b6', name: "Queen's Indian Defense", nameVi: 'Phòng thủ Ấn Độ Hậu' },
  { eco: 'E20', moves: 'd4 Nf6 c4 e6 Nc3 Bb4', name: 'Nimzo-Indian Defense', nameVi: 'Phòng thủ Nimzo-Indian' },
  { eco: 'E60', moves: 'd4 Nf6 c4 g6', name: "King's Indian / Grünfeld Setup", nameVi: 'Chuẩn bị Ấn Độ Vua / Grünfeld' },
  { eco: 'E61', moves: 'd4 Nf6 c4 g6 Nc3 Bg7', name: "King's Indian Defense", nameVi: 'Phòng thủ Ấn Độ Vua (KID)' },
  { eco: 'E90', moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O', name: "King's Indian: Classical", nameVi: 'Ấn Độ Vua: Biến Cổ điển' },
  { eco: 'D70', moves: 'd4 Nf6 c4 g6 Nc3 d5', name: 'Grünfeld Defense', nameVi: 'Phòng thủ Grünfeld' },
  { eco: 'D85', moves: 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3', name: 'Grünfeld: Exchange Variation', nameVi: 'Grünfeld: Biến Đổi quân' },
  { eco: 'A60', moves: 'd4 Nf6 c4 c5 d5', name: 'Benoni Defense', nameVi: 'Phòng thủ Benoni' },
  { eco: 'A57', moves: 'd4 Nf6 c4 c5 d5 b5', name: 'Benko Gambit', nameVi: 'Gambit Benko' },
  { eco: 'A80', moves: 'd4 f5', name: 'Dutch Defense', nameVi: 'Phòng thủ Hà Lan' },

  // Flank Openings
  { eco: 'A10', moves: 'c4', name: 'English Opening', nameVi: 'Khai cuộc Anh' },
  { eco: 'A15', moves: 'c4 Nf6', name: 'English: Anglo-Indian Defense', nameVi: 'Khai cuộc Anh: Anglo-Indian' },
  { eco: 'A20', moves: 'c4 e5', name: 'English: King’s English', nameVi: 'Khai cuộc Anh: Biến e5' },
  { eco: 'A04', moves: 'Nf3', name: 'Zukertort / Réti Opening', nameVi: 'Khai cuộc Réti / Zukertort' },
  { eco: 'A09', moves: 'Nf3 d5 c4', name: 'Réti Opening', nameVi: 'Khai cuộc Réti' },
  { eco: 'A02', moves: 'f4', name: "Bird's Opening", nameVi: 'Khai cuộc Bird' }
];
