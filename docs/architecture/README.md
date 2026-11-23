# Sistem Mimarisi — C4 ve Akış Diyagramları

> Kaynak bağlam: [`AI-PROJECT-CONTEXT.md`](../AI-PROJECT-CONTEXT.md) · API sözleşmesi:
> [`openapi.yaml`](../api/openapi.yaml) · Veri modeli: [`api/prisma/schema.prisma`](../../api/prisma/schema.prisma)

## 1. C4 — System Context (Level 1)

```mermaid
C4Context
  title MOBS — Sistem Bağlamı

  Person(manager, "Yönetici (MANAGER)", "Kurum kurulumu, sınıf/kapasite, program ve raporlar")
  Person(teacher, "Öğretmen (TEACHER)", "Müsaitlik, yoklama, not ve deneme sonuçları")
  Person(student, "Öğrenci (STUDENT)", "Program, notlar, karne, deneme sonuçları")

  System(mobs, "MOBS", "Modüler kurum yönetimi: preset engine, notlandırma stratejileri, hibrit ders programı, deneme sınavı takibi")

  SystemDb_Ext(postgres, "PostgreSQL", "İlişkisel veri (Prisma ile erişilir)")

  Rel(manager, mobs, "HTTPS / JSON")
  Rel(teacher, mobs, "HTTPS / JSON")
  Rel(student, mobs, "HTTPS / JSON")
  Rel(mobs, postgres, "SQL (Prisma ORM)")
```

## 2. C4 — Container (Level 2)

```mermaid
flowchart LR
  subgraph Kullanıcı
    B[Tarayıcı]
  end

  subgraph "Docker Compose"
    W["web<br/>React SPA + Nginx<br/>(:8080)"]
    A["api<br/>Node.js + Express + Prisma<br/>(:3000)"]
    D[("db<br/>PostgreSQL 16")]
  end

  B -->|HTTP| W
  W -->|"/setup, /auth, /health proxy"| A
  B -.->|doğrudan API çağrısı| A
  A -->|SQL| D
```

- **web** — React + Vite + Tailwind; `/setup` sihirbazı, rol bazlı panel, feature flag'e göre dinamik menü.
- **api** — Modüler monolit; preset engine, JWT/RBAC, notlandırma stratejileri, deneme hesabı, ders programı motoru.
- **db** — Tek PostgreSQL; tüm ilişkisel bütünlük Prisma şemasında tanımlı.

## 3. C4 — Component (Level 3, API)

```mermaid
flowchart TB
  subgraph API["api (Express)"]
    MW["middlewares<br/>auth · rbac · validate · error · setupGuard"]
    SETUP["modules/setup<br/>SetupService · PRESETS<br/>validateRuleCompatibility"]
    AUTH["modules/auth<br/>AuthService (bcrypt + JWT)"]
    GRADE["modules/grading<br/>GradingStrategy hesaplayıcıları"]
    SCHED["modules/scheduling<br/>autoSchedule (DFS + geri izleme)"]
    MOCK["modules/mock-exam<br/>net/boş hesabı · etki kilidi"]
    FUTURE["classroom · attendance<br/>institution · enrollment"]
    PRISMA["lib/prisma<br/>PrismaClient"]
  end

  SETUP --> PRISMA
  AUTH --> PRISMA
  GRADE --> PRISMA
  SCHED --> PRISMA
  MOCK --> PRISMA
  FUTURE --> PRISMA
  MW --> SETUP
  MW --> AUTH
  MW --> GRADE
  MW --> SCHED
  MW --> MOCK
```

**Modül izolasyonu:** Modüller başka modülün Prisma modeline doğrudan erişmez; servis
arayüzleri (`SetupService`, `AuthService`, …) üzerinden konuşur.

## 4. Sequence — Kurulum (SetupService)

```mermaid
sequenceDiagram
  autonumber
  actor M as Yönetici
  participant W as Web (/setup)
  participant R as API Router
  participant S as SetupService
  participant P as Preset Engine
  participant DB as PostgreSQL

  M->>W: Kurum tipi + profil + admin bilgileri
  W->>R: POST /setup/initialize
  R->>S: initialize(dto)
  S->>DB: isInitialized?
  alt Zaten kurulu
    S-->>R: 403 SYSTEM_ALREADY_INITIALIZED
    R-->>W: 403
  else İlk kurulum
    S->>P: getPreset(type) + validateRuleCompatibility
    P-->>S: kurallar, flag'ler, kademeler
    S->>DB: BEGIN TRANSACTION
    S->>DB: InstitutionConfig + FeatureFlag[] + RuleSetItem[]
    S->>DB: GradeLevel[] + GradeWeightPolicy[] + AcademicYear/Term
    S->>DB: User (MANAGER, bcrypt)
    S->>DB: AuditLog
    S->>DB: COMMIT
    S-->>R: 201 { institutionId, adminUsername }
    R-->>W: 201
  end
```

## 5. Sequence — Otomatik Ders Programı

```mermaid
sequenceDiagram
  autonumber
  actor M as Yönetici
  participant W as Web
  participant R as API
  participant E as autoSchedule
  participant DB as PostgreSQL

  M->>W: "Otomatik Doldur"
  W->>R: POST /schedule/auto-fill
  R->>DB: pinned slotlar + TeacherAvailability
  DB-->>R: kilitli slotlar, müsaitlik matrisi
  R->>E: autoSchedule({ blocks, availability, pinned })
  loop Her blok (saat süresine göre azalan)
    E->>E: aday gün/saat üret (çakışma + UNAVAILABLE ele)
    E->>E: yerleştir → derinlemesine ara → geri al
  end
  E-->>R: { placed[], unplaced[] }
  R-->>W: 200 (kısmi sonuç da başarıdır)
  W-->>M: Yerleşenler + yerleşemeyenler ve nedeni
```

## 6. Notlandırma Stratejisi Seçimi

```mermaid
flowchart LR
  C[InstitutionConfig.gradingStrategy] --> S{switch}
  S -->|COURSE_SIMPLE| A1[Kur sınavı ortalaması + tek baraj]
  S -->|PRIMARY_DEVELOPMENT| A2[Gelişim raporu — sayısal puan yok]
  S -->|MIDDLE_SCHOOL_MEB| A3[Türkçe ≥ 70 / diğer ≥ 50 → yoksa ŞÖK]
  S -->|HIGH_SCHOOL_MEB| A4[50/70 ders geçme · 3/6 sorumluluk · 10/30 devamsızlık]
  S -->|UNIVERSITY_GPA| A5[Vize/Final/Bütünleme → AA–FF → GPA/CGPA]
```

## 7. Kod → Gereksinim İzlenebilirliği

| Gereksinim | Kod |
| :--- | :--- |
| FR-SETUP-01..05 | `api/src/modules/setup/*`, `middlewares/setupGuard.ts` |
| FR-SCH-01..06 | `api/src/modules/scheduling/scheduler.ts` |
| FR-MOCK-01..05 | `api/src/modules/mock-exam/mock-exam.calc.ts` |
| US-01 (JWT/RBAC) | `api/src/modules/auth/*`, `middlewares/auth.ts`, `middlewares/rbac.ts` |
| US-04 (strateji) | `api/src/modules/grading/grading.strategies.ts` |
| Test senaryoları | `api/src/modules/**/*.test.ts` (46 test) |
