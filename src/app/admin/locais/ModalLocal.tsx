//src/app/admin/locais/ModalLocal.tsx
"use client";

import React, { useState } from "react";
import { db } from "../../../lib/firebase";
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  getDocs,
  query,
  where,
  limit,
} from "firebase/firestore";

type LocalQuadra = {
  id: string;
  nome: string;
  ativo: boolean;
};

export type ModalLocalProps = {
  modo: "novo" | "editar";
  localInicial?: LocalQuadra | null;
  onClose: () => void;
  onSaved: (localSalvo: LocalQuadra) => void;
};

function normalizeName(v: string) {
  return (v || "").trim();
}
function nameKey(v: string) {
  return normalizeName(v).toLowerCase();
}

/**
 * Checagem UX (rápida) se já existe local com esse nome (case-insensitive).
 * Obs: a garantia forte é a transação com doc índice (index_locais/{nameLower}).
 */
async function nomeLocalExiste(nameLower: string, ignoreId?: string) {
  const qLoc = query(
    collection(db, "locais"),
    where("nameLower", "==", nameLower),
    limit(1)
  );
  const snap = await getDocs(qLoc);
  const hit = snap.docs.find((d) => d.id !== ignoreId);
  return Boolean(hit);
}

export default function ModalLocal({
  modo,
  localInicial,
  onClose,
  onSaved,
}: ModalLocalProps) {
  const [nome, setNome] = useState(localInicial?.nome || "");
  const [ativo, setAtivo] = useState<boolean>(localInicial?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setErro("");

    const nomeNorm = normalizeName(nome);
    const key = nameKey(nome);

    if (!nomeNorm) {
      setErro("Informe o nome do local/quadra.");
      return;
    }

    try {
      setSalvando(true);

      // Checagem rápida (UX)
      const exists = await nomeLocalExiste(key, localInicial?.id);
      if (exists) {
        setSalvando(false);
        return setErro("Já existe um local com esse nome. Escolha outro.");
      }

      if (modo === "novo") {
        // Transação com índice de unicidade
        const refIndex = doc(db, "index_locais", key);
        const refLocal = doc(collection(db, "locais")); // novo id
        const now = serverTimestamp();

        await runTransaction(db, async (tx) => {
          // READ index
          const idxSnap = await tx.get(refIndex);
          if (idxSnap.exists()) {
            throw new Error("NOME_TAKEN");
          }
          // WRITE index => reserva nome
          tx.set(refIndex, {
            localId: refLocal.id,
            nome: nomeNorm,
            nameLower: key,
            criadoEm: now,
            atualizadoEm: now,
          });

          // WRITE local
          tx.set(refLocal, {
            nome: nomeNorm,
            nameLower: key,
            ativo,
            criadoEm: now,
            atualizadoEm: now,
          });
        });

        onSaved({ id: refLocal.id, nome: nomeNorm, ativo });
        onClose();
      } else if (localInicial?.id) {
        const refLocal = doc(db, "locais", localInicial.id);
        const now = serverTimestamp();

        // Se mudou o nome, precisamos mexer no índice
        const trocouNome = nameKey(localInicial.nome) !== key;

        if (!trocouNome) {
          // só atualiza campos
          await runTransaction(db, async (tx) => {
            // READ local (boa prática)
            const snap = await tx.get(refLocal);
            if (!snap.exists()) throw new Error("LOCAL_NOT_FOUND");

            tx.update(refLocal, {
              nome: nomeNorm,
              nameLower: key,
              ativo,
              atualizadoEm: now,
            });
          });
        } else {
          // trocar índice com segurança
          const oldKey = nameKey(localInicial.nome);
          const refOldIdx = doc(db, "index_locais", oldKey);
          const refNewIdx = doc(db, "index_locais", key);

          await runTransaction(db, async (tx) => {
            // READ old index
            const oldIdxSnap = await tx.get(refOldIdx);
            if (!oldIdxSnap.exists()) throw new Error("OLD_INDEX_NOT_FOUND");
            if (oldIdxSnap.data()?.localId !== localInicial.id) {
              throw new Error("INDEX_MISMATCH");
            }

            // READ new index (o novo nome não pode estar ocupado)
            const newIdxSnap = await tx.get(refNewIdx);
            if (newIdxSnap.exists()) {
              throw new Error("NOME_TAKEN");
            }

            // READ local
            const locSnap = await tx.get(refLocal);
            if (!locSnap.exists()) throw new Error("LOCAL_NOT_FOUND");

            // WRITE: cria o novo índice
            tx.set(refNewIdx, {
              localId: localInicial.id,
              nome: nomeNorm,
              nameLower: key,
              atualizadoEm: now,
            });

            // WRITE: remove o índice antigo
            tx.delete(refOldIdx);

            // WRITE: atualiza o doc do local
            tx.update(refLocal, {
              nome: nomeNorm,
              nameLower: key,
              ativo,
              atualizadoEm: now,
            });
          });
        }

        onSaved({ id: localInicial.id, nome: nomeNorm, ativo });
        onClose();
      }
    } catch (e: any) {
      console.error(e);
      if (e?.message === "NOME_TAKEN") {
        setErro("Já existe um local com esse nome. Escolha outro.");
      } else {
        setErro("Erro ao salvar local.");
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {modo === "novo" ? "Novo local" : "Editar local"}
          </h2>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSalvar} className="space-y-4">
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700">Nome *</label>
            <input
              className="border rounded-xl p-3 text-sm"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Quadra 1 (clube X)"
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="ativo"
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
            />
            <label htmlFor="ativo" className="text-sm text-gray-700">
              Ativo
            </label>
          </div>

          {erro && <div className="text-red-600 text-sm font-medium">{erro}</div>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-700 rounded-xl px-4 py-3 text-sm font-semibold hover:bg-gray-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 bg-black text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
