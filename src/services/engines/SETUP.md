# Hướng Dẫn Setup Pikafish Engine

## Cấu Trúc Thư Mục

```
src/services/engines/
├── pikafish-windows-avx2.exe  ← Windows (đã có ✅)
├── pikafish-macos-arm64       ← macOS Apple Silicon (M1/M2/M3) - cần download
├── pikafish-macos-x64         ← macOS Intel - cần download (nếu cần)
├── pikafish-linux             ← Linux server - cần download (nếu deploy)
└── pikafish.nnue              ← File NNUE dùng chung cho mọi platform ✅
```

## Download Binary Theo Hệ Điều Hành

Tải bản mới nhất tại: **https://github.com/official-pikafish/Pikafish/releases**

### 🪟 Windows (thành viên 1 & 2)
File `pikafish-windows-avx2.exe` **đã có sẵn** trong repo. Không cần làm gì thêm.

### 🍎 macOS Apple Silicon – M1/M2/M3 (thành viên 3 - máy `arm64`)
1. Vào trang releases: https://github.com/official-pikafish/Pikafish/releases
2. Download file **`pikafish-macos-arm64`** (hoặc `Pikafish_mac-apple-silicon.tar.gz`)
3. Giải nén và đặt file binary vào:
   ```
   src/services/engines/pikafish-macos-arm64
   ```
4. Cấp quyền thực thi:
   ```bash
   chmod +x src/services/engines/pikafish-macos-arm64
   ```

### 🍎 macOS Intel (nếu dùng máy Intel Mac)
1. Download file **`pikafish-macos-x86-64-avx2`** từ trang releases
2. Đặt vào:
   ```
   src/services/engines/pikafish-macos-x64
   ```
3. Cấp quyền thực thi:
   ```bash
   chmod +x src/services/engines/pikafish-macos-x64
   ```

### 🐧 Linux (nếu deploy lên server)
1. Download file **`pikafish-ubuntu-x86-64-avx2`** từ trang releases
2. Đặt vào:
   ```
   src/services/engines/pikafish-linux
   ```
3. Cấp quyền thực thi:
   ```bash
   chmod +x src/services/engines/pikafish-linux
   ```

---

## Lưu Ý Quan Trọng

> **File NNUE (`pikafish.nnue`) dùng chung** — chỉ cần một file cho mọi platform.

> **Binary file KHÔNG được commit vào Git** (xem `.gitignore`).  
> Mỗi thành viên tự download binary phù hợp với máy mình.

> Nếu muốn dùng binary ở vị trí khác, set biến môi trường trong `.env`:
> ```
> PIKAFISH_PATH=/đường/dẫn/tùy/chỉnh/pikafish
> ```

---

## Kiểm Tra Hoạt Động

Sau khi đặt đúng file binary, chạy server và kiểm tra log:

```
[AI Engine] Platform: darwin/arm64
[AI Engine] Binary: /path/to/src/services/engines/pikafish-macos-arm64
[AI Engine] NNUE:   /path/to/src/services/engines/pikafish.nnue
```

Nếu thấy log như trên → Engine đã được cấu hình đúng ✅
