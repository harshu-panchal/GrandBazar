import React from 'react';

export default function LocalizedNamesTable({ names }) {
    if (!Array.isArray(names) || names.length === 0) return null;
    return (
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Also Known As</h3>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
                {names.map((n, idx) => (
                    <div key={`${n.languageCode}-${idx}`} className="grid grid-cols-2">
                        <span className="px-3 py-2 text-xs font-bold text-slate-500 bg-slate-50 capitalize">{n.languageCode}</span>
                        <span className="px-3 py-2 text-xs font-black text-slate-800">{n.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
