// src/app/admin/agendas/ModalAgendasList.tsx
"use client";

import React, { useEffect, useState } from "react";
import {
  listAgendas,
  createAgenda,
  updateAgenda,
  deleteAgenda,
  AgendaConfig,
  AgendaTipo,
} from "./service";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useRouter } from "next/navigation";

// Tipos auxiliares apenas para select
type Professor = { id: string; nome: string; ativo: boolean; funcao?: string };
type LocalQuadra = { id: string; nome: string; ativo: boolean };
type Modalidade = { id: string; nome: string; ativo: boolean };

type Props = {
  onClose?: () => void;
};

const DIAS_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

type DiaConfig = {
  ativo: boolean;
  inicio: string;
  fim: string;
  intervaloMinutos: number;
};

function makeDefaultDiasConfig(): DiaConfig[] {
  const defaultAtivos = [1, 3, 5]; // seg, qua, sex
  return DIAS_LABEL.map((_, idx) => ({
    ativo: defaultAtivos.includes(idx),
    inicio: "08:00",
    fim: "22:00",
    intervaloMinutos: 60,
  }));
}

export default function ModalAgendasList({ onClose }: Props) {
  const router = useRouter();

  const [agendas, setAgendas] = useState<AgendaConfig[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string>("");

  // lists auxiliares
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [locais, setLocais] = useState<LocalQuadra[]>([]);
  const [modalidades, setModalidades] = useState<Modalidade[]>([]);

  // controla se o formulário de agenda está visível
  const [mostrarForm, setMostrarForm] = useState(false);

  // form nova/edição
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<AgendaTipo>("aulas");
  const [publica, setPublica] = useState(false);
  const [ativo, setAtivo] = useState(true);

  const [professorId, setProfessorId] = useState("");
  const [localId, setLocalId] = useState("");
  const [modalidadeId, setModalidadeId] = useState("");

  // nova estrutura por dia da semana
  const [diasConfig, setDiasConfig] = useState<DiaConfig[]>(
    makeDefaultDiasConfig()
  );

  const [salvando, setSalvando] = useState(false);

  async function carregarAuxiliares() {
    try {
      setCarregando(true);
      setErro("");

      // ✅ professores (somente função = "professores")
      // OBS: não uso orderBy aqui pra não exigir índice composto com where
      const qProf = query(
        collection(db, "professores"),
        where("funcao", "==", "professores")
      );
      const snapProf = await getDocs(qProf);

      const profs: Professor[] = snapProf.docs
        .map((d) => {
          const data = d.data() as {
            nome?: string;
            ativo?: boolean;
            funcao?: string;
          };
          return {
            id: d.id,
            nome: data.nome ?? "",
            ativo: data.ativo ?? true,
            funcao: data.funcao ?? "",
          };
        })
        .filter((p) => p.ativo !== false)
        .sort((a, b) =>
          a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
        );

      // ✅ locais
      const qLoc = query(collection(db, "locais"), orderBy("nome", "asc"));
      const snapLoc = await getDocs(qLoc);
      const locs: LocalQuadra[] = snapLoc.docs
        .map((d) => ({
          id: d.id,
          nome: (d.data() as any).nome ?? "",
          ativo: (d.data() as any).ativo ?? true,
        }))
        .filter((l) => l.ativo !== false);

      // ✅ modalidades
      const qMod = query(collection(db, "modalidades"), orderBy("nome", "asc"));
      const snapMod = await getDocs(qMod);
      const mods: Modalidade[] = snapMod.docs
        .map((d) => ({
          id: d.id,
          nome: (d.data() as any).nome ?? "",
          ativo: (d.data() as any).ativo ?? true,
        }))
        .filter((m) => m.ativo !== false);

      setProfessores(profs);
      setLocais(locs);
      setModalidades(mods);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar auxiliares (professores/locais/modalidades).");
    } finally {
      setCarregando(false);
    }
  }

  async function carregarAgendas() {
    setCarregando(true);
    setErro("");
    try {
      const lista = await listAgendas();
      setAgendas(lista);
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Erro ao carregar agendas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    (async () => {
      await Promise.all([carregarAuxiliares(), carregarAgendas()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setEditandoId(null);
    setNome("");
    setTipo("aulas");
    setPublica(false);
    setAtivo(true);
    setProfessorId("");
    setLocalId("");
    setModalidadeId("");
    setDiasConfig(makeDefaultDiasConfig());
    setErro("");
  }

  function toggleDiaAtivo(idx: number) {
    setDiasConfig((prev) =>
      prev.map((dia, i) => (i === idx ? { ...dia, ativo: !dia.ativo } : dia))
    );
  }

  function atualizarCampoDia(
    idx: number,
    campo: keyof DiaConfig,
    valor: string
  ) {
    setDiasConfig((prev) =>
      prev.map((dia, i) =>
        i === idx
          ? {
              ...dia,
              [campo]: campo === "intervaloMinutos" ? Number(valor) || 0 : valor,
            }
          : dia
      )
    );
  }

  function startEditar(a: AgendaConfig) {
    setMostrarForm(true);
    setEditandoId(a.id);
    setNome(a.nome);
    setTipo(a.tipo);
    setPublica(!!a.publica);
    setAtivo(a.ativo !== false);

    setProfessorId(a.professorId || "");
    setLocalId(a.localId || "");
    setModalidadeId((a as any).modalidadeId || "");

    const detalhados = (a as any).diasDetalhados as DiaConfig[] | undefined;

    if (detalhados && detalhados.length === DIAS_LABEL.length) {
      setDiasConfig(
        detalhados.map((d) => ({
          ativo: !!d.ativo,
          inicio: d.inicio || "08:00",
          fim: d.fim || "22:00",
          intervaloMinutos: d.intervaloMinutos || 60,
        }))
      );
    } else {
      const diasSemana = a.diasSemana?.length ? a.diasSemana : [1, 3, 5];
      const horaInicio = a.horaInicio || "08:00";
      const horaFim = a.horaFim || "22:00";
      const intervaloMinutos = a.intervaloMinutos || 60;

      setDiasConfig(
        DIAS_LABEL.map((_, idx) => ({
          ativo: diasSemana.includes(idx),
          inicio: horaInicio,
          fim: horaFim,
          intervaloMinutos,
        }))
      );
    }

    setErro("");
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

    if (!nome.trim()) return setErro("Informe um nome para a agenda.");

    const diasAtivosIndices = diasConfig
      .map((d, idx) => (d.ativo ? idx : -1))
      .filter((idx) => idx >= 0);

    if (diasAtivosIndices.length === 0) {
      return setErro("Selecione ao menos um dia da semana.");
    }

    // validações por dia ativo
    for (const idx of diasAtivosIndices) {
      const d = diasConfig[idx];
      if (!d.inicio || !d.fim) {
        return setErro(`Informe horário de início/fim para ${DIAS_LABEL[idx]}.`);
      }
      if (!d.intervaloMinutos || d.intervaloMinutos <= 0) {
        return setErro(
          `Informe um intervalo válido (em minutos) para ${DIAS_LABEL[idx]}.`
        );
      }
      if (d.fim <= d.inicio) {
        return setErro(`Em ${DIAS_LABEL[idx]}, o fim deve ser maior que o início.`);
      }
    }

    // resumo agregado
    const inicioAgregado = diasAtivosIndices
      .map((idx) => diasConfig[idx].inicio)
      .sort()[0];

    const fimAgregado = diasAtivosIndices
      .map((idx) => diasConfig[idx].fim)
      .sort()
      .slice(-1)[0];

    const intervaloAgregado = diasConfig[diasAtivosIndices[0]].intervaloMinutos;

    const prof = professores.find((p) => p.id === professorId);
    const loc = locais.find((l) => l.id === localId);
    const mod = modalidades.find((m) => m.id === modalidadeId);

    const base: any = {
      nome: nome.trim(),
      tipo,
      publica,
      ativo,

      professorId: professorId || null,
      professorNome: prof?.nome || "",

      localId: localId || null,
      localNome: loc?.nome || "",

      modalidadeId: modalidadeId || null,
      modalidadeNome: mod?.nome || "",

      diasSemana: diasAtivosIndices,
      horaInicio: inicioAgregado,
      horaFim: fimAgregado,
      intervaloMinutos: intervaloAgregado,

      diasDetalhados: diasConfig,
    };

    try {
      setSalvando(true);

      if (!editandoId) {
        await createAgenda(base);
      } else {
        await updateAgenda(editandoId, base);
      }

      if (onClose) onClose();

      // refresh geral
      if (typeof window !== "undefined") {
        window.location.reload();
      } else {
        router.refresh();
      }
      return;
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Erro ao salvar agenda.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir(id: string) {
    if (!confirm("Excluir esta agenda? Essa ação não pode ser desfeita.")) return;
    try {
      await deleteAgenda(id);

      if (onClose) onClose();

      if (typeof window !== "undefined") {
        window.location.reload();
      } else {
        router.refresh();
      }
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Erro ao excluir agenda.");
    }
  }

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Gerenciamento de agendas
            </h2>
            <p className="text-[11px] text-gray-500">
              Crie agendas para aulas e reservas de quadra. No futuro elas vão
              alimentar a agenda do painel e a agenda pública.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-800"
          >
            ✕
          </button>
        </div>

        {/* Form nova/edição – só quando mostrarForm = true */}
        {mostrarForm && (
          <form
            onSubmit={handleSalvar}
            className="space-y-3 border rounded-2xl p-4 bg-gray-50"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-800">
                {editandoId ? "Editar agenda" : "Nova agenda"}
              </h3>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setMostrarForm(false);
                  }}
                  className="text-[11px] text-gray-500 hover:text-gray-800"
                >
                  Cancelar
                </button>
              </div>
            </div>

            {/* Linha 1: nome, tipo, pública, ativo */}
            <div className="grid gap-3 md:grid-cols-4 text-sm">
              <div className="flex flex-col md:col-span-2">
                <label className="text-xs text-gray-700 font-medium">
                  Nome da agenda *
                </label>
                <input
                  className="border rounded-xl p-2 text-sm"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex.: Quadra 1 - Reservas noite"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs text-gray-700 font-medium">
                  Tipo *
                </label>
                <select
                  className="border rounded-xl p-2 text-sm"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as AgendaTipo)}
                >
                  <option value="aulas">Aulas internas</option>
                  <option value="reservas">Reservas de quadra</option>
                  <option value="hibrida">Híbrida (aulas + reservas)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-700 font-medium">
                  Opções
                </label>
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={publica}
                      onChange={(e) => setPublica(e.target.checked)}
                    />
                    <span>Pública</span>
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={ativo}
                      onChange={(e) => setAtivo(e.target.checked)}
                    />
                    <span>Ativa</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Linha 2: professor, local, modalidade */}
            <div className="grid gap-3 md:grid-cols-3 text-sm">
              <div className="flex flex-col">
                <label className="text-xs text-gray-700 font-medium">
                  Professor (opcional)
                </label>
                <select
                  className="border rounded-xl p-2 text-sm"
                  value={professorId}
                  onChange={(e) => setProfessorId(e.target.value)}
                >
                  <option value="">-- Qualquer professor --</option>
                  {professores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-xs text-gray-700 font-medium">
                  Local / Quadra (opcional)
                </label>
                <select
                  className="border rounded-xl p-2 text-sm"
                  value={localId}
                  onChange={(e) => setLocalId(e.target.value)}
                >
                  <option value="">-- Qualquer local --</option>
                  {locais.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-xs text-gray-700 font-medium">
                  Modalidade (opcional)
                </label>
                <select
                  className="border rounded-xl p-2 text-sm"
                  value={modalidadeId}
                  onChange={(e) => setModalidadeId(e.target.value)}
                >
                  <option value="">-- Qualquer modalidade --</option>
                  {modalidades.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Linha 3: dias/horários por dia da semana */}
            <div className="flex flex-col text-sm">
              <label className="text-xs text-gray-700 font-medium">
                Dias da semana, horários e intervalo *
              </label>

              <div className="mt-2 border rounded-2xl overflow-hidden">
                <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 px-3 py-2 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <div>Dia da semana</div>
                  <div>Início</div>
                  <div>Fim</div>
                  <div>Intervalo (min)</div>
                </div>

                <div className="divide-y">
                  {DIAS_LABEL.map((lbl, idx) => {
                    const cfg = diasConfig[idx];

                    return (
                      <div
                        key={lbl}
                        className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 px-3 py-2 items-center"
                      >
                        <button
                          type="button"
                          onClick={() => toggleDiaAtivo(idx)}
                          className={`px-2 py-1 rounded-lg text-[11px] border text-left ${
                            cfg.ativo
                              ? "bg-black text-white border-black"
                              : "bg-white text-gray-700 border-gray-300"
                          }`}
                        >
                          {lbl}
                          <span className="block text-[10px] opacity-80">
                            {cfg.ativo ? "Ativo na agenda" : "Desativado"}
                          </span>
                        </button>

                        <input
                          type="time"
                          className="border rounded-xl px-2 py-1 text-xs"
                          value={cfg.inicio}
                          onChange={(e) =>
                            atualizarCampoDia(idx, "inicio", e.target.value)
                          }
                          disabled={!cfg.ativo}
                        />

                        <input
                          type="time"
                          className="border rounded-xl px-2 py-1 text-xs"
                          value={cfg.fim}
                          onChange={(e) =>
                            atualizarCampoDia(idx, "fim", e.target.value)
                          }
                          disabled={!cfg.ativo}
                        />

                        <input
                          type="number"
                          min={5}
                          step={5}
                          className="border rounded-xl px-2 py-1 text-xs"
                          value={cfg.intervaloMinutos || ""}
                          onChange={(e) =>
                            atualizarCampoDia(
                              idx,
                              "intervaloMinutos",
                              e.target.value
                            )
                          }
                          disabled={!cfg.ativo}
                          placeholder="ex.: 30"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="text-[11px] text-gray-500 mt-1">
                Clique no dia para ativar/desativar. Horários e intervalo só são
                usados quando o dia está ativo.
              </p>
            </div>

            {erro && (
              <div className="text-xs text-red-600 font-medium">{erro}</div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="submit"
                disabled={salvando}
                className="px-4 py-2 rounded-xl bg-black text-white text-xs font-semibold hover:bg-gray-800 disabled:opacity-50"
              >
                {salvando
                  ? "Salvando..."
                  : editandoId
                  ? "Salvar alterações"
                  : "Criar agenda"}
              </button>
            </div>
          </form>
        )}

        {/* Lista de agendas */}
        <div className="border rounded-2xl p-3 max-h-[260px] overflow-auto">
          {carregando ? (
            <div className="text-sm text-gray-500">Carregando agendas...</div>
          ) : agendas.length === 0 ? (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Não há nenhuma agenda criada.</span>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setMostrarForm(true);
                }}
                className="px-3 py-1.5 text-xs rounded-xl bg-black text-white hover:bg-gray-800"
              >
                Criar agenda
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-gray-500">Agendas criadas</span>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setMostrarForm(true);
                  }}
                  className="px-3 py-1.5 text-xs rounded-xl border border-gray-300 hover:bg-gray-50"
                >
                  + Nova agenda
                </button>
              </div>

              <ul className="divide-y divide-gray-100 text-sm">
                {agendas.map((a) => (
                  <li
                    key={a.id}
                    className="py-2 flex flex-col gap-1 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 truncate">
                        {a.nome}
                      </div>
                      <div className="text-[11px] text-gray-600 flex flex-wrap gap-1">
                        <span>
                          Tipo:{" "}
                          {a.tipo === "aulas"
                            ? "Aulas"
                            : a.tipo === "reservas"
                            ? "Reservas de quadra"
                            : "Híbrida"}
                        </span>
                        {a.publica && <span>• Pública</span>}
                        {!a.ativo && <span>• Inativa</span>}
                        {a.professorNome && <span>• Prof: {a.professorNome}</span>}
                        {a.localNome && <span>• Local: {a.localNome}</span>}
                        {a.modalidadeNome && <span>• Mod: {a.modalidadeNome}</span>}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        Dias:{" "}
                        {a.diasSemana && a.diasSemana.length
                          ? a.diasSemana.map((d) => DIAS_LABEL[d]).join(", ")
                          : "—"}{" "}
                        • {a.horaInicio} - {a.horaFim} • {a.intervaloMinutos} min
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-1 md:mt-0">
                      <button
                        type="button"
                        onClick={() => startEditar(a)}
                        className="px-3 py-1.5 text-xs rounded-xl border hover:bg-gray-50"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExcluir(a.id)}
                        className="px-3 py-1.5 text-xs rounded-xl bg-red-600 text-white hover:bg-red-700"
                      >
                        Excluir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
