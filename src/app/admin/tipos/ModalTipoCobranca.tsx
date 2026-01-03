// src/app/admin/tipos/ModalTipoCobranca.tsx
"use client";

import React, { useState } from "react";
import { db } from "../../../lib/firebase";
import {
  getDoc,
  doc,
  runTransaction,
  serverTimestamp,
  collection,
} from "firebase/firestore";

export type TipoCobranca = {
  id: string;
  categoria: "mensal" | "aula";
  nome: string;
  valor: number;
  qtdAlunos: number; // ✅ NOVO
  ativo: boolean;
};

export type ModalTipoCobrancaProps = {
  modo: "novo" | "editar";
  tipoInicial?: TipoCobranca | null;
  onClose: () => void;
  onSaved: (tipoSalvo: TipoCobranca) => void;
};

/** Normalizações */
function normalizeName(v: string) {
  return (v || "").trim();
}
function nameKey(v: string) {
  return (v || "").trim().toLowerCase();
}
function catKey(cat: "mensal" | "aula", v: string) {
  return `${cat}__${nameKey(v)}`;
}

/** Checagem UX via índice manual (não exige índice composto de query) */
async function nomeJaExiste(
  categoria: "mensal" | "aula",
  nomeParaIndice: string,
  ignoreId?: string
) {
  const idxRef = doc(db, "index_tiposCobranca", catKey(categoria, nomeParaIndice));
  const snap = await getDoc(idxRef);
  if (!snap.exists()) return false;

  const tipoId = snap.data()?.tipoId as string | undefined;
  if (!tipoId) return false;

  // Se está editando e o índice aponta para o mesmo doc, está ok
  return ignoreId ? tipoId !== ignoreId : true;
}

