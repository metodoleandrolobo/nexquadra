'use client';
import React, { useEffect, useState } from 'react';
import { useSession } from '../../../lib/auth';
import { db } from '../../../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

export default function PerfilPage() {
  const { userDoc, loading } = useSession();
  const [form, setForm] = useState({
    nome: '',
    email: '',
    telefone: '',
    documento: '',
    endereco: '',
    dataNascimento: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!userDoc) return;
      const ref = doc(db, 'users', userDoc.id);
      const snap = await getDoc(ref);
      const d = snap.exists() ? snap.data() as any : {};
      setForm({
        nome: d.nome ?? userDoc.nome ?? '',
        email: d.email ?? userDoc.email ?? '',
        telefone: d.telefone ?? '',
        documento: d.documento ?? '',
        endereco: d.endereco ?? '',
        dataNascimento: d.dataNascimento ?? '',
      });
    })();
  }, [userDoc]);

  async function handleSave() {
    if (!userDoc) return;
    if (!form.nome.trim()) return alert('Informe o nome.');
    setSaving(true);
    try {
      const ref = doc(db, 'users', userDoc.id);
      await updateDoc(ref, { ...form, updatedAt: Date.now() });
      alert('Perfil atualizado!');
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6">Carregando…</div>;
  if (!userDoc) return <div className="p-6">Faça login para acessar seu perfil.</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Perfil</h1>
        <p className="text-sm text-muted-foreground">
          Atualize seus dados. (mesma base do “Editar Responsável”)
        </p>
      </header>

      <div className="grid gap-3">
        <LabelInput label="Nome" value={form.nome} onChange={v=>setForm({ ...form, nome: v })} />
        <LabelInput label="Email" value={form.email} onChange={v=>setForm({ ...form, email: v })} />
        <LabelInput label="Telefone" value={form.telefone} onChange={v=>setForm({ ...form, telefone: v })} />
        <LabelInput label="Documento" value={form.documento} onChange={v=>setForm({ ...form, documento: v })} />
        <LabelInput label="Endereço" value={form.endereco} onChange={v=>setForm({ ...form, endereco: v })} />
        <div className="grid gap-1 text-sm">
          <span>Data de nascimento</span>
          <input
            type="date"
            className="rounded-xl border px-3 py-2"
            value={form.dataNascimento}
            onChange={e => setForm({ ...form, dataNascimento: e.target.value })}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl px-3 py-2 text-sm bg-primary text-primary-foreground disabled:opacity-60"
        >
          Salvar
        </button>
      </div>
    </div>
  );
}

function LabelInput({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string)=>void }) {
  return (
    <label className="grid gap-1 text-sm">
      <span>{label}</span>
      <input
        className="rounded-xl border px-3 py-2"
        value={value}
        onChange={e=>onChange(e.target.value)}
      />
    </label>
  );
}
