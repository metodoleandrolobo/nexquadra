// src/app/admin/aula-form/ModalAulaForm.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc as fsDoc,
  DocumentData,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { Aula } from "../types";
import dynamic from "next/dynamic";
import type { AgendaConfig } from "../agendas/service";

// import dinâmico do modal de Modalidades (sem SSR) — mantido caso você use
const ModalidadesModal = dynamic(
  () => import("../modalidades/ModalModalidades"),
  { ssr: false }
);

// Tipagens auxiliares
type Professor = { id: string; nome: string; ativo: boolean };
type LocalQuadra = { id: string; nome: string; ativo: boolean };

// 🔥 Tipos de cobrança (agora mais completo)
type CategoriaCobranca = "mensal" | "hora_aula";
type ModoCalculoCobranca = "fixo" | "automatico";

type TipoCobranca = {
  id: string;
  nome: string;
  valor: number;
  ativo: boolean;

  categoria?: string; // "mensal" | "mensalidade" | "aula" | "hora_aula"...
  qtdAlunos?: number; // usado no automático
  nomeBase?: string;  // usado no automático (ex: "Hora/aula")
};

// Novo formato de plano (coleção: planosAula)
type PlanoAula = {
  id: string;
  modalidadeId: string;
  tema: string; // título do plano
  atividades: string; // conteúdo/atividades do plano
  ativo: boolean;
};

export type Aluno = {
  id: string;
  nome: string;
  status: "ativo" | "inativo";
  responsavelId: string;
  nascimento?: string;
  telefone?: string;
  cpf?: string;
  observacoes?: string;
};

export type Modalidade = { id: string; nome: string; ativo: boolean };

// Props do ModalAulaForm
type ModalAulaFormProps = {
  modo: "novo" | "editar";
  aulaInicial: Aula | null; // aula pra editar OU null
  diaDefault?: Date | null; // sugestão de dia quando criando
  horaInicioDefault?: string; // sugestão de hora quando criando
  alunosAtivos: Aluno[]; // lista de alunos ativos vinda do pai
  professores: Professor[]; // lista de professores vinda do pai
  modalidades: Modalidade[]; // lista de modalidades vinda do pai
  agendaSelecionada?: AgendaConfig | null; // agenda atual, para travar campos/intervalos
  onClose: () => void;
  onSaved: (aulaSalva: Aula) => void; // pai atualiza aulasHoje
};

