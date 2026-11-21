// Pasang aturan Firestore untuk koleksi "keuangan_jepang" (halaman project2/keuangan-jepang.html) di proyek mds-sulawesi.
// AMAN: aturan yang sedang AKTIF di Firebase diambil dulu, lalu hanya SATU blok ditambahkan di akhir. Aturan lain tidak disentuh
// (jadi tidak memakai firestore.rules di repo ini, yang bisa lebih lama dari yang aktif). Kalau sudah ada, tidak ada yang diubah.
//
// Pakai: node deploy-rules.js --dry [token]   (tanpa token: tampilkan blok saja; dengan token: tampilkan hasil akhirnya)
//        node deploy-rules.js <token>         (pasang sungguhan)
// Token = OAuth access token Google (ya29...) dengan scope cloud-platform, sama seperti untuk firebase-deploy.js. JANGAN di-commit.
const crypto = require("crypto");
const PROJECT = "mds-sulawesi";
const DRY = process.argv.includes("--dry");
let TOKEN = process.argv.slice(2).find(a => !a.startsWith("--")) || process.env.FB_TOKEN;
const FB_CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FB_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

const BLOK = `    // keuangan_jepang (project2/keuangan-jepang.html): dokumen trip + subkoleksi orang / cat / lunas.
    // Daftar seluruh trip DITOLAK; kode trip yang acak berfungsi sebagai kunci.
    match /keuangan_jepang/{room} {
      allow get: if true;
      allow list: if false;
      allow create, update: if true;
      allow delete: if false;
      match /{sub}/{docId} { allow read, write: if true; }
    }`;

// Sisipkan BLOK sebelum "}" penutup "match /databases/{database}/documents" (dua baris "}" terakhir).
function sisip(content) {
  if (/keuangan_jepang/.test(content)) return null;
  const lines = content.replace(/\s+$/, "").split("\n");
  const tutup = [];
  lines.forEach((l, i) => { if (/^\s*\}\s*$/.test(l)) tutup.push(i); });
  const n = lines.length - 1;
  if (tutup.length < 2 || tutup[tutup.length - 1] !== n || tutup[tutup.length - 2] !== n - 1)
    throw new Error("struktur aturan tidak dikenali (dua baris } terakhir tidak ditemukan), tidak ada yang diubah");
  lines.splice(n - 1, 0, "", ...BLOK.split("\n"));
  const hasil = lines.join("\n") + "\n";
  const h = (hasil.match(/\{/g) || []).length, t = (hasil.match(/\}/g) || []).length;
  if (h !== t) throw new Error("kurung tidak seimbang setelah penyisipan, dibatalkan");
  return hasil;
}
module.exports = { sisip, BLOK };

async function accessToken(t) {
  // service account JSON (satu baris/isi file) → tanda tangan JWT → access token
  if (t.trim().startsWith("{")) {
    let sa;
    try { sa = JSON.parse(t); } catch (e) { throw new Error("JSON service account tidak bisa dibaca"); }
    if (!sa.client_email || !sa.private_key) throw new Error("service account tidak lengkap (client_email/private_key kosong)");
    const now = Math.floor(Date.now() / 1000);
    const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.hosting https://www.googleapis.com/auth/cloud-platform",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now, exp: now + 3600,
    });
    const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
    const r = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + sig }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error("service account ditolak (" + r.status + "): " + (j.error_description || j.error || "?"));
    return j.access_token;
  }
  // access token Google berumur ~1 jam dan bentuknya "ya29...." → pakai langsung
  if (/^ya29\./.test(t)) return t;
  // refresh token dari `firebase login:ci` (biasanya mulai "1//") → tukar
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: FB_CLIENT_ID,
      client_secret: FB_CLIENT_SECRET,
      refresh_token: t,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    throw new Error("token ditolak saat ditukar (" + r.status + "): " +
      (j.error_description || j.error || "periksa apakah token dari `firebase login:ci`"));
  }
  return j.access_token;
}


async function api(url, opt = {}) {
  const r = await fetch(url, { ...opt, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(opt.headers || {}) } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${opt.method || "GET"} ${url.split("/").slice(-2).join("/")} -> ${r.status} ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : {};
}

if (require.main === module) (async () => {
  if (DRY && !TOKEN) { console.log("[dry] blok yang akan ditambahkan:\n\n" + BLOK); return; }
  if (!TOKEN) throw new Error("token kosong - pakai: node deploy-rules.js <token>");
  TOKEN = String(TOKEN).replace(/\s+/g, "");
  TOKEN = await accessToken(TOKEN);
  const ti = await fetch("https://oauth2.googleapis.com/tokeninfo?access_token=" + encodeURIComponent(TOKEN));
  const tj = await ti.json().catch(() => ({}));
  if (!ti.ok) throw new Error("Google menolak token (" + (tj.error_description || tj.error || ti.status) + "). Ambil token baru; pakai: read -s T; node deploy-rules.js \"$T\"");
  console.log(`token OK (sisa ${Math.round((tj.expires_in || 0) / 60)} menit)`);
  const BASE = "https://firebaserules.googleapis.com/v1";
  const rel = await api(`${BASE}/projects/${PROJECT}/releases/cloud.firestore`);
  const rs = await api(`${BASE}/${rel.rulesetName}`);
  const f = (rs.source.files || []).find(x => /rules$/.test(x.name)) || rs.source.files[0];
  console.log(`aturan aktif: ${rel.rulesetName.split("/").pop()} (${f.content.split("\n").length} baris)`);
  const baru = sisip(f.content);
  if (baru === null) { console.log("Sudah ada aturan keuangan_jepang, tidak ada yang diubah."); return; }
  if (DRY) { console.log("[dry] hasil akhir:\n\n" + baru); return; }
  const created = await api(`${BASE}/projects/${PROJECT}/rulesets`, { method: "POST", body: JSON.stringify({ source: { files: [{ name: f.name, content: baru }] } }) });
  await api(`${BASE}/projects/${PROJECT}/releases/cloud.firestore`, { method: "PATCH", body: JSON.stringify({ release: { name: `projects/${PROJECT}/releases/cloud.firestore`, rulesetName: created.name } }) });
  console.log("✓ aturan terpasang:", created.name.split("/").pop());
  console.log("  Cadangan aturan lama (kalau perlu kembali): " + rel.rulesetName);
})().catch(e => { console.error("GAGAL: " + e.message); process.exit(1); });
