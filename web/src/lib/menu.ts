import type { Role } from '../types';

export interface MenuItem {
  label: string;
  path: string;
  icon: string;
}

type Flags = Record<string, boolean>;

/**
 * Kurum tipine ve feature flag'lere göre dinamik menü (Bölüm 5 matrisi).
 * Menü görünürlüğü backend'deki bayraklarla aynı kaynaktan beslenir.
 */
export function menuFor(role: Role, flags: Flags): MenuItem[] {
  const common: MenuItem[] = [
    { label: 'Ana Sayfa', path: '/dashboard', icon: '🏠' },
    { label: 'Ders Programı', path: '/dashboard/schedule', icon: '🗓️' },
  ];

  switch (role) {
    case 'MANAGER':
      return [
        ...common,
        { label: 'Sınıf / Şube & Kapasite', path: '/dashboard/classes', icon: '🏫' },
        { label: 'Kullanıcılar & Atamalar', path: '/dashboard/users', icon: '👥' },
        { label: 'Sınav & Ağırlık Politikaları', path: '/dashboard/grading', icon: '📊' },
        ...(flags.MOCK_EXAM
          ? [{ label: 'Deneme Şablonları & Oturumlar', path: '/dashboard/mock-exams', icon: '📝' }]
          : []),
        ...(flags.COUNCIL_CASE
          ? [{ label: 'Devamsızlık & ŞÖK', path: '/dashboard/council', icon: '⚖️' }]
          : []),
        ...(flags.ADD_DROP
          ? [{ label: 'Ders Kataloğu & Ön Koşullar', path: '/dashboard/catalog', icon: '📚' }]
          : []),
        { label: 'Karne / Transkript Merkezi', path: '/dashboard/reports', icon: '🎓' },
      ];
    case 'TEACHER':
      return [
        ...common,
        { label: 'Müsaitlik & Saat Tercihleri', path: '/dashboard/availability', icon: '⏱️' },
        { label: 'Sınıflarım / Derslerim', path: '/dashboard/my-classes', icon: '🏫' },
        { label: 'Yoklama', path: '/dashboard/attendance', icon: '✅' },
        {
          label: flags.DEVELOPMENT_REPORT ? 'Gelişim Raporu' : 'Not Girişi',
          path: '/dashboard/grades',
          icon: '📝',
        },
        ...(flags.MOCK_EXAM
          ? [{ label: 'Deneme Sonuç Girişi', path: '/dashboard/mock-results', icon: '📈' }]
          : []),
        ...(flags.ADVISOR_APPROVAL
          ? [{ label: 'Danışmanlık & Ders Onayı', path: '/dashboard/advising', icon: '🧑‍🏫' }]
          : []),
      ];
    case 'STUDENT':
      return [
        ...common,
        { label: 'Yoklama & Devamsızlık', path: '/dashboard/attendance', icon: '✅' },
        { label: 'Notlarım', path: '/dashboard/grades', icon: '📊' },
        ...(flags.MOCK_EXAM
          ? [{ label: 'Deneme Sınavlarım', path: '/dashboard/mock-exams', icon: '📈' }]
          : []),
        { label: 'Dijital Karne', path: '/dashboard/report-card', icon: '🎓' },
        ...(flags.ADD_DROP
          ? [{ label: 'Ders Seçimi (Ekle-Sil)', path: '/dashboard/enrollment', icon: '🧾' }]
          : []),
      ];
    case 'PARENT':
      return [
        { label: 'Öğrenci Seç', path: '/dashboard', icon: '👨‍👩‍👧' },
        { label: 'Devamsızlık', path: '/dashboard/attendance', icon: '✅' },
        { label: 'Not / Gelişim Raporu', path: '/dashboard/grades', icon: '📊' },
        ...(flags.MOCK_EXAM
          ? [{ label: 'Deneme Sonuçları', path: '/dashboard/mock-exams', icon: '📈' }]
          : []),
        { label: 'Dijital Karne', path: '/dashboard/report-card', icon: '🎓' },
      ];
    default:
      return common;
  }
}