// helpers de hora
function addUmaHora(horaStr: string): string {
  const [hStr, mStr] = horaStr.split(":");
  const h = parseInt(hStr ?? "0", 10);
  const m = parseInt(mStr ?? "0", 10);
  const novoH = (h + 1) % 24;
  const hh = String(novoH).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${hh}:${mm}`;
}

function clampHoraDentroFaixa(
  valor: string,
  faixaInicio?: string | null,
  faixaFim?: string | null
): string {
  if (!faixaInicio || !faixaFim || !valor) return valor;
  if (valor < faixaInicio) return faixaInicio;
  if (valor > faixaFim) return faixaFim;
  return valor;
}

function formatMoeda(v: number): string {
  const inteiro = Math.floor(v);
  const centavos = Math.round((v - inteiro) * 100);
  const inteiroStr = inteiro.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const centavosStr = String(centavos).padStart(2, "0");
  return `R$ ${inteiroStr},${centavosStr}`;
}

// ---------- NOVO: função única pra pegar limites de horário ----------
function getLimitesHorario(
  agenda: AgendaConfig | null | undefined,
  dataAulaISO: string | null
): { inicio: string; fim: string; intervaloMinutos: number | null } | null {
  if (!agenda) return null;

  const agregado = {
    inicio: agenda.horaInicio || "00:00",
    fim: agenda.horaFim || "23:59",
    intervaloMinutos: agenda.intervaloMinutos || null,
  };

  if (!dataAulaISO) return agregado;

  const [y, m, d] = dataAulaISO.split("-").map((n) => Number(n));
  if (!y || !m || !d) return agregado;

  const dia = new Date(y, m - 1, d);
  const dow = dia.getDay(); // 0..6

  const anyAgenda = agenda as any;

  const detalhados = anyAgenda.diasDetalhados as
    | { ativo?: boolean; inicio?: string; fim?: string; intervaloMinutos?: number }[]
    | undefined;

  if (detalhados && detalhados.length === 7) {
    const cfg = detalhados[dow];

    if (cfg && cfg.inicio && cfg.fim) {
      return {
        inicio: cfg.inicio,
        fim: cfg.fim,
        intervaloMinutos: cfg.intervaloMinutos || agregado.intervaloMinutos,
      };
    }
    return agregado;
  }

  if (
    agenda.diasSemana &&
    agenda.diasSemana.length &&
    agenda.diasSemana.includes(dow)
  ) {
    return agregado;
  }

  return agregado;
}

// ----------- HELPERS COBRANÇA -----------
function normalizarCategoria(raw?: string): CategoriaCobranca | null {
  const c = (raw || "").toLowerCase().trim();
  if (!c) return null;
  if (c === "mensal" || c === "mensalidade") return "mensal";
  if (c === "aula" || c === "hora_aula" || c === "hora/aula" || c === "hora") return "hora_aula";
  return null;
}

function inferNomeBase(nome: string): string {
  // tenta tirar sufixos tipo "(1 aluno)" etc
  const n = (nome || "").trim();
  const cut = n.split("(")[0]?.trim();
  return cut || n;
}

function pickAutomatico(
  lista: TipoCobranca[],
  nomeBaseEscolhido: string,
  qtdAlunos: number
): { tipo?: TipoCobranca; valor: number } {
  const candidatos = lista
    .filter((t) => (t.nomeBase || inferNomeBase(t.nome)) === nomeBaseEscolhido)
    .filter((t) => t.ativo !== false);

  if (candidatos.length === 0) return { tipo: undefined, valor: 0 };

  // usa qtdAlunos se existir; senão, tenta inferir pelo nome "(x"
  const withQtd = candidatos
    .map((t) => {
      const q =
        typeof t.qtdAlunos === "number"
          ? t.qtdAlunos
          : (() => {
              const m = t.nome.match(/(\d+)/);
              return m ? Number(m[1]) : 1;
            })();
      return { ...t, qtdAlunos: q };
    })
    .sort((a, b) => (a.qtdAlunos! - b.qtdAlunos!));

  const maxPatamar = withQtd[withQtd.length - 1].qtdAlunos || 1;
  const alvo = Math.max(1, Math.min(qtdAlunos || 1, maxPatamar));

  // regra: buscar o MAIOR patamar <= alvo
  let escolhido = withQtd[0];
  for (const t of withQtd) {
    if ((t.qtdAlunos || 1) <= alvo) escolhido = t;
  }

  return { tipo: escolhido, valor: Number(escolhido.valor) || 0 };
}

export default function ModalAulaForm({
  modo,
  aulaInicial,
  diaDefault,
  horaInicioDefault,
  alunosAtivos,
  professores,
  modalidades,
  agendaSelecionada,
  onClose,
  onSaved,
}: ModalAulaFormProps) {
  // ---------- LISTAS AUXILIARES ----------
  const [locais, setLocais] = useState<LocalQuadra[]>([]);
  const [tiposCobrancaAll, setTiposCobrancaAll] = useState<TipoCobranca[]>([]);
  const [planosAula, setPlanosAula] = useState<PlanoAula[]>([]);
  const [carregandoListas, setCarregandoListas] = useState(true);

  // ---------- ESTADOS DO FORMULÁRIO ----------
  const [dataAula] = useState<string>(() => {
    if (modo === "editar" && aulaInicial?.data) return aulaInicial.data;
    if (diaDefault) {
      const y = diaDefault.getFullYear();
      const m = String(diaDefault.getMonth() + 1).padStart(2, "0");
      const d = String(diaDefault.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const hoje = new Date();
    const yy = hoje.getFullYear();
    const mm = String(hoje.getMonth() + 1).padStart(2, "0");
    const dd = String(hoje.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  });

  const faixaAgendaDia = getLimitesHorario(agendaSelecionada ?? null, dataAula);

  const [horaInicio, setHoraInicio] = useState<string>(() => {
    if (modo === "editar" && aulaInicial?.horaInicio) return aulaInicial.horaInicio;
    if (horaInicioDefault) {
      return clampHoraDentroFaixa(
        horaInicioDefault,
        faixaAgendaDia?.inicio,
        faixaAgendaDia?.fim
      );
    }
    const base = faixaAgendaDia?.inicio || "09:00";
    return clampHoraDentroFaixa(base, faixaAgendaDia?.inicio, faixaAgendaDia?.fim);
  });

  const [horaFimAlteradaManualmente, setHoraFimAlteradaManualmente] =
    useState(false);

  const [horaFim, setHoraFim] = useState<string>(() => {
    if (modo === "editar" && aulaInicial?.horaFim) {
      return clampHoraDentroFaixa(
        aulaInicial.horaFim,
        faixaAgendaDia?.inicio,
        faixaAgendaDia?.fim
      );
    }
    const base = addUmaHora(horaInicioDefault || faixaAgendaDia?.inicio || "09:00");
    return clampHoraDentroFaixa(base, faixaAgendaDia?.inicio, faixaAgendaDia?.fim);
  });

  // Recorrência, ativa/inativa, tipo de grupo
  const [recorrente, setRecorrente] = useState<boolean>(() => {
    if (modo === "editar" && (aulaInicial as any)?.recorrente !== undefined) {
      return !!(aulaInicial as any).recorrente;
    }
    return false;
  });

  const [ativa, setAtiva] = useState<boolean>(() => {
    if (modo === "editar" && (aulaInicial as any)?.ativa !== undefined) {
      return !!(aulaInicial as any).ativa;
    }
    return true;
  });

  const [tipoGrupo, setTipoGrupo] = useState<"exclusiva" | "compartilhada">(
    () => {
      if (modo === "editar" && (aulaInicial as any)?.tipoGrupo) {
        return (aulaInicial as any).tipoGrupo as "exclusiva" | "compartilhada";
      }
      return "exclusiva";
    }
  );

  const [capacidadeMaxima, setCapacidadeMaxima] = useState<number>(() => {
    if (modo === "editar" && (aulaInicial as any)?.capacidadeMaxima) {
      return Number((aulaInicial as any).capacidadeMaxima) || 1;
    }
    return 1;
  });

  const [alunosSelecionadosIds, setAlunosSelecionadosIds] = useState<string[]>(
    () => (modo === "editar" && aulaInicial?.alunosIds ? aulaInicial.alunosIds : [])
  );

  // ✅ Agora: aula pode ser criada sem alunos e aberta para inscrição
  const [inscricaoAberta, setInscricaoAberta] = useState<boolean>(() => {
    if (modo === "editar" && (aulaInicial as any)?.inscricaoAberta !== undefined) {
      return !!(aulaInicial as any).inscricaoAberta;
    }
    return false;
  });

  // Professor / Local / Modalidade: travam se vierem da agenda
  const [professorId, setProfessorId] = useState<string>(() => {
    if (agendaSelecionada?.professorId) return agendaSelecionada.professorId;
    if (modo === "editar" && aulaInicial?.professorId) return aulaInicial.professorId;
    return "";
  });

  const [localId, setLocalId] = useState<string>(() => {
    if (agendaSelecionada?.localId) return agendaSelecionada.localId;
    if (modo === "editar" && aulaInicial?.localId) return aulaInicial.localId;
    return "";
  });

  const [modalidadeId, setModalidadeId] = useState<string>(() => {
    if (agendaSelecionada?.modalidadeId) return agendaSelecionada.modalidadeId;
    if (modo === "editar" && (aulaInicial as any)?.modalidadeId)
      return (aulaInicial as any).modalidadeId;
    return "";
  });

  // ---- COBRANÇA (NOVO) ----
  const [categoriaCobranca, setCategoriaCobranca] = useState<CategoriaCobranca>(() => {
    // tenta recuperar de aula existente
    const raw = (aulaInicial as any)?.cobrancaCategoria as string | undefined;
    const norm = normalizarCategoria(raw || "");
    return norm || "hora_aula";
  });

  const [modoCalculo, setModoCalculo] = useState<ModoCalculoCobranca>(() => {
    const raw = (aulaInicial as any)?.cobrancaModo as string | undefined;
    if (raw === "automatico" || raw === "fixo") return raw;
    return "fixo";
  });

  // fixo: tipo escolhido
  const [tipoCobrancaId, setTipoCobrancaId] = useState<string>(() => {
    if (modo === "editar" && (aulaInicial as any)?.tipoId) return (aulaInicial as any).tipoId;
    return "";
  });

  // automatico: escolhe a "tabela base"
  const [tabelaBaseNome, setTabelaBaseNome] = useState<string>(() => {
    const raw = (aulaInicial as any)?.cobrancaTabelaBase as string | undefined;
    return raw || "";
  });

  // Fonte da atividade: "manual" (texto livre) ou "plano"
  const [atividadeFonte, setAtividadeFonte] = useState<"plano" | "manual">(() => {
    if (modo === "editar" && (aulaInicial as any)?.atividadeFonte)
      return (aulaInicial as any).atividadeFonte;
    return "manual";
  });

  const [planoEscolhidoId, setPlanoEscolhidoId] = useState<string>(() => {
    if (modo === "editar" && (aulaInicial as any)?.atividadePlanoId)
      return (aulaInicial as any).atividadePlanoId;
    return "";
  });

  const [atividadeTitulo, setAtividadeTitulo] = useState<string>(() => {
    if (modo === "editar" && (aulaInicial as any)?.atividadeTitulo)
      return (aulaInicial as any).atividadeTitulo;
    return "";
  });

  const [atividadeTexto, setAtividadeTexto] = useState<string>(() => {
    if (modo === "editar" && aulaInicial?.atividadeTexto) return aulaInicial.atividadeTexto;
    return "";
  });

  const [observacao, setObservacao] = useState<string>(() => {
    if (modo === "editar" && (aulaInicial as any)?.observacao)
      return (aulaInicial as any).observacao;
    return "";
  });

  // feedback ui
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [buscaAluno, setBuscaAluno] = useState("");

  // ---------- EFEITOS ----------
  useEffect(() => {
    if (!horaFimAlteradaManualmente) {
      const novo = addUmaHora(horaInicio);
      setHoraFim(clampHoraDentroFaixa(novo, faixaAgendaDia?.inicio, faixaAgendaDia?.fim));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horaInicio, horaFimAlteradaManualmente]);

  useEffect(() => {
    async function carregarListas() {
      try {
        // Locais
        const snapLoc = await getDocs(collection(db, "locais"));
        const locs: LocalQuadra[] = [];
        snapLoc.forEach((docSnap) => {
          const d = docSnap.data() as DocumentData;
          if (d.ativo !== false) {
            locs.push({
              id: docSnap.id,
              nome: d.nome || "",
              ativo: d.ativo ?? true,
            });
          }
        });

        // Tipos de cobrança (AGORA: pega tudo e separa por categoria)
        const snapTipos = await getDocs(collection(db, "tiposCobranca"));
        const all: TipoCobranca[] = [];
        snapTipos.forEach((docSnap) => {
          const d = docSnap.data() as any;
          if (d.ativo === false) return;

          all.push({
            id: docSnap.id,
            nome: d.nome || "",
            valor: Number(d.valor) || 0,
            ativo: d.ativo ?? true,
            categoria: d.categoria || "",
            qtdAlunos: typeof d.qtdAlunos === "number" ? d.qtdAlunos : undefined,
            nomeBase: (d.nomeBase || "").trim() || inferNomeBase(d.nome || ""),
          });
        });

        all.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

        // Planos de aula
        const snapPlanos = await getDocs(collection(db, "planosAula"));
        const pAula: PlanoAula[] = [];
        snapPlanos.forEach((docSnap) => {
          const d = docSnap.data() as any;
          if (d.ativo !== false) {
            pAula.push({
              id: docSnap.id,
              modalidadeId: d.modalidadeId || "",
              tema: d.tema || "",
              atividades: d.atividades || "",
              ativo: d.ativo ?? true,
            });
          }
        });

        pAula.sort((a, b) => a.tema.localeCompare(b.tema, "pt-BR", { sensitivity: "base" }));

        setLocais(locs);
        setTiposCobrancaAll(all);
        setPlanosAula(pAula);
      } catch (err) {
        console.error("Erro ao carregar listas:", err);
      } finally {
        setCarregandoListas(false);
      }
    }
    carregarListas();
  }, []);

  // ---------- LISTAS DERIVADAS (COBRANÇA) ----------
  const tiposMensal = useMemo(
    () => tiposCobrancaAll.filter((t) => normalizarCategoria(t.categoria) === "mensal"),
    [tiposCobrancaAll]
  );

  const tiposHoraAula = useMemo(
    () => tiposCobrancaAll.filter((t) => normalizarCategoria(t.categoria) === "hora_aula"),
    [tiposCobrancaAll]
  );

  const temMensal = tiposMensal.length > 0;
  const temHoraAula = tiposHoraAula.length > 0;

  // Se só existir 1 categoria, “auto escolhe” e não mostra o seletor
  useEffect(() => {
    if (temMensal && !temHoraAula) setCategoriaCobranca("mensal");
    if (!temMensal && temHoraAula) setCategoriaCobranca("hora_aula");
  }, [temMensal, temHoraAula]);

  // Mensal não tem automático (neste modelo)
  useEffect(() => {
    if (categoriaCobranca === "mensal") setModoCalculo("fixo");
  }, [categoriaCobranca]);

  // tabelas base (para automático)
  const tabelasBaseDisponiveis = useMemo(() => {
    const list = (categoriaCobranca === "hora_aula" ? tiposHoraAula : tiposMensal)
      .map((t) => (t.nomeBase || inferNomeBase(t.nome)).trim())
      .filter(Boolean);
    return Array.from(new Set(list)).sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" })
    );
  }, [categoriaCobranca, tiposHoraAula, tiposMensal]);

  // valores calculados
  const qtdAlunosParaCobranca = useMemo(() => {
    // regra: automático usa número de alunos, mas pelo menos 1 (se você quiser cobrar mínimo)
    // como você pediu permitir criar sem aluno, aqui vamos:
    // - se não tem aluno: considera 0 (valor = 0 no automático até alguém entrar)
    return alunosSelecionadosIds.length;
  }, [alunosSelecionadosIds.length]);

  const cobrancaAutomatica = useMemo(() => {
    if (categoriaCobranca !== "hora_aula") return { tipo: undefined as TipoCobranca | undefined, valor: 0 };
    if (modoCalculo !== "automatico") return { tipo: undefined, valor: 0 };
    if (!tabelaBaseNome) return { tipo: undefined, valor: 0 };

    // cap pelo maior patamar disponível (ex: tabela vai até 4)
    const qtd = Math.max(0, qtdAlunosParaCobranca);

    const { tipo, valor } = pickAutomatico(tiposHoraAula, tabelaBaseNome, qtd);
    return { tipo, valor };
  }, [categoriaCobranca, modoCalculo, tabelaBaseNome, qtdAlunosParaCobranca, tiposHoraAula]);

  const tipoFixoSelecionado = useMemo(() => {
    const base = categoriaCobranca === "mensal" ? tiposMensal : tiposHoraAula;
    return base.find((t) => t.id === tipoCobrancaId);
  }, [categoriaCobranca, tiposMensal, tiposHoraAula, tipoCobrancaId]);

  const valorPrevistoFinal = useMemo(() => {
    if (categoriaCobranca === "hora_aula" && modoCalculo === "automatico") {
      return cobrancaAutomatica.valor || 0;
    }
    return Number(tipoFixoSelecionado?.valor) || 0;
  }, [categoriaCobranca, modoCalculo, cobrancaAutomatica.valor, tipoFixoSelecionado?.valor]);

  // Aplicar um plano selecionado
  const aplicarPlanoAula = useCallback(
    (planoId: string) => {
      setPlanoEscolhidoId(planoId);
      const plano = planosAula.find((p) => p.id === planoId);
      if (plano) {
        setAtividadeTitulo(plano.tema || "");
        setAtividadeTexto(plano.atividades || "");
        setAtividadeFonte("plano");
        if (!modalidadeId) setModalidadeId(plano.modalidadeId || "");
      }
    },
    [planosAula, modalidadeId]
  );

  // ---------- Alunos (respeitando capacidade) ----------
  function toggleAluno(idAluno: string) {
    setErro("");
    setAlunosSelecionadosIds((prev) => {
      const jaTem = prev.includes(idAluno);

      if (jaTem) return prev.filter((id) => id !== idAluno);

      if (tipoGrupo === "exclusiva") return [idAluno];

      const limite = capacidadeMaxima || 0;
      if (limite > 0 && prev.length >= limite) {
        setErro("Capacidade máxima de alunos atingida para este horário.");
        return prev;
      }

      return [...prev, idAluno];
    });
  }

  // ---------- salvar aula (criar/editar) ----------
  async function handleSalvar() {
    setErro("");

    if (!dataAula.trim()) return setErro("Selecione a data.");
    if (!horaInicio.trim()) return setErro("Informe horário de início.");
    if (!horaFim.trim()) return setErro("Informe horário final.");

    if (faixaAgendaDia) {
      if (horaInicio < faixaAgendaDia.inicio || horaInicio > faixaAgendaDia.fim) {
        return setErro(
          `Horário de início deve estar entre ${faixaAgendaDia.inicio} e ${faixaAgendaDia.fim} (agenda).`
        );
      }
      if (horaFim < faixaAgendaDia.inicio || horaFim > faixaAgendaDia.fim) {
        return setErro(
          `Horário final deve estar entre ${faixaAgendaDia.inicio} e ${faixaAgendaDia.fim} (agenda).`
        );
      }
    }

    if (horaFim <= horaInicio) {
      return setErro("O horário final deve ser maior que o horário de início.");
    }

    // ✅ NOVO: professor obrigatório só se NÃO for agenda de reservas
    const agendaTipo = (agendaSelecionada?.tipo || "aulas") as any;
    const professorObrigatorio = agendaTipo !== "reservas";
    if (professorObrigatorio && !professorId.trim()) {
      return setErro("Selecione o professor.");
    }

    if (!localId.trim()) return setErro("Selecione o local.");
    if (!modalidadeId.trim()) return setErro("Selecione a modalidade.");

    // COBRANÇA
    if (!temMensal && !temHoraAula) {
      return setErro("Nenhum tipo de cobrança ativo encontrado (tiposCobranca).");
    }

    if (categoriaCobranca === "hora_aula" && modoCalculo === "automatico") {
      if (!tabelaBaseNome) return setErro("Selecione a tabela base para cobrança automática.");
      // se não tem aluno, valor pode ser 0 (ainda assim permite salvar)
    } else {
      // fixo
      if (!tipoCobrancaId.trim()) return setErro("Selecione o tipo de cobrança.");
    }

    // ✅ NOVO: alunos não são obrigatórios
    // if (alunosSelecionadosIds.length === 0) return setErro("Selecione ao menos um aluno.");

    if (!atividadeTexto.trim()) {
      return setErro("Descreva as atividades da aula (campo 'Atividades').");
    }

    if (tipoGrupo === "compartilhada") {
      const limite = capacidadeMaxima || 0;
      if (limite > 0 && alunosSelecionadosIds.length > limite) {
        return setErro(`Número de alunos maior que a capacidade máxima (${limite}).`);
      }
    }

    try {
      setSalvando(true);
      setErro("");

      const professorObj = professores.find((p) => p.id === professorId);
      const localObj = locais.find((l) => l.id === localId);
      const modalidadeObj = modalidades.find((m) => m.id === modalidadeId);

      const alunosNomes = alunosAtivos
        .filter((a) => alunosSelecionadosIds.includes(a.id))
        .map((a) => a.nome);

      const agoraISO = new Date().toISOString();

      // Caso "manual": cria também um plano reutilizável
      if (atividadeFonte === "manual") {
        const temaParaPlano = (atividadeTitulo || "").trim();
        const atividadesParaPlano = (atividadeTexto || "").trim();

        if (temaParaPlano && atividadesParaPlano) {
          await addDoc(collection(db, "planosAula"), {
            modalidadeId,
            tema: temaParaPlano,
            atividades: atividadesParaPlano,
            ativo: true,
            criadoEm: serverTimestamp(),
            atualizadoEm: serverTimestamp(),
          });
        }
      }

      let repetirIdFinal = (aulaInicial as any)?.repetirId || "";
      if (recorrente && !repetirIdFinal) {
        repetirIdFinal = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      }
      if (!recorrente) repetirIdFinal = "";

      // 🔥 Dados da cobrança calculados
      const cobrancaCategoriaStr = categoriaCobranca === "mensal" ? "mensal" : "hora_aula";
      const cobrancaModoStr = modoCalculo;

      let tipoIdFinal = "";
      let tipoNomeFinal = "";
      let valorFinal = 0;

      if (categoriaCobranca === "hora_aula" && modoCalculo === "automatico") {
        tipoIdFinal = cobrancaAutomatica.tipo?.id || "";
        tipoNomeFinal = cobrancaAutomatica.tipo?.nome || tabelaBaseNome;
        valorFinal = cobrancaAutomatica.valor || 0;
      } else {
        tipoIdFinal = tipoCobrancaId;
        tipoNomeFinal = tipoFixoSelecionado?.nome || "";
        valorFinal = Number(tipoFixoSelecionado?.valor) || 0;
      }

      const payloadBase: any = {
        data: dataAula,
        horaInicio,
        horaFim,

        professorId: professorObrigatorio ? professorId : (professorId || null),
        professorNome: professorObrigatorio ? (professorObj?.nome || "") : (professorObj?.nome || ""),

        localId,
        localNome: localObj?.nome || "",

        modalidadeId,
        modalidadeNome: modalidadeObj?.nome || "",

        // 🔹 vínculo com a agenda clicada
        agendaId: agendaSelecionada?.id || (aulaInicial as any)?.agendaId || null,
        agendaNome: agendaSelecionada?.nome || (aulaInicial as any)?.agendaNome || "",

        // ✅ NOVO: inscrição aberta (aula sem aluno pode virar “vaga/aberta”)
        inscricaoAberta: !!inscricaoAberta,
        somenteInscricao: !!inscricaoAberta, // ideia: no portal, travar edição e permitir só entrar/sair

        atividadeFonte,
        atividadePlanoId: planoEscolhidoId || "",
        atividadeTitulo,
        atividadeTexto,
        observacao,

        alunosIds: alunosSelecionadosIds,
        alunosNomes,

        recorrente,
        repetirId: repetirIdFinal,
        repetirJanelaSemanas: recorrente ? 5 : 0,
        ativa,
        tipoGrupo,
        capacidadeMaxima: tipoGrupo === "exclusiva" ? 1 : capacidadeMaxima || 0,

        // 🔥 COBRANÇA (novo padrão)
        cobrancaCategoria: cobrancaCategoriaStr,     // "mensal" | "hora_aula"
        cobrancaModo: cobrancaModoStr,               // "fixo" | "automatico"
        cobrancaTabelaBase: modoCalculo === "automatico" ? tabelaBaseNome : "",
        tipoId: tipoIdFinal,                         // id do tipo efetivo (fixo ou patamar automático)
        tipoNome: tipoNomeFinal,
        tipoCobranca: tipoNomeFinal,
        valorPrevisto: valorFinal,

        criadoEm: modo === "novo" ? agoraISO : aulaInicial?.criadoEm || agoraISO,
        atualizadoEm: agoraISO,
      };

      if (modo === "novo") {
        const totalOcorrencias = recorrente ? 5 : 1;

        const aulasCriadas: Aula[] = [];

        const [yy, mm, dd] = dataAula.split("-").map((x) => Number(x));
        let dataCursor = new Date(yy, (mm || 1) - 1, dd || 1);

        for (let i = 0; i < totalOcorrencias; i++) {
          const ano = dataCursor.getFullYear();
          const mes = String(dataCursor.getMonth() + 1).padStart(2, "0");
          const dia = String(dataCursor.getDate()).padStart(2, "0");
          const dataParaOcorrencia = `${ano}-${mes}-${dia}`;

          const payloadParaOcorrencia: any = { ...payloadBase, data: dataParaOcorrencia };

          if (i > 0) {
            payloadParaOcorrencia.atividadePlanoId = "";
            payloadParaOcorrencia.atividadeTitulo = "";
            payloadParaOcorrencia.atividadeTexto = "";
            payloadParaOcorrencia.observacao = "";
          }

          const ref = await addDoc(collection(db, "aulas"), payloadParaOcorrencia);
          aulasCriadas.push({ ...(payloadParaOcorrencia as Aula), id: ref.id });

          dataCursor.setDate(dataCursor.getDate() + 7);
        }

        if (aulasCriadas[0]) onSaved(aulasCriadas[0]);

        onClose();
        if (typeof window !== "undefined") window.location.reload();
      } else {
        if (!aulaInicial?.id) {
          setErro("Erro interno: aula sem ID.");
          setSalvando(false);
          return;
        }

        const repetirIdOriginal = (aulaInicial as any)?.repetirId;

        if (recorrente && repetirIdOriginal) {
          const aplicarTodas = window.confirm(
            "Deseja aplicar estas alterações também para todas as aulas futuras desta recorrência? (OK = esta e futuras, Cancelar = somente esta)."
          );

          if (aplicarTodas) {
            const q = query(
              collection(db, "aulas"),
              where("repetirId", "==", repetirIdOriginal),
              where("data", ">=", dataAula)
            );
            const snap = await getDocs(q);

            const updates = snap.docs.map(async (docSnap) => {
              const refDoc = fsDoc(db, "aulas", docSnap.id);
              await updateDoc(refDoc, payloadBase);
            });

            await Promise.all(updates);
          } else {
            await updateDoc(fsDoc(db, "aulas", aulaInicial.id), payloadBase);
          }
        } else {
          await updateDoc(fsDoc(db, "aulas", aulaInicial.id), payloadBase);
        }

        const aulaAtualizada: Aula = { ...(payloadBase as Aula), id: aulaInicial.id };
        onSaved(aulaAtualizada);
        onClose();
        if (typeof window !== "undefined") window.location.reload();
      }
    } catch (err) {
      console.error(err);
      setErro("Erro ao salvar aula.");
    } finally {
      setSalvando(false);
    }
  }

  // lista dinâmica de alunos
  const alunosFiltrados = alunosAtivos
    .filter((a) => a.status === "ativo")
    .filter((a) => {
      if (!buscaAluno.trim()) return true;
      const termo = buscaAluno.toLowerCase();
      return a.nome.toLowerCase().includes(termo);
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

  // Filtra planos pela modalidade selecionada
  const planosFiltrados = planosAula.filter((p) => (modalidadeId ? p.modalidadeId === modalidadeId : true));

  const professorTravado = !!agendaSelecionada?.professorId;
  const localTravado = !!agendaSelecionada?.localId;
  const modalidadeTravada = !!agendaSelecionada?.modalidadeId;

  const agendaTipo = (agendaSelecionada?.tipo || "aulas") as any;
  const professorObrigatorio = agendaTipo !== "reservas";

  // ---------- UI ----------
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {modo === "novo" ? "Nova aula" : "Editar aula"}
            </h2>
            {modo === "editar" && aulaInicial?.id && (
              <p className="text-[11px] text-gray-500 leading-snug">
                ID: <span className="font-mono">{aulaInicial.id}</span>
              </p>
            )}
          </div>

          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-800">
            ✕
          </button>
        </div>

        {carregandoListas ? (
          <div className="text-sm text-gray-500 py-6 text-center">Carregando dados...</div>
        ) : (
          <>
            {/* DATA / INÍCIO / FIM */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="flex flex-col">
                <label className="text-xs text-gray-700 font-medium">Data</label>
                <input
                  type="date"
                  className="border rounded-xl p-2 text-sm bg-gray-100 text-gray-600 cursor-not-allowed"
                  value={dataAula}
                  readOnly
                  disabled
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs text-gray-700 font-medium">Início</label>
                <input
                  type="time"
                  className="border rounded-xl p-2 text-sm"
                  value={horaInicio}
                  min={faixaAgendaDia?.inicio || undefined}
                  max={faixaAgendaDia?.fim || undefined}
                  onChange={(e) => {
                    const v = clampHoraDentroFaixa(e.target.value, faixaAgendaDia?.inicio, faixaAgendaDia?.fim);
                    setHoraInicio(v);
                  }}
                />
                {faixaAgendaDia && (
                  <span className="text-[10px] text-gray-500 mt-0.5">
                    Faixa da agenda: {faixaAgendaDia.inicio} → {faixaAgendaDia.fim}
                  </span>
                )}
              </div>

              <div className="flex flex-col">
                <label className="text-xs text-gray-700 font-medium">Final</label>
                <input
                  type="time"
                  className="border rounded-xl p-2 text-sm"
                  value={horaFim}
                  min={faixaAgendaDia?.inicio || undefined}
                  max={faixaAgendaDia?.fim || undefined}
                  onChange={(e) => {
                    const v = clampHoraDentroFaixa(e.target.value, faixaAgendaDia?.inicio, faixaAgendaDia?.fim);
                    setHoraFim(v);
                    setHoraFimAlteradaManualmente(true);
                  }}
                />
              </div>
            </div>

            {/* Recorrência / Ativa / Tipo de grupo */}
            <div className="grid grid-cols-1 gap-3 text-xs border rounded-xl p-3 bg-gray-50">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-700">Opções da aula</span>

                <button
                  type="button"
                  onClick={() => setRecorrente((v) => !v)}
                  className={`px-3 py-1 rounded-full border text-[11px] ${
                    recorrente ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  {recorrente ? "Recorrente (semanal)" : "Não recorrente"}
                </button>

                <button
                  type="button"
                  onClick={() => setAtiva((v) => !v)}
                  className={`px-3 py-1 rounded-full text-[11px] border ${
                    ativa ? "bg-green-100 text-green-800 border-green-500" : "bg-red-100 text-red-700 border-red-500"
                  }`}
                >
                  {ativa ? "Aula ATIVA" : "Aula DESATIVADA"}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] text-gray-700">Tipo de aula:</span>

                <button
                  type="button"
                  onClick={() => {
                    setTipoGrupo("exclusiva");
                    setCapacidadeMaxima(1);
                    if (alunosSelecionadosIds.length > 1) {
                      setAlunosSelecionadosIds((prev) => (prev.length ? [prev[0]] : []));
                    }
                  }}
                  className={`px-3 py-1 rounded-full border text-[11px] ${
                    tipoGrupo === "exclusiva" ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  Exclusiva
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTipoGrupo("compartilhada");
                    if (capacidadeMaxima < alunosSelecionadosIds.length) {
                      setCapacidadeMaxima(alunosSelecionadosIds.length);
                    } else if (capacidadeMaxima < 2) {
                      setCapacidadeMaxima(2);
                    }
                  }}
                  className={`px-3 py-1 rounded-full border text-[11px] ${
                    tipoGrupo === "compartilhada" ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  Grupo compartilhado
                </button>

                {tipoGrupo === "compartilhada" && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span>Capacidade máx.:</span>
                    <input
                      type="number"
                      min={1}
                      className="w-16 border rounded-lg px-2 py-1 text-[11px]"
                      value={capacidadeMaxima || ""}
                      onChange={(e) => setCapacidadeMaxima(Math.max(1, Number(e.target.value) || 1))}
                    />
                    <span className="text-gray-500">
                      Alunos: {alunosSelecionadosIds.length}/{capacidadeMaxima || "∞"}
                    </span>
                  </div>
                )}
              </div>

              {/* ✅ NOVO: aula sem aluno pode abrir inscrição */}
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-gray-700">
                  Aula sem aluno? Você pode abrir para inscrição no portal.
                </div>
                <label className="flex items-center gap-2 text-[11px]">
                  <input
                    type="checkbox"
                    checked={inscricaoAberta}
                    onChange={(e) => setInscricaoAberta(e.target.checked)}
                    disabled={alunosSelecionadosIds.length > 0}
                  />
                  <span className={alunosSelecionadosIds.length > 0 ? "text-gray-400" : ""}>
                    Abrir inscrição
                  </span>
                </label>
              </div>
              {alunosSelecionadosIds.length > 0 && (
                <div className="text-[10px] text-gray-500">
                  (Para abrir inscrição, deixe a aula sem alunos.)
                </div>
              )}
            </div>

            {/* PROFESSOR / LOCAL */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex flex-col">
                <label className="text-xs text-gray-700 font-medium">
                  Professor(a) {professorObrigatorio ? "*" : "(opcional)"}
                </label>
                <select
                  className={`border rounded-xl p-2 text-sm ${
                    professorTravado ? "bg-gray-100 text-gray-600" : ""
                  }`}
                  value={professorId}
                  onChange={(e) => {
                    if (professorTravado) return;
                    setProfessorId(e.target.value);
                  }}
                  disabled={professorTravado}
                >
                  <option value="">
                    {professorObrigatorio ? "-- Selecione --" : "-- (sem professor) --"}
                  </option>
                  {professores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                {professorTravado && (
                  <span className="text-[10px] text-gray-500 mt-0.5">Professor definido pela agenda</span>
                )}
                {!professorObrigatorio && (
                  <span className="text-[10px] text-gray-500 mt-0.5">
                    Agenda de reservas: professor não é obrigatório
                  </span>
                )}
              </div>

              <div className="flex flex-col">
                <label className="text-xs text-gray-700 font-medium">Local *</label>
                <select
                  className={`border rounded-xl p-2 text-sm ${localTravado ? "bg-gray-100 text-gray-600" : ""}`}
                  value={localId}
                  onChange={(e) => {
                    if (localTravado) return;
                    setLocalId(e.target.value);
                  }}
                  disabled={localTravado}
                >
                  <option value="">-- Selecione --</option>
                  {locais.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </select>
                {localTravado && <span className="text-[10px] text-gray-500 mt-0.5">Local definido pela agenda</span>}
              </div>
            </div>

            {/* MODALIDADE */}
            <div className="flex flex-col text-sm">
              <label className="text-xs text-gray-700 font-medium">Modalidade *</label>
              <select
                className={`border rounded-xl p-2 text-sm ${modalidadeTravada ? "bg-gray-100 text-gray-600" : ""}`}
                value={modalidadeId}
                onChange={(e) => {
                  if (modalidadeTravada) return;
                  setModalidadeId(e.target.value);
                }}
                disabled={modalidadeTravada}
              >
                <option value="">-- Selecione --</option>
                {modalidades
                  .filter((m) => m.ativo !== false)
                  .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
              </select>
              {modalidadeTravada && (
                <span className="text-[10px] text-gray-500 mt-0.5">Modalidade definida pela agenda</span>
              )}
            </div>

            {/* ✅ COBRANÇA (NOVO BLOCO COMPLETO) */}
            <div className="flex flex-col text-sm border rounded-xl p-3 bg-gray-50">
              <label className="text-xs text-gray-700 font-medium">Cobrança *</label>

              {/* Se tem as duas categorias, mostra seletor. Se só uma, não mostra */}
              {temMensal && temHoraAula ? (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    type="button"
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold ${
                      categoriaCobranca === "mensal" ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"
                    }`}
                    onClick={() => setCategoriaCobranca("mensal")}
                  >
                    Mensal
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold ${
                      categoriaCobranca === "hora_aula" ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"
                    }`}
                    onClick={() => setCategoriaCobranca("hora_aula")}
                  >
                    Hora / Aula
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-gray-600 mt-1">
                  {temMensal && !temHoraAula
                    ? "Somente cobrança Mensal disponível."
                    : !temMensal && temHoraAula
                    ? "Somente cobrança Hora/Aula disponível."
                    : "Nenhum tipo de cobrança disponível."}
                </div>
              )}

              {/* Modo (fixo/automatico) — só para hora/aula */}
              {categoriaCobranca === "hora_aula" && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button
                    type="button"
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold ${
                      modoCalculo === "fixo" ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"
                    }`}
                    onClick={() => setModoCalculo("fixo")}
                  >
                    Fixo
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold ${
                      modoCalculo === "automatico" ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"
                    }`}
                    onClick={() => setModoCalculo("automatico")}
                  >
                    Automático
                  </button>
                </div>
              )}

              {/* Seleção do tipo */}
              {categoriaCobranca === "mensal" || modoCalculo === "fixo" ? (
                <div className="flex flex-col mt-3">
                  <label className="text-[11px] text-gray-600 font-medium">
                    {categoriaCobranca === "mensal" ? "Tipo mensal" : "Tipo hora/aula (fixo)"}
                  </label>
                  <select
                    className="border rounded-xl p-2 text-sm bg-white"
                    value={tipoCobrancaId}
                    onChange={(e) => setTipoCobrancaId(e.target.value)}
                  >
                    <option value="">-- Selecione --</option>
                    {(categoriaCobranca === "mensal" ? tiposMensal : tiposHoraAula).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome} ({formatMoeda(t.valor)})
                      </option>
                    ))}
                  </select>
                  {!!tipoFixoSelecionado && (
                    <div className="text-[11px] text-gray-600 mt-1">
                      Valor previsto: <span className="font-semibold">{formatMoeda(valorPrevistoFinal)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col mt-3">
                  <label className="text-[11px] text-gray-600 font-medium">
                    Tabela base (automático)
                  </label>
                  <select
                    className="border rounded-xl p-2 text-sm bg-white"
                    value={tabelaBaseNome}
                    onChange={(e) => setTabelaBaseNome(e.target.value)}
                  >
                    <option value="">-- Selecione a tabela base --</option>
                    {tabelasBaseDisponiveis.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>

                  <div className="text-[11px] text-gray-600 mt-1">
                    Alunos selecionados: <span className="font-semibold">{alunosSelecionadosIds.length}</span>
                    {" • "}
                    Valor previsto:{" "}
                    <span className="font-semibold">{formatMoeda(valorPrevistoFinal)}</span>
                  </div>

                  <div className="text-[10px] text-gray-500 mt-1">
                    Regra: cobra o maior patamar disponível até o nº de alunos (ex.: tabela até 4 → usa 4 mesmo com 8).
                  </div>
                </div>
              )}
            </div>

            {/* ALUNOS */}
            <div className="flex flex-col text-sm">
              <label className="text-xs text-gray-700 font-medium mb-1">
                Aluno(s)
                <span className="block text-[10px] text-gray-500 font-normal">
                  Marque quem participa (pode salvar sem alunos)
                </span>
              </label>

              <div className="flex items-center gap-2 mb-2">
                <input
                  className="flex-1 border rounded-xl p-2 text-xs"
                  placeholder="Pesquisar aluno pelo nome..."
                  value={buscaAluno}
                  onChange={(e) => setBuscaAluno(e.target.value)}
                />
                {buscaAluno.trim() !== "" && (
                  <button
                    type="button"
                    className="text-[10px] px-2 py-1 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
                    onClick={() => setBuscaAluno("")}
                  >
                    Limpar
                  </button>
                )}
              </div>

              <div className="border rounded-xl max-h-32 overflow-auto p-2 space-y-2 bg-gray-50">
                {alunosFiltrados.length === 0 ? (
                  <div className="text-[11px] text-gray-500 italic px-2 py-3 text-center">
                    Nenhum aluno encontrado
                  </div>
                ) : (
                  alunosFiltrados.map((al) => {
                    const marcado = alunosSelecionadosIds.includes(al.id);
                    return (
                      <div
                        key={al.id}
                        onClick={() => toggleAluno(al.id)}
                        className={`flex items-start justify-between text-xs px-3 py-2 rounded-xl border cursor-pointer transition ${
                          marcado
                            ? "bg-black text-white border-black"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                        }`}
                      >
                        <input type="checkbox" className="hidden" checked={marcado} readOnly />
                        <span className="leading-tight font-medium">{al.nome}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ATIVIDADE / PLANO */}
            <div className="flex flex-col text-sm">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs text-gray-700 font-medium">
                  Atividade / Plano de aula
                  <span className="block text-[10px] text-gray-500 font-normal">
                    Use um plano pronto ou escreva livremente (o texto livre vira um plano reutilizável).
                  </span>
                </label>

                <div className="flex items-center gap-2 text-[10px]">
                  <button
                    type="button"
                    className={`px-2 py-1 rounded-lg border ${
                      atividadeFonte === "manual" ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"
                    }`}
                    onClick={() => setAtividadeFonte("manual")}
                  >
                    Texto livre
                  </button>

                  <button
                    type="button"
                    className={`px-2 py-1 rounded-lg border ${
                      atividadeFonte === "plano" ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"
                    }`}
                    onClick={() => setAtividadeFonte("plano")}
                  >
                    Usar plano
                  </button>
                </div>
              </div>

              {atividadeFonte === "plano" && (
                <div className="flex flex-col mt-2">
                  <label className="text-[11px] text-gray-600 font-medium">
                    Selecionar plano salvo {modalidadeId ? "(filtrado pela modalidade)" : ""}
                  </label>
                  <select
                    className="border rounded-xl p-2 text-sm"
                    value={planoEscolhidoId}
                    onChange={(e) => aplicarPlanoAula(e.target.value)}
                  >
                    <option value="">-- Escolha um plano --</option>
                    {(planosFiltrados.length ? planosFiltrados : planosAula).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.tema}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-col mt-2">
                <label className="text-xs text-gray-700 font-medium">Título (tema)</label>
                <input
                  className="border rounded-xl p-2 text-sm"
                  value={atividadeTitulo}
                  onChange={(e) => setAtividadeTitulo(e.target.value)}
                  placeholder="Ex.: Forehand de Aproximação"
                />
              </div>

              <div className="flex flex-col mt-2">
                <label className="text-xs text-gray-700 font-medium">Atividades</label>
                <textarea
                  className="border rounded-xl p-2 text-sm"
                  rows={4}
                  placeholder="Descreva as atividades da aula..."
                  value={atividadeTexto}
                  onChange={(e) => setAtividadeTexto(e.target.value)}
                />
              </div>

              <div className="flex flex-col mt-2">
                <label className="text-xs text-gray-700 font-medium">Observação (somente na aula)</label>
                <textarea
                  className="border rounded-xl p-2 text-sm"
                  rows={2}
                  placeholder="Observações específicas desta aula (não vai para o plano)"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </div>
            </div>

            {/* ERRO */}
            {erro && <div className="text-red-600 text-xs font-medium">{erro}</div>}

            {/* AÇÕES */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-200 text-gray-700 rounded-xl px-4 py-2 text-xs font-semibold hover:bg-gray-300"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={salvando}
                onClick={handleSalvar}
                className="flex-1 bg-black text-white rounded-xl px-4 py-2 text-xs font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {salvando ? "Salvando..." : modo === "novo" ? "Salvar aula" : "Salvar alterações"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
