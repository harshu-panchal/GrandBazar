import React, { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@shared/components/ui/Toast';
import GuestCourierPhoneLookup from '../../admin/components/GuestCourierPhoneLookup';
import { sellerApi } from '../services/sellerApi';

const EMPTY = { name: '', phone: '', email: '', reason: '' };

export default function GuestCourierAssignmentPanel({ orderId, taskType, assignment, eligible, onChanged }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const searchCouriers = useCallback((phone, limit) => sellerApi.searchGuestCourierDirectory(phone, taskType, limit), [taskType]);
  const active = assignment && ['email_pending', 'active', 'email_failed'].includes(assignment.status);

  if (!eligible && !active) return null;

  const refresh = async () => {
    setOpen(false);
    setReplacing(false);
    setForm(EMPTY);
    try {
      await onChanged?.();
    } catch {
      // The assignment succeeded; a later screen refresh will fetch the new state.
    }
  };

  const submit = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.email.trim() || form.reason.trim().length < 3) {
      showToast('Name, phone, email and reason are required', 'error');
      return;
    }
    setSaving(true);
    try {
      if (replacing) await sellerApi.replaceGuestCourier(assignment._id, taskType, form);
      else await sellerApi.assignGuestCourier(orderId, taskType, form);
      showToast(replacing ? 'Temporary courier replaced' : 'Temporary courier assigned', 'success');
      await refresh();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Unable to assign temporary courier', 'error');
    } finally {
      setSaving(false);
    }
  };

  const assignmentAction = async (action) => {
    const reason = window.prompt(`${action === 'resend' ? 'Resend' : 'Revoke'} reason`);
    if (!reason?.trim()) return;
    if (reason.trim().length < 3) {
      showToast('Reason must be at least 3 characters', 'error');
      return;
    }
    setSaving(true);
    try {
      if (action === 'resend') await sellerApi.resendGuestCourierLink(assignment._id, taskType, reason);
      else await sellerApi.revokeGuestCourier(assignment._id, taskType, reason);
      showToast(action === 'resend' ? 'A new link was emailed' : 'Temporary courier revoked', 'success');
      await refresh();
    } catch (error) {
      showToast(error?.response?.data?.message || `Unable to ${action} courier`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 p-3.5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">Temporary courier</p>
          {active && <><p className="mt-1 text-sm font-black text-slate-900">{assignment.courier?.name}</p><p className="text-xs font-semibold text-slate-600">{assignment.courier?.phone} - {assignment.courier?.email}</p></>}
        </div>
        {active && <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase text-orange-700">{assignment.emailStatus || assignment.status}</span>}
      </div>
      {active && (
        <div className="flex flex-wrap gap-2">
          <button disabled={saving} onClick={() => assignmentAction('resend')} className="rounded-lg bg-orange-600 px-3 py-2 text-[10px] font-black uppercase text-white disabled:opacity-50">Resend link</button>
          <button disabled={saving} onClick={() => { setReplacing(true); setOpen(true); setForm({ name: assignment.courier?.name || '', phone: assignment.courier?.phone || '', email: assignment.courier?.email || '', reason: '' }); }} className="rounded-lg border border-orange-300 bg-white px-3 py-2 text-[10px] font-black uppercase text-orange-700 disabled:opacity-50">Replace</button>
          <button disabled={saving} onClick={() => assignmentAction('revoke')} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-[10px] font-black uppercase text-rose-600 disabled:opacity-50">Revoke</button>
        </div>
      )}
      {!active && eligible && <button onClick={() => setOpen((value) => !value)} className="w-full rounded-xl bg-orange-600 py-2.5 text-xs font-black uppercase text-white">{open ? 'Close form' : 'Assign temporary courier'}</button>}
      {open && (
        <div className="space-y-2 rounded-xl bg-white p-3 border border-orange-100">
          <input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} placeholder="Courier full name" className="w-full rounded-xl border border-orange-200 px-3 py-2.5 text-xs font-bold outline-none" />
          <GuestCourierPhoneLookup value={form.phone} onChange={(phone) => setForm((v) => ({ ...v, phone }))} onSelect={(courier) => setForm((v) => ({ ...v, name: courier.name || '', phone: courier.phone || '', email: courier.email || '' }))} searchCouriers={searchCouriers} />
          <input type="email" value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} placeholder="Email address" className="w-full rounded-xl border border-orange-200 px-3 py-2.5 text-xs font-bold outline-none" />
          <textarea value={form.reason} onChange={(e) => setForm((v) => ({ ...v, reason: e.target.value }))} placeholder="Assignment reason" rows={2} className="w-full resize-none rounded-xl border border-orange-200 px-3 py-2.5 text-xs font-bold outline-none" />
          <button disabled={saving} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-[10px] font-black uppercase text-white disabled:opacity-50">{saving && <Loader2 size={14} className="animate-spin" />}{replacing ? 'Replace and email link' : 'Assign and email link'}</button>
        </div>
      )}
    </div>
  );
}
