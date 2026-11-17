import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Search, UserRound } from 'lucide-react';
import { adminApi } from '../services/adminApi';

export default function GuestCourierPhoneLookup({ value, onChange, onSelect, className = '' }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const suppressNextSearch = useRef(false);

  useEffect(() => {
    if (suppressNextSearch.current) {
      suppressNextSearch.current = false;
      return undefined;
    }
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 3) {
      setResults([]);
      setOpen(false);
      setSearched(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await adminApi.searchGuestCourierDirectory(value, 10);
        if (cancelled) return;
        setResults(response.data?.result || []);
        setSearched(true);
        setOpen(true);
      } catch {
        if (!cancelled) {
          setResults([]);
          setSearched(true);
          setOpen(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value]);

  const choose = (courier) => {
    suppressNextSearch.current = true;
    setOpen(false);
    onSelect(courier);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-orange-500" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder="Search saved courier by phone"
          autoComplete="off"
          className={`w-full rounded-xl border border-orange-200 bg-white py-2.5 pl-9 pr-9 text-xs font-bold outline-none focus:border-orange-400 ${className}`}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-orange-500" />}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-[80] mt-1 max-h-60 overflow-y-auto rounded-xl border border-orange-100 bg-white p-1.5 shadow-2xl">
          {results.map((courier) => (
            <button
              key={courier._id || courier.phone}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(courier)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-orange-50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700"><UserRound size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-black text-slate-900">{courier.name}</span>
                <span className="block truncate text-[10px] font-semibold text-slate-500">{courier.phone} · {courier.email}</span>
              </span>
              <span className="shrink-0 text-[9px] font-black uppercase text-orange-600">Used {courier.assignmentCount || 1}×</span>
            </button>
          ))}
          {searched && results.length === 0 && (
            <p className="px-3 py-3 text-center text-[10px] font-bold text-slate-500">No saved courier found. Enter new details below.</p>
          )}
        </div>
      )}
    </div>
  );
}
