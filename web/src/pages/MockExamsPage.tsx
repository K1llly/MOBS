import { useEffect, useState } from 'react';
import { api, ApiError, getStoredUser } from '../lib/api';
import { useApi } from '../hooks/useApi';
import type { InstitutionType, MockHistory, MockRanking } from '../types';
import { Alert, Badge, Card, Empty, ErrorBox, Field, Loading, Table } from '../components/ui';
import { SearchSelect } from '../components/SearchSelect';

export default function MockExamsPage({ institutionType }: { institutionType?: InstitutionType }) {
  const user = getStoredUser();
  const isStudentSide = user?.role === 'STUDENT';

  return isStudentSide ? <StudentMockExams /> : <ManageMockExams institutionType={institutionType} />;
}

function ManageMockExams({ institutionType }: { institutionType?: InstitutionType }) {
  const role = getStoredUser()?.role;
  const isManager = role === 'MANAGER';
  const isTeacher = role === 'TEACHER';

  const templates = useApi(() => api.mockExams.templates(), []);
  const sessions = useApi(() => api.mockExams.sessions(), []);
  const students = useApi(() => api.students.list(), []);
  const classes = useApi(() => api.classes.list(), []);

  const [templateForm, setTemplateForm] = useState({ name: '', ratio: 4, sections: 'Türkçe:20\nMatematik:20' });
  const [sessionForm, setSessionForm] = useState({
    templateId: '',
    name: '',
    examDate: new Date().toISOString().slice(0, 10),
    schoolClassId: '',
    affectsFinalGrade: false,
    weight: 0.1,
  });
  const [resultForm, setResultForm] = useState({
    studentId: '',
    sectionId: '',
    correctCount: 10,
    wrongCount: 2,
  });
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionForm.templateId && templates.data && templates.data.length > 0) {
      setSessionForm((current) => ({ ...current, templateId: templates.data![0]!.id }));
    }
  }, [templates.data, sessionForm.templateId]);

  useEffect(() => {
    if (!resultForm.studentId && students.data && students.data.length > 0) {
      setResultForm((current) => ({ ...current, studentId: students.data![0]!.id }));
    }
  }, [students.data, resultForm.studentId]);

  const selectedSession = (sessions.data ?? []).find((session) => session.id === selectedSessionId);

  useEffect(() => {
    if (selectedSession && selectedSession.sections.length > 0) {
      setResultForm((current) => {
        const valid = selectedSession.sections.some((section) => section.id === current.sectionId);
        return valid ? current : { ...current, sectionId: selectedSession.sections[0]!.id };
      });
    }
  }, [selectedSession]);

  const ranking = useApi<MockRanking | null>(
    () =>
      selectedSessionId ? api.mockExams.ranking(selectedSessionId) : Promise.resolve(null),
    [selectedSessionId],
  );

  const createTemplate = async () => {
    setError(null);
    setMessage(null);
    try {
      const sections = templateForm.sections
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const match = line.match(/^(.+?)[:=]\s*(\d+)$/);
          if (!match) throw new Error(`Geçersiz satır: "${line}" (örn. Türkçe:30)`);
          return { name: match[1]!.trim(), questionCount: Number(match[2]) };
        });

      await api.mockExams.createTemplate({
        name: templateForm.name.trim(),
        wrongPenaltyRatio: templateForm.ratio,
        sections,
      });
      setTemplateForm({ ...templateForm, name: '' });
      setMessage('Deneme şablonu oluşturuldu.');
      templates.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Şablon oluşturulamadı');
    }
  };

  const createSession = async () => {
    setError(null);
    setMessage(null);
    try {
      await api.mockExams.createSession({
        templateId: sessionForm.templateId,
        name: sessionForm.name.trim(),
        examDate: new Date(`${sessionForm.examDate}T09:00:00.000Z`).toISOString(),
        ...(sessionForm.schoolClassId ? { schoolClassId: sessionForm.schoolClassId } : {}),
        ...(institutionType === 'COURSE'
          ? {
              affectsFinalGrade: sessionForm.affectsFinalGrade,
              ...(sessionForm.affectsFinalGrade ? { weightIfAffected: sessionForm.weight } : {}),
            }
          : {}),
      });
      setSessionForm({ ...sessionForm, name: '' });
      setMessage('Deneme oturumu oluşturuldu.');
      sessions.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Oturum oluşturulamadı');
    }
  };

  const enterResult = async () => {
    if (!selectedSession) return;
    setError(null);
    setMessage(null);
    try {
      await api.mockExams.enterResult(selectedSession.id, {
        studentId: resultForm.studentId,
        sectionId: resultForm.sectionId,
        correctCount: resultForm.correctCount,
        wrongCount: resultForm.wrongCount,
      });
      setMessage('Sonuç kaydedildi; boş ve net otomatik hesaplandı.');
      ranking.reload();
      sessions.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Sonuç kaydedilemedi');
    }
  };

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
      {isManager && (
        <Alert kind="info">
          Şablon ve oturum tanımlarını yönetici oluşturur; sonuç girişini dersin öğretmeni yapar.
        </Alert>
      )}
      {isTeacher && (
        <Alert kind="info">
          Sonuç girişi için bir oturum seçin. Yalnızca kendi şubenizin oturumlarına sonuç girebilirsiniz.
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Şablonlar" subtitle="Bir kez tanımla, her denemede tekrar kullan">
          {templates.loading && <Loading />}
          {templates.error && <ErrorBox message={templates.error} />}
          {templates.data && templates.data.length === 0 && <Empty>Şablon yok.</Empty>}
          {templates.data && templates.data.length > 0 && (
            <Table head={['Şablon', 'Soru', 'Katsayı', 'Oturum']}>
              {templates.data.map((template) => (
                <tr key={template.id}>
                  <td className="px-2 py-2 font-medium">{template.name}</td>
                  <td className="px-2 py-2">{template.totalQuestions}</td>
                  <td className="px-2 py-2">{template.wrongPenaltyRatio}</td>
                  <td className="px-2 py-2">{template.sessionCount}</td>
                </tr>
              ))}
            </Table>
          )}

          {isManager && (
          <>
          <div className="mt-4 grid gap-2 border-t border-slate-200 pt-4 sm:grid-cols-2">
            <Field label="Şablon adı">
              <input
                className="input"
                value={templateForm.name}
                onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })}
                placeholder="Ortaokul 40 Soruluk Deneme"
              />
            </Field>
            <Field label="Yanlış götürme katsayısı">
              <select
                className="input"
                value={templateForm.ratio}
                onChange={(event) => setTemplateForm({ ...templateForm, ratio: Number(event.target.value) })}
              >
                <option value={0}>Yanlış götürmez (0)</option>
                <option value={3}>3 yanlış 1 doğru</option>
                <option value={4}>4 yanlış 1 doğru</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Ders bölümleri" hint="Her satır: Ders:SoruSayısı">
                <textarea
                  className="input h-20"
                  value={templateForm.sections}
                  onChange={(event) => setTemplateForm({ ...templateForm, sections: event.target.value })}
                />
              </Field>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary mt-3"
            onClick={createTemplate}
            disabled={templateForm.name.trim().length < 3}
          >
            Şablon Ekle
          </button>
          </>
          )}
        </Card>

        <Card title="Oturumlar" subtitle="Şablondan tek tıkla yeni deneme">
          {sessions.loading && <Loading />}
          {sessions.error && <ErrorBox message={sessions.error} />}
          {sessions.data && sessions.data.length === 0 && <Empty>Oturum yok.</Empty>}
          {sessions.data && sessions.data.length > 0 && (
            <Table head={['Oturum', 'Tarih', 'Şube', 'Sonuç', 'Etki']}>
              {sessions.data.map((session) => (
                <tr
                  key={session.id}
                  className={`cursor-pointer hover:bg-slate-50 ${selectedSessionId === session.id ? 'bg-brand-50' : ''}`}
                  onClick={() => setSelectedSessionId(session.id)}
                >
                  <td className="px-2 py-2 font-medium">{session.name}</td>
                  <td className="px-2 py-2 text-xs text-slate-500">
                    {new Date(session.examDate).toLocaleDateString('tr-TR')}
                  </td>
                  <td className="px-2 py-2 text-slate-600">{session.className ?? 'Tümü'}</td>
                  <td className="px-2 py-2">{session.resultCount}</td>
                  <td className="px-2 py-2">
                    <Badge tone={session.affectsFinalGrade ? 'amber' : 'slate'}>
                      {session.affectsFinalGrade ? 'Etkili' : 'Etkisiz'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </Table>
          )}

          {isManager && (
          <>
          <div className="mt-4 grid gap-2 border-t border-slate-200 pt-4 sm:grid-cols-2">
            <Field label="Şablon">
              <select
                className="input"
                value={sessionForm.templateId}
                onChange={(event) => setSessionForm({ ...sessionForm, templateId: event.target.value })}
              >
                <option value="">Seçin</option>
                {(templates.data ?? []).map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Oturum adı">
              <input
                className="input"
                value={sessionForm.name}
                onChange={(event) => setSessionForm({ ...sessionForm, name: event.target.value })}
                placeholder="Kasım 2. Deneme"
              />
            </Field>
            <Field label="Tarih">
              <input
                type="date"
                className="input"
                value={sessionForm.examDate}
                onChange={(event) => setSessionForm({ ...sessionForm, examDate: event.target.value })}
              />
            </Field>
            <Field label="Şube">
              <select
                className="input"
                value={sessionForm.schoolClassId}
                onChange={(event) => setSessionForm({ ...sessionForm, schoolClassId: event.target.value })}
              >
                <option value="">Tümü</option>
                {(classes.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            {institutionType === 'COURSE' && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sessionForm.affectsFinalGrade}
                    onChange={(event) =>
                      setSessionForm({ ...sessionForm, affectsFinalGrade: event.target.checked })
                    }
                  />
                  Kur geçme puanına etki etsin
                </label>
                {sessionForm.affectsFinalGrade && (
                  <Field label="Etki ağırlığı (0–1)">
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      className="input"
                      value={sessionForm.weight}
                      onChange={(event) => setSessionForm({ ...sessionForm, weight: Number(event.target.value) })}
                    />
                  </Field>
                )}
              </>
            )}
          </div>
          {institutionType && institutionType !== 'COURSE' && (
            <p className="mt-2 text-xs text-slate-500">
              Bu kurum tipinde deneme sınavı resmi karneye etki etmez (kilitli).
            </p>
          )}
          <button
            type="button"
            className="btn-primary mt-3"
            onClick={createSession}
            disabled={!sessionForm.templateId || sessionForm.name.trim().length < 3}
          >
            Oturum Aç
          </button>
          </>
          )}
        </Card>
      </div>

      {selectedSession && (
        <div className={`grid gap-4 ${isTeacher ? 'xl:grid-cols-2' : ''}`}>
          {isTeacher && (
          <Card
            title="Sonuç gir (öğretmen)"
            subtitle={`${selectedSession.templateName} · ${selectedSession.sections.length} bölüm`}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Öğrenci">
                <SearchSelect
                  options={(students.data ?? []).map((student) => ({
                    id: student.id,
                    label: student.fullName,
                    hint: `${student.studentNumber}${student.className ? ` · ${student.className}` : ''}`,
                  }))}
                  value={resultForm.studentId}
                  onChange={(id) => setResultForm({ ...resultForm, studentId: id })}
                  placeholder="Öğrenci ara…"
                />
              </Field>
              <Field label="Bölüm">
                <select
                  className="input"
                  value={resultForm.sectionId}
                  onChange={(event) => setResultForm({ ...resultForm, sectionId: event.target.value })}
                >
                  {selectedSession.sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name} ({section.questionCount} soru)
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Doğru">
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={resultForm.correctCount}
                  onChange={(event) => setResultForm({ ...resultForm, correctCount: Number(event.target.value) })}
                />
              </Field>
              <Field label="Yanlış">
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={resultForm.wrongCount}
                  onChange={(event) => setResultForm({ ...resultForm, wrongCount: Number(event.target.value) })}
                />
              </Field>
            </div>
            <button type="button" className="btn-primary mt-3" onClick={enterResult}>
              Sonucu Kaydet
            </button>
            <p className="mt-2 text-xs text-slate-500">
              Boş = soru sayısı − (doğru + yanlış); net = doğru − yanlış / {selectedSession.wrongPenaltyRatio || '—'}
            </p>
          </Card>
          )}

          <Card title="Sıralama" subtitle={ranking.data?.session.name}>
            {ranking.loading && <Loading />}
            {ranking.error && <ErrorBox message={ranking.error} />}
            {ranking.data && ranking.data.rows.length === 0 && <Empty>Henüz sonuç yok.</Empty>}
            {ranking.data && ranking.data.rows.length > 0 && (
              <Table head={['#', 'Öğrenci', 'Net', 'D/Y/B']}>
                {ranking.data.rows.map((row) => (
                  <tr key={row.studentId} className={row.rank === 1 ? 'bg-emerald-50' : ''}>
                    <td className="px-2 py-2 font-semibold">{row.rank}</td>
                    <td className="px-2 py-2">
                      {row.fullName}
                      <span className="ml-1 text-xs text-slate-400">{row.studentNumber}</span>
                    </td>
                    <td className="px-2 py-2 font-semibold">{row.net}</td>
                    <td className="px-2 py-2 text-xs text-slate-500">
                      {row.correct}/{row.wrong}/{row.blank}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function StudentMockExams() {
  const students = useApi(() => api.students.list(), []);
  const [studentId, setStudentId] = useState('');

  useEffect(() => {
    if (!studentId && students.data && students.data.length > 0) setStudentId(students.data[0]!.id);
  }, [students.data, studentId]);

  const history = useApi<MockHistory | null>(
    () => (studentId ? api.mockExams.student(studentId) : Promise.resolve(null)),
    [studentId],
  );

  return (
    <div className="space-y-4">
      <Card
        title="Deneme sınavlarım"
        subtitle="Resmi karneye etki etmez; net ve sıralama gelişimi"
        actions={
          <div className="w-56">
            <SearchSelect
              options={(students.data ?? []).map((student) => ({
                id: student.id,
                label: student.fullName,
                hint: student.studentNumber,
              }))}
              value={studentId}
              onChange={setStudentId}
              placeholder="Öğrenci ara…"
            />
          </div>
        }
      >
        {history.loading && <Loading />}
        {history.error && <ErrorBox message={history.error} />}
        {history.data && history.data.history.length === 0 && <Empty>Deneme sonucu yok.</Empty>}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {(history.data?.history ?? []).map((entry) => (
          <Card key={entry.sessionId} title={entry.sessionName} subtitle={entry.templateName}>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs uppercase text-slate-400">Net</p>
                <p className="text-lg font-bold">{entry.net}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs uppercase text-slate-400">Sıra</p>
                <p className="text-lg font-bold">
                  {entry.rank}/{entry.participants}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs uppercase text-slate-400">Tarih</p>
                <p className="text-sm font-semibold">{new Date(entry.examDate).toLocaleDateString('tr-TR')}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {entry.sections.map((section) => (
                <Badge key={section.sectionId} tone="blue">
                  {section.name}: {section.net} net ({section.correct}/{section.wrong}/{section.blank})
                </Badge>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
