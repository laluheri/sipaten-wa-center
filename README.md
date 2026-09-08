# WA Center — QR Connection MVP

Prototipe koneksi WhatsApp Web melalui QR menggunakan Baileys. Kredensial sesi tersimpan secara lokal di folder `.sessions/` dan tidak boleh dimasukkan ke Git.

## Menjalankan

Cara termudah di Windows adalah klik dua kali `Jalankan WA Center.bat`. Biarkan jendela server tetap terbuka selama aplikasi digunakan.

Atau jalankan secara manual:

```bash
npm install
npm run dev
```

Buka `http://localhost:3100`, lalu login menggunakan akun awal:

- Email: `admin@wacenter.local`
- Password: `admin123`

Ubah akun ketika menjalankan server produksi dengan environment variable `ADMIN_EMAIL` dan `ADMIN_PASSWORD`. Setelah login, pindai QR melalui **WhatsApp → Perangkat tertaut → Tautkan perangkat**.

Setelah status **Online**, masukkan nomor tujuan dalam format kode negara (misalnya `628123456789`), isi pesan, lalu tekan **Kirim pesan**. Lakukan pengujian hanya ke nomor milik Anda atau penerima yang telah memberikan persetujuan.

## Integrasi SIPATEN

Device ID unik tampil pada tabel perangkat dan tersimpan permanen di `.data/device-id.txt`. SIPATEN dapat mengirim pesan melalui:

```http
POST http://localhost:3100/api/v1/messages/send
Content-Type: application/json
X-API-Key: sipaten-dev-key-change-me

{
  "deviceId": "DEVICE_ID_DARI_DASHBOARD",
  "phone": "628123456789",
  "message": "Pesan dari SIPATEN"
}
```

Atur `SIPATEN_API_KEY` dengan nilai rahasia yang kuat sebelum digunakan di jaringan atau produksi. Jangan gunakan API key bawaan untuk produksi.

## Catatan produksi

Baileys adalah integrasi tidak resmi. `useMultiFileAuthState` cocok untuk prototipe, bukan penyimpanan sesi SaaS berskala besar. Untuk produksi, enkripsi kredensial dan simpan auth state di database/secret storage, tambahkan autentikasi dashboard, pembatasan akses, audit log, dan backup aman.
