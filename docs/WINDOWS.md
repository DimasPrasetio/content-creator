# content-creator di Windows (lewat WSL2)

content-creator berjalan di Windows lewat **WSL2**, yaitu Ubuntu yang berjalan di dalam Windows. Setup Windows asli tanpa
WSL tidak didukung. Siapkan ±30-45 menit; sebagian besar waktunya habis untuk menunggu unduhan.

Syarat: Windows 10 versi 22H2 atau Windows 11, RAM 8 GB atau lebih, dan ruang kosong ±10 GB di drive C:.

## 1. Pasang WSL2 + Ubuntu (sekali)

1. Klik kanan **Start** → **Terminal (Admin)** atau **PowerShell (Admin)**, lalu jalankan:
   ```powershell
   wsl --install -d Ubuntu-24.04
   ```
2. **Restart** komputer bila diminta.
3. Setelah restart, jendela Ubuntu terbuka sendiri. Buat **nama pengguna dan password Linux**. Password ini dipakai
   setup satu kali untuk memasang komponen sistem. Ketikannya memang tidak terlihat di layar.
4. Berikutnya, buka Ubuntu kapan saja dari menu Start (cari "Ubuntu") atau dari tab Windows Terminal.

Sudah punya WSL versi 1? Jalankan `wsl --set-version Ubuntu-24.04 2` di PowerShell.

## 2. Pasang Claude Code di Ubuntu

Di jendela Ubuntu:
```bash
sudo apt-get update && sudo apt-get install -y curl git
curl -fsSL https://claude.ai/install.sh | bash
```
Tutup lalu buka lagi jendela Ubuntu, kemudian jalankan `claude` dan login.

> Claude Code harus dipasang **di dalam Ubuntu**, bukan di Windows. Plugin dan mesin render berjalan di Linux.

## 3. Pasang plugin + setup

Buat folder workspace di **sistem file Linux**, jangan di `C:` (`/mnt/c/...`), karena di sana render jauh lebih lambat:
```bash
mkdir -p ~/ContentCreator && cd ~/ContentCreator && claude
```
Lalu, di dalam Claude Code:
```
/plugin marketplace add DimasPrasetio/content-creator
/plugin install content-creator@content-creator
/content-creator:setup ~/ContentCreator
```
Setup memasang Node, ffmpeg, Python, rclone, Chromium, dan library sistemnya. Untuk bagian yang butuh hak admin, Claude
akan meminta Anda menjalankan satu perintah sendiri:
```
! bash ~/.claude/plugins/cache/content-creator/content-creator/<versi>/bin/setup.sh ~/ContentCreator
```
Perintah dengan awalan `!` berjalan di terminal Anda. Setup akan meminta **password Linux** satu kali. Di WSL, setup
juga memasang `wslu`, supaya halaman login (ElevenLabs, Higgsfield, Google) terbuka di browser Windows.

## 4. Akun

```bash
cd ~/ContentCreator/Engine && npm run akun
```
Perintah ini menampilkan status ElevenLabs, Higgsfield, dan Google Drive, berikut perintah login yang tersisa. Claude
memandu satu per satu. Login selalu Anda lakukan sendiri di browser. **Jangan menempel key atau kode ke obrolan.**

Bila browser tidak terbuka sendiri, salin URL yang tercetak di terminal ke Chrome/Edge di Windows. Login Google Drive
(`rclone config create ...`) memakai alamat `http://127.0.0.1:53682/...`, dan alamat itu tetap bisa dibuka dari browser
Windows karena WSL2 meneruskan `localhost`.

## 5. Memindahkan file antara Windows dan workspace

| Ingin | Cara |
|---|---|
| Membuka folder hasil di File Explorer | `cd ~/ContentCreator/Result && explorer.exe .` |
| Menaruh footage/referensi dari Windows | buka `\\wsl.localhost\Ubuntu-24.04\home\<nama>\ContentCreator\` di File Explorer lalu seret file ke `References/` atau folder proyek; atau `cp /mnt/c/Users/<nama>/Videos/rekaman.mp4 ~/ContentCreator/References/` |
| Memutar video hasil | buka dari File Explorer (lihat baris pertama), atau `explorer.exe <nama>.mp4` |

Sebaiknya file disalin dulu ke workspace. Membaca footage besar langsung dari `/mnt/c/...` lebih lambat.

## 6. Tenaga untuk render (opsional)

Secara bawaan, WSL2 memakai maksimal separuh RAM Windows. Bila render terasa berat, buat file
`C:\Users\<nama>\.wslconfig`:
```ini
[wsl2]
memory=8GB
processors=4
```
Lalu jalankan `wsl --shutdown` di PowerShell dan buka Ubuntu lagi. GPU tidak diperlukan.

## Masalah umum

| Gejala | Solusi |
|---|---|
| `wsl --install` tidak dikenal | Windows terlalu lama: perbarui lewat Windows Update, atau aktifkan "Virtual Machine Platform" + "Windows Subsystem for Linux" di *Turn Windows features on or off* |
| Error virtualisasi saat membuka Ubuntu | aktifkan Virtualization (VT-x/AMD-V) di BIOS |
| Render sangat lambat | workspace ada di `/mnt/c/...`: pindahkan ke `~/ContentCreator` |
| Halaman login tidak terbuka | salin URL dari terminal ke browser Windows; atau `sudo apt-get install -y wslu` lalu jalankan setup lagi |
| `node`/`ffmpeg` tidak dikenali | `. ~/.config/content-creator/env.sh`, atau tutup lalu buka lagi jendela Ubuntu |
| Jam WSL melenceng (login gagal "token expired") | `sudo hwclock -s` atau `wsl --shutdown` lalu buka lagi |