export default function ModalTipoCobranca({
  modo,
  tipoInicial,
  onClose,
  onSaved,
}: ModalTipoCobrancaProps) {
  // ⚠️ Categoria agora é “fixa” (vem do botão que abriu o modal)
  const [categoria] = useState<"mensal" | "aula">(tipoInicial?.categoria ?? "aula");

  const [nome, setNome] = useState(tipoInicial?.nome ?? "");
  const [valor, setValor] = useState<number>(Number(tipoInicial?.valor ?? 0));

  // ✅ NOVO
  const [qtdAlunos, setQtdAlunos] = useState<number>(
    Number((tipoInicial as any)?.qtdAlunos ?? 1)
  );

  const [ativo, setAtivo] = useState<boolean>(tipoInicial?.ativo ?? true);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setErro("");

    // Normalizações locais
    const nomeNorm = normalizeName(nome);
    const nomeLower = nameKey(nomeNorm);
    const valorNumber = Number(String(valor).replace(",", "."));

    // ✅ NOVO
    const qtdAlunosNumber = Math.max(1, Number(qtdAlunos));

    // Validações
    if (!nomeNorm) {
      setErro("Informe o nome.");
      return;
    }
    if (!Number.isFinite(valorNumber)) {
      setErro("Informe um valor numérico (ex.: 120 ou 120.50).");
      return;
    }
    if (!Number.isFinite(qtdAlunosNumber) || qtdAlunosNumber < 1) {
      setErro("Informe a quantidade de alunos (mínimo 1).");
      return;
    }

    try {
      setSalvando(true);

      // Checagem UX prévia — evita entrar na transação se já existir
      const existe = await nomeJaExiste(categoria, nomeNorm, tipoInicial?.id);
      if (existe) {
        setSalvando(false);
        setErro("Já existe um tipo com esse nome nesta categoria.");
        return;
      }

      if (modo === "novo") {
        const refTipo = doc(collection(db, "tiposCobranca")); // novo id
        const idxRef = doc(db, "index_tiposCobranca", catKey(categoria, nomeNorm));
        const now = serverTimestamp();

        await runTransaction(db, async (tx) => {
          // READ índice
          const idxSnap = await tx.get(idxRef);
          if (idxSnap.exists()) throw new Error("NOME_TAKEN");

          // WRITE índice (reserva)
          tx.set(idxRef, {
            tipoId: refTipo.id,
            categoria,
            nome: nomeNorm,
            nameLower: nomeLower,
            criadoEm: now,
            atualizadoEm: now,
          });

          // WRITE doc tipo
          tx.set(refTipo, {
            categoria,
            nome: nomeNorm,
            nameLower: nomeLower,
            valor: valorNumber,
            qtdAlunos: qtdAlunosNumber, // ✅ NOVO
            ativo,
            criadoEm: now,
            atualizadoEm: now,
          });
        });

        onSaved({
          id: refTipo.id,
          categoria,
          nome: nomeNorm,
          valor: valorNumber,
          qtdAlunos: qtdAlunosNumber, // ✅ NOVO
          ativo,
        });
        onClose();
      } else if (tipoInicial?.id) {
        const refTipo = doc(db, "tiposCobranca", tipoInicial.id);
        const now = serverTimestamp();
        const mudouNome = nameKey(tipoInicial.nome) !== nomeLower;

        // ⚠️ categoria agora é fixa, então não consideramos mudança de categoria
        if (!mudouNome) {
          // Apenas atualizar campos simples
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(refTipo); // READ
            if (!snap.exists()) throw new Error("TIPO_NOT_FOUND");
            tx.update(refTipo, {
              categoria,
              nome: nomeNorm,
              nameLower: nomeLower,
              valor: valorNumber,
              qtdAlunos: qtdAlunosNumber, // ✅ NOVO
              ativo,
              atualizadoEm: now,
            }); // WRITE
          });
        } else {
          // Troca de índice: remove o antigo e cria o novo
          const oldIdxRef = doc(
            db,
            "index_tiposCobranca",
            catKey(tipoInicial.categoria, tipoInicial.nome)
          );
          const newIdxRef = doc(db, "index_tiposCobranca", catKey(categoria, nomeNorm));

          await runTransaction(db, async (tx) => {
            // READ old idx
            const oldIdx = await tx.get(oldIdxRef);
            if (!oldIdx.exists()) throw new Error("OLD_INDEX_NOT_FOUND");
            if (oldIdx.data()?.tipoId !== tipoInicial.id)
              throw new Error("INDEX_MISMATCH");

            // READ new idx (não pode existir)
            const newIdx = await tx.get(newIdxRef);
            if (newIdx.exists()) throw new Error("NOME_TAKEN");

            // READ tipo
            const tipoSnap = await tx.get(refTipo);
            if (!tipoSnap.exists()) throw new Error("TIPO_NOT_FOUND");

            // WRITE new idx
            tx.set(newIdxRef, {
              tipoId: tipoInicial.id,
              categoria,
              nome: nomeNorm,
              nameLower: nomeLower,
              atualizadoEm: now,
            });

            // DELETE old idx
            tx.delete(oldIdxRef);

            // UPDATE tipo
            tx.update(refTipo, {
              categoria,
              nome: nomeNorm,
              nameLower: nomeLower,
              valor: valorNumber,
              qtdAlunos: qtdAlunosNumber, // ✅ NOVO
              ativo,
              atualizadoEm: now,
            });
          });
        }

        onSaved({
          id: tipoInicial.id,
          categoria,
          nome: nomeNorm,
          valor: valorNumber,
          qtdAlunos: qtdAlunosNumber, // ✅ NOVO
          ativo,
        });
        onClose();
      }
    } catch (e: any) {
      console.error("Erro ao salvar tipo:", e?.code, e?.message, e);
      if (e?.message === "NOME_TAKEN")
        setErro("Já existe um tipo com esse nome nesta categoria.");
      else if (e?.code === "permission-denied")
        setErro("Sem permissão para salvar (ver regras do Firestore).");
      else setErro("Erro ao salvar tipo de cobrança.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {modo === "novo" ? "Novo tipo de cobrança" : "Editar tipo de cobrança"}
          </h2>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSalvar} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Categoria FIXA */}
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700">Categoria</label>
              <div className="border rounded-xl p-3 text-sm bg-gray-50 text-gray-800">
                {categoria === "mensal" ? "Mensalidade" : "Hora/Aula"}
              </div>
            </div>

            {/* Valor */}
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700">Valor *</label>
              <input
                type="number"
                step="0.01"
                className="border rounded-xl p-3 text-sm"
                value={String(valor)}
                onChange={(e) => setValor(parseFloat(e.target.value || "0"))}
                placeholder="0,00"
                required
              />
            </div>

            {/* Quantidade de alunos */}
            <div className="flex flex-col col-span-2">
              <label className="text-sm font-medium text-gray-700">
                Quantidade de alunos *
              </label>
              <input
                type="number"
                min={1}
                step={1}
                className="border rounded-xl p-3 text-sm"
                value={String(qtdAlunos)}
                onChange={(e) =>
                  setQtdAlunos(Math.max(1, parseInt(e.target.value || "1", 10)))
                }
                placeholder="1"
                required
              />
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700">Nome *</label>
            <input
              className="border rounded-xl p-3 text-sm"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={
                categoria === "mensal"
                  ? "Ex.: Mensalidade Infantil"
                  : "Ex.: Aula 1h (particular)"
              }
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
