//src/app/admin/locais/ModalLocaisList.tsx
"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
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

export type LocalQuadra = {
  id: string;
  nome: string;
  ativo: boolean;
};

type Props = {
  onClose?: () => void;
  onChanged?: (items: LocalQuadra[]) => void;
};

const ModalLocal = dynamic(
  () => import("./ModalLocal"),
  { ssr: false }
);

export default function ModalLocaisList({ onClose, onChanged }: Props) {
  const [itens, setItens] = useState<LocalQuadra[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [showLocalModal, setShowLocalModal] = useState(false);
  const [modoLocalModal, setModoLocalModal] = useState<"novo" | "editar">("novo");
  const [localSelecionado, setLocalSelecionado] = useState<LocalQuadra | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const q = query(collection(db, "locais"), orderBy("nome", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const items: LocalQuadra[] = snap.docs.map((d) => ({
        id: d.id,
        nome: d.data().nome ?? "",
        ativo: d.data().ativo ?? true,
      }));
      setItens(items);
      setCarregando(false);
      onChanged?.(items);
    });
    return () => unsub();
  }, [onChanged]);

  function abrirNovo() {
    setModoLocalModal("novo");
    setLocalSelecionado(null);
    setShowLocalModal(true);
  }

  function abrirEdicao(local: LocalQuadra) {
    setModoLocalModal("editar");
    setLocalSelecionado(local);
    setShowLocalModal(true);
  }

  async function alternarAtivo(local: LocalQuadra) {
    if (busyId) return;
    setErro("");
    setBusyId(local.id);
    try {
      const ref = doc(db, "locais", local.id);
      await runTransaction(db, async (tx) => {
        // READ
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Local não encontrado.");
        const atual = (snap.data()?.ativo ?? true) as boolean;
        // WRITE
        tx.update(ref, { ativo: !atual, atualizadoEm: serverTimestamp() });
      });
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Não foi possível alterar o status.");
    } finally {
      setBusyId(null);
    }
  }

  async function deletar(local: LocalQuadra) {
    if (busyId) return;
    if (!confirm(`Excluir o local "${local.nome}"?`)) return;

    setErro("");
    setBusyId(local.id);
    try {
      const ref = doc(db, "locais", local.id);
      const idxRef = doc(db, "index_locais", (local.nome || "").toLowerCase());

      await runTransaction(db, async (tx) => {
        // READ
        const snap = await tx.get(ref);
        if (!snap.exists()) return;

        // remove índice (se existir e pertencer a este id)
        const idxSnap = await tx.get(idxRef);
        if (idxSnap.exists() && idxSnap.data()?.localId === local.id) {
          tx.delete(idxRef);
        }

        // DELETE local
        tx.delete(ref);
      });
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Não foi possível excluir o local.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Cadastro de locais</h2>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Gerencie quadras / espaços de aula.
          </p>
          <button
            onClick={abrirNovo}
            className="text-sm border rounded-xl px-4 py-2 hover:bg-gray-100"
          >
            + Adicionar local
          </button>
        </div>

        {erro && <div className="text-xs text-red-600 font-medium">{erro}</div>}

        {carregando ? (
          <div className="text-sm text-gray-500">Carregando...</div>
        ) : itens.length === 0 ? (
          <div className="text-sm text-gray-500">Nenhum local cadastrado.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {itens.map((l) => (
              <li
                key={l.id}
                className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm">
                  <div className="font-medium text-gray-900">{l.nome}</div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] px-2 py-1 rounded-lg uppercase tracking-wide ${
                      l.ativo
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {l.ativo ? "ATIVO" : "INATIVO"}
                  </span>

                  <button
                    onClick={() => abrirEdicao(l)}
                    disabled={busyId === l.id}
                    className="text-xs px-3 py-2 rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    Editar
                  </button>

                  <button
                    onClick={() => alternarAtivo(l)}
                    disabled={busyId === l.id}
                    className="text-xs px-3 py-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
                  >
                    {l.ativo ? "Inativar" : "Ativar"}
                  </button>

                  <button
                    onClick={() => deletar(l)}
                    disabled={busyId === l.id}
                    className="text-xs px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Reuso do modal de Local */}
        {showLocalModal && (
          <ModalLocal
            modo={modoLocalModal}
            localInicial={localSelecionado}
            onClose={() => setShowLocalModal(false)}
            onSaved={() => {
              setShowLocalModal(false);
              // onSnapshot já atualiza a lista
            }}
          />
        )}
      </div>
    </div>
  );
}
