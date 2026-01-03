"use client";

import React, { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import dynamic from "next/dynamic";
import type { Perfil } from "./ModalPerfil";

type Props = {
  onClose?: () => void;
  onChanged?: (items: Perfil[]) => void;
};

const ModalPerfil = dynamic(() => import("./ModalPerfil"), {
  ssr: false,
});

export default function ModalPerfisList({ onClose, onChanged }: Props) {
  const [itens, setItens] = useState<Perfil[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [busyId, setBusyId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [modo, setModo] = useState<"novo" | "editar">("novo");
  const [perfilSelecionado, setPerfilSelecionado] = useState<Perfil | null>(null);

  useEffect(() => {
    // você pode manter só orderBy("slug") para não precisar de índice composto
    const q = query(collection(db, "perfis"), orderBy("slugLower", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr: Perfil[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            nome: data?.nome ?? "",
            slug: data?.slug ?? "",
            slugLower: data?.slugLower ?? "",
            permissoes: data?.permissoes ?? {},
            ativo: data?.ativo ?? true,
          };
        });

        setItens(arr);
        setCarregando(false);
        onChanged?.(arr);
      },
      (e) => {
        console.error(e);
        setErro("Falha ao carregar perfis.");
        setCarregando(false);
      }
    );
    return () => unsub();
  }, [onChanged]);

  function abrirNovo() {
    setModo("novo");
    setPerfilSelecionado(null);
    setShowModal(true);
  }

  function abrirEditar(p: Perfil) {
    setModo("editar");
    setPerfilSelecionado(p);
    setShowModal(true);
  }

  async function alternarAtivo(p: Perfil) {
    if (busyId) return;
    setErro("");
    setBusyId(p.id);
    try {
      const ref = doc(db, "perfis", p.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Perfil não encontrado.");
        const atual = (snap.data()?.ativo ?? true) as boolean;
        tx.update(ref, { ativo: !atual, atualizadoEm: serverTimestamp() });
      });
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Não foi possível alterar o status.");
    } finally {
      setBusyId(null);
    }
  }

  async function deletar(p: Perfil) {
    if (busyId) return;
    if (!confirm(`Excluir o perfil "${p.nome}"?`)) return;
    setErro("");
    setBusyId(p.id);
    try {
      const ref = doc(db, "perfis", p.id);
      const idxRef = doc(db, "index_perfis", p.slugLower);

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const idxSnap = await tx.get(idxRef);
        if (idxSnap.exists() && idxSnap.data()?.perfilId === p.id) {
          tx.delete(idxRef);
        }
        tx.delete(ref);
      });
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Não foi possível excluir.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Perfis</h2>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">
            ✕
          </button>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">Gerencie os perfis de acesso.</p>
          <button
            onClick={abrirNovo}
            className="text-sm border rounded-xl px-4 py-2 hover:bg-gray-100"
          >
            + Adicionar perfil
          </button>
        </div>

        {erro && <div className="text-xs text-red-600 font-medium">{erro}</div>}

        {carregando ? (
          <div className="text-sm text-gray-500">Carregando...</div>
        ) : itens.length === 0 ? (
          <div className="text-sm text-gray-500">Nenhum perfil cadastrado.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {itens.map((p) => (
              <li
                key={p.id}
                className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm">
                  <div className="font-medium text-gray-900">
                    {p.nome}
                    <span className="ml-2 text-gray-500 text-xs">({p.slug})</span>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Permissões:
                    {Object.entries(p.permissoes || {})
                      .filter(([, v]) => v === true)
                      .map(([k]) => k)
                      .join(", ") || " — "}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] px-2 py-1 rounded-lg uppercase tracking-wide ${
                      p.ativo ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {p.ativo ? "ATIVO" : "INATIVO"}
                  </span>

                  <button
                    onClick={() => abrirEditar(p)}
                    className="text-xs px-3 py-2 rounded-lg bg-black text-white hover:bg-gray-800"
                  >
                    Editar
                  </button>

                  <button
                    onClick={() => alternarAtivo(p)}
                    disabled={busyId === p.id}
                    className="text-xs px-3 py-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
                  >
                    {p.ativo ? "Inativar" : "Ativar"}
                  </button>

                  <button
                    onClick={() => deletar(p)}
                    disabled={busyId === p.id}
                    className="text-xs px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {showModal && (
          <ModalPerfil
            modo={modo}
            perfilInicial={modo === "editar" ? perfilSelecionado : null}
            onClose={() => setShowModal(false)}
            onSaved={() => setShowModal(false)}
          />
        )}
      </div>
    </div>
  );
}
