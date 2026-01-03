// app/admin/tipos/ModalTiposCobrancaList.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import type { TipoCobranca } from "./ModalTipoCobranca";

type Props = {
  onClose?: () => void;
  onChanged?: (items: TipoCobranca[]) => void; // notifica o pai
};

// Tipo local para exibição (acrescenta nameLower defensivo)
type TipoCobrancaRow = TipoCobranca & { nameLower: string };

const ModalTipoCobranca = dynamic(() => import("./ModalTipoCobranca"), {
  ssr: false,
});

export default function ModalTiposCobrancaList({ onClose, onChanged }: Props) {
  const [itens, setItens] = useState<TipoCobrancaRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [busyId, setBusyId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [modo, setModo] = useState<"novo" | "editar">("novo");
  const [tipoSelecionado, setTipoSelecionado] =
    useState<TipoCobrancaRow | null>(null);

  useEffect(() => {
    // Apenas 1 orderBy para evitar índice composto
    const q = query(collection(db, "tiposCobranca"), orderBy("categoria", "asc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr: TipoCobrancaRow[] = snap.docs.map((d) => {
          const data = d.data() as any;
          const nome: string = (data?.nome ?? "").toString();
          return {
            id: d.id,
            categoria: (data?.categoria ?? "aula") as "mensal" | "aula",
            nome,
            valor: Number(data?.valor) || 0,
            qtdAlunos: Number(data?.qtdAlunos) || 1, // ✅ NOVO
            ativo: data?.ativo ?? true,
            // auxiliar para ordenação/busca local; se não existir no doc, derivamos do nome
            nameLower: ((data?.nameLower ?? nome) as string).toString().toLowerCase(),
          };
        });

        // Ordenação local: categoria -> nome (case-insensitive)
        arr.sort((a, b) => {
          const cat = (a.categoria ?? "").localeCompare(b.categoria ?? "", "pt-BR", {
            sensitivity: "base",
          });
          if (cat !== 0) return cat;
          const aKey = (a.nameLower || a.nome || "").toString().toLowerCase();
          const bKey = (b.nameLower || b.nome || "").toString().toLowerCase();
          return aKey.localeCompare(bKey, "pt-BR");
        });

        setItens(arr);
        setCarregando(false);

        // Notifica o pai sem o campo auxiliar
        onChanged?.(arr.map(({ nameLower, ...base }) => base));
      },
      (e) => {
        console.error(e);
        setErro("Falha ao carregar tipos de cobrança.");
        setCarregando(false);
      }
    );

    return () => unsub();
  }, [onChanged]);

  const itensMensal = useMemo(
    () => itens.filter((t) => t.categoria === "mensal"),
    [itens]
  );
  const itensAula = useMemo(
    () => itens.filter((t) => t.categoria === "aula"),
    [itens]
  );

  function abrirNovo(cat: "mensal" | "aula") {
    setModo("novo");
    setTipoSelecionado({
      id: "",
      categoria: cat,
      nome: "",
      valor: 0,
      qtdAlunos: 1, // ✅ NOVO
      ativo: true,
      nameLower: "",
    });
    setShowModal(true);
  }

  function abrirEditar(t: TipoCobrancaRow) {
    setModo("editar");
    setTipoSelecionado(t);
    setShowModal(true);
  }

  async function alternarAtivo(t: TipoCobrancaRow) {
    if (busyId) return;
    setErro("");
    setBusyId(t.id);
    try {
      const ref = doc(db, "tiposCobranca", t.id);
      await runTransaction(db, async (tx) => {
        // READ primeiro
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Tipo não encontrado.");
        const atual = (snap.data()?.ativo ?? true) as boolean;
        // WRITE depois
        tx.update(ref, { ativo: !atual, atualizadoEm: serverTimestamp() });
      });
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Não foi possível alterar o status.");
    } finally {
      setBusyId(null);
    }
  }

  async function deletar(t: TipoCobrancaRow) {
    if (busyId) return;
    if (!confirm(`Excluir "${t.nome}" (${t.categoria})?`)) return;
    setErro("");
    setBusyId(t.id);
    try {
      const ref = doc(db, "tiposCobranca", t.id);
      // Se você usa índice auxiliar, pode remover aqui também:
      // const idxRef = doc(db, "index_tiposCobranca", `${t.categoria}__${t.nameLower}`);
      await runTransaction(db, async (tx) => {
        // READ
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        // WRITE
        tx.delete(ref);
      });
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Não foi possível excluir.");
    } finally {
      setBusyId(null);
    }
  }

  function Grupo({
    titulo,
    itens,
    categoria,
  }: {
    titulo: string;
    itens: TipoCobrancaRow[];
    categoria: "mensal" | "aula";
  }) {
    return (
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">{titulo}</h3>
          <button
            onClick={() => abrirNovo(categoria)}
            className="text-xs border rounded-xl px-3 py-1 hover:bg-gray-100"
          >
            + Adicionar {categoria === "mensal" ? "mensalidade" : "Hora/Aula"}
          </button>
        </div>

        {itens.length === 0 ? (
          <div className="text-xs text-gray-500">Nenhum item.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {itens.map((t) => (
              <li
                key={t.id}
                className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm">
                  <div className="font-medium text-gray-900">
                    {t.nome}
                    <span className="ml-2 text-gray-500 text-xs">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(t.valor)}
                    </span>
                  </div>

                  <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                    <span>
                      Categoria: {t.categoria === "mensal" ? "Mensalidade" : "Hora/Aula"}
                    </span>
                    <span>•</span>
                    <span>Alunos: {t.qtdAlunos}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] px-2 py-1 rounded-lg uppercase tracking-wide ${
                      t.ativo
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {t.ativo ? "ATIVO" : "INATIVO"}
                  </span>

                  <button
                    onClick={() => abrirEditar(t)}
                    className="text-xs px-3 py-2 rounded-lg bg-black text-white hover:bg-gray-800"
                  >
                    Editar
                  </button>

                  <button
                    onClick={() => alternarAtivo(t)}
                    disabled={busyId === t.id}
                    className="text-xs px-3 py-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
                  >
                    {t.ativo ? "Inativar" : "Ativar"}
                  </button>

                  <button
                    onClick={() => deletar(t)}
                    disabled={busyId === t.id}
                    className="text-xs px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Tipos de cobrança</h2>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            ✕
          </button>
        </div>

        {erro && <div className="text-xs text-red-600 font-medium">{erro}</div>}

        {carregando ? (
          <div className="text-sm text-gray-500">Carregando...</div>
        ) : (
          <div className="space-y-6">
            <Grupo titulo="Mensal" itens={itensMensal} categoria="mensal" />
            <Grupo titulo="Hora/Aula" itens={itensAula} categoria="aula" />
          </div>
        )}

        {showModal && (
          <ModalTipoCobranca
            modo={modo}
            tipoInicial={
              tipoSelecionado
                ? {
                    id: tipoSelecionado.id,
                    categoria: tipoSelecionado.categoria, // 🔒 fixa no modal
                    nome: tipoSelecionado.nome,
                    valor: tipoSelecionado.valor,
                    qtdAlunos: tipoSelecionado.qtdAlunos, // ✅ NOVO
                    ativo: tipoSelecionado.ativo,
                  }
                : null
            }
            onClose={() => setShowModal(false)}
            onSaved={() => setShowModal(false)}
          />
        )}
      </div>
    </div>
  );
}
