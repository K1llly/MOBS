# MOBS — Modüler Öğrenci Bilgi ve Eğitim Yönetim Sistemi

Ankara Bilim Üniversitesi **SENG 321 / BM321 Yazılım Mühendisliği Projesi — Takım 23**.

Tek bir kod tabanından; **dershane/kurs, ilkokul, ortaokul, lise ve üniversite** kurum tiplerini
kural preset'leri (Preset Engine) ile ayağa kaldırabilen modüler bir eğitim yönetim sistemidir.

## Temel Yaklaşım

- **API-First:** Tüm sözleşme [`docs/api/openapi.yaml`](docs/api/openapi.yaml) (OpenAPI 3.1) üzerinden tanımlanır.
- **Modüler Monolit:** `api/src/modules/{setup,auth,institution,classroom,attendance,grading,mock-exam,scheduling,enrollment}`
- **Preset Engine:** Kurum tipi seçildiğinde kurallar, notlandırma stratejisi ve feature flag'ler tek bir
  `prisma.$transaction` içinde üretilir.
- **Strateji Deseni:** `COURSE_SIMPLE`, `PRIMARY_DEVELOPMENT`, `MIDDLE_SCHOOL_MEB`, `HIGH_SCHOOL_MEB`, `UNIVERSITY_GPA`.
- **Kapsam Kilidi:** Ödeme/muhasebe, SMS/WhatsApp entegrasyonu, canlı ders ve dış SSO **kapsam dışıdır**.

## Rol Dağılımı

| Rol | Sorumluluk |
| :--- | :--- |
| **Yönetici (MANAGER)** | Öğretmen ve öğrenci hesaplarını **kullanıcı adı/şifre** ile oluşturur; şube, ders, kapasite, ders programı ve deneme şablonu/oturumu tanımlar; sonuçları görüntüler. **Not ve yoklama girmez.** |
| **Öğretmen (TEACHER)** | Yalnızca kendi derslerine **not**, yoklama ve deneme sonucu girer; müsaitlik tanımlar. |
| **Öğrenci (STUDENT)** | Kendi not, karne, devamsızlık ve deneme sonuçlarını görür. |

## Ders → Öğretmen → Ders Programı Akışı

1. **Yönetici ders oluşturur:** `Dersler & Öğretmen Atama` ekranında ders kodu, adı ve haftalık saati girilir.
2. **Öğretmen havuza atanır:** Aynı derse birden fazla öğretmen atanabilir; atama sırasında isim veya **branş** ile arama yapılır.
3. **Şubeye ders atanır:** `Sınıf / Şube` ekranında ders seçildiğinde öğretmen listesi yalnızca o dersin havuzundan gelir. Böylece iki matematik öğretmeni varsa 9-A'ya biri, 9-B'ye diğeri atanabilir.
4. **Program üretilir:** Hibrit ders programı bu şube-ders-öğretmen atamasını kullanır; öğretmen/sube/derslik çakışması engellenir.

## Kullanıcı ve Şube Kuralları

- **Arama:** Kullanıcılar; isim, kullanıcı adı veya öğrenci numarasıyla aranır. Öğretmenler de öğrenci seçerken (not, karne, deneme, yoklama, şube kaydı) aynı aramayı kullanır.
- **Şifre sıfırlama:** Yönetici, eski şifreyi görmeden öğrenci/öğretmen için yeni şifre belirler (`PATCH /users/{id}/password`).
- **Otomatik öğrenci numarası:** `YY + KADEME(2) + SIRA(4)` → `26090001` (2026-2027, 9. sınıf, 1. öğrenci). Numara boş bırakılırsa üretilir; istenirse elle de girilebilir.
- **Kademe:** Şubenin sınıf düzeyidir (9, 10, 11…). Öğrenci numarası üretiminde ve şube gruplamasında kullanılır; sınıf formunda kurumun tanımlı kademelerinden seçilir.

## Yönetici Araçları

- **Dashboard:** öğrenci/öğretmen/şube/ders sayıları, devamsızlık riski, açık ŞÖK dosyaları, program ve dönem durumu.
- **Devamsızlık & ŞÖK:** tüm öğrencilerin özürsüz/toplam devamsızlığı 10/30 sınırına göre; risk grubundakiler tek tıkla ŞÖK gündemine eklenir, kurul kararı kaydedilir.
- **Not Ağırlıkları:** yazılı, etkinlik, proje vb. türlerin ortalamaya etkisi (varsayılan tüm dersler; ders bazlı özel politikalar korunur).
- **Karne / Transkript Merkezi:** tek öğrenci veya tüm sınıf için toplu karne özeti (ortalama, durum, belge, devamsızlık) ve yazdırma.

## Depo Yapısı

```
.
├── api/                     # Node.js + Express + TypeScript + Prisma (REST API)
│   ├── prisma/schema.prisma # Tek kaynak veri modeli
│   └── src/modules/...      # Modüler monolit iş mantığı
├── web/                     # React + TypeScript (Vite) + Tailwind CSS
├── docs/
│   ├── AI-PROJECT-CONTEXT.md # Projenin tek doğruluk kaynağı (mimari + SRS özeti)
│   ├── architecture/         # C4 diyagramları, sequence diyagramları
│   └── api/openapi.yaml      # API sözleşmesi (OpenAPI 3.1)
├── docker-compose.yml       # db + api + web, tek komutla ayağa kalkar
└── .github/workflows/ci.yml # Her PR'da test + build
```

## Hızlı Başlangıç

### Docker ile (hedef)

```bash
cp .env.example .env
docker compose up --build
```

- Web: http://localhost:8080
- API: http://localhost:3000
- API dokümantasyonu (Swagger UI): http://localhost:3000/docs
- İlk açılışta arayüz otomatik olarak `/setup` kurulum sihirbazına yönlenir.

### Yerel geliştirme

```bash
# API
cd api
npm install
npx prisma migrate dev
npm run dev          # http://localhost:3000

# Web (ayrı terminal)
cd web
npm install
npm run dev          # http://localhost:5173
```

### Demo verisi (opsiyonel)

Kurulum yapıldıktan sonra örnek şubeler, dersler, öğretmen/öğrenci hesapları,
notlar ve bir deneme sınavı üretmek için:

```bash
cd api
npx tsx prisma/seed.ts
```

| Rol | Kullanıcı adı | Şifre |
| :--- | :--- | :--- |
| Yönetici | `demo` | `demo-sifre-123` |
| Öğretmen | `ayse` | `demo-sifre-123` |
| Öğrenci | `ogr1` | `demo-sifre-123` |

## Test

```bash
cd api && npm test          # Vitest
cd api && npm run test:cov  # lcov.info -> SonarQube
```

Hedef: **≥ %50 birim testi kapsamı**; öncelik preset engine, notlandırma stratejileri,
deneme net hesabı ve ders programı algoritmaları.

## Dallanma Modeli (Git-Flow)

- `main` ve `develop` korumalıdır, doğrudan push yasaktır.
- İşler `feature/<issue-id>-<kisa-isim>` dalında yapılır, en az 1 peer review onaylı PR ile birleşir.
- Sürümler `release/<version>` → `main` + `develop` olarak ilerler.

## Lisans

[MIT](LICENSE)
