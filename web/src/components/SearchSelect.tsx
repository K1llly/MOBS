import { useState } from 'react';

export interface SearchOption {
  id: string;
  label: string;
  hint?: string;
}

const normalize = (value: string) => value.toLocaleLowerCase('tr-TR');

/**
 * İsim / kullanıcı adı / numara / branş üzerinden filtrelenebilen seçim kutusu.
 * Öğretmen ve öğrenci seçimlerinde arama için kullanılır.
 */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Ara…',
}: {
  options: SearchOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.id === value);

  const filtered = query.trim()
    ? options.filter((option) =>
        normalize(`${option.label} ${option.hint ?? ''}`).includes(normalize(query)),
      )
    : options;

  return (
    <div className="relative">
      <input
        className="input"
        value={open ? query : (selected?.label ?? '')}
        placeholder={selected ? selected.label : placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        role="combobox"
        aria-expanded={open}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-400">Sonuç bulunamadı</li>
          )}
          {filtered.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  option.id === value ? 'bg-brand-50 text-brand-700' : ''
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                  setQuery('');
                }}
              >
                <span className="truncate">{option.label}</span>
                {option.hint && <span className="shrink-0 text-xs text-slate-400">{option.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
