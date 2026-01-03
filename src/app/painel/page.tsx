//src/app/painel/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { auth, db } from "../../lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  updateDoc,
  deleteDoc,
  doc as fsDoc,
  DocumentData,
} from "firebase/firestore";

import { doc, getDoc } from "firebase/firestore";

import Link from "next/link";

import dynamic from "next/dynamic";

import ModalAulaForm from "../admin/aula-form/ModalAulaForm";
import ModalNovoAluno from "../admin/novo-aluno/ModalNovoAluno";
import type { Aluno, Aula } from "../admin/types";

import { matchByTerm } from "../admin/utils/search";
import { useMemo } from "react";
import { ModalPermissoesRoles } from "../admin/gerenciamento/ModalPermissoesRoles";

import type { AgendaTipo } from "../admin/agendas/service";
import { listAgendas, type AgendaConfig } from "../admin/agendas/service";

import ModalDetalheAula from "../admin/aulas/ModalDetalheAula";

// import dinâmico do modal de Modalidades (sem SSR)
const ModalPerfisList = dynamic(
  () => import("../admin/perfis/ModalPerfisList"),
  { ssr: false }
);

const ModalPlanosAulaList = dynamic(
  () => import("../admin/planos/ModalPlanosAulaList"),
  { ssr: false }
);

const ModalidadesModal = dynamic(
  () => import("../admin/modalidades/ModalModalidades"),
  { ssr: false }
);


const ModalProfessoresList = dynamic(
  () => import("../admin/professores/ModalProfessoresList"),
  { ssr: false }
);

const ModalLocaisList = dynamic(
  () => import("../admin/locais/ModalLocaisList"),
  { ssr: false }
);

const ModalTiposCobrancaList = dynamic(
  () => import("../admin/tipos/ModalTiposCobrancaList"),
  { ssr: false }
);

const ModalAgendasList = dynamic(
  () => import("../admin/agendas/ModalAgendasList"),
  { ssr: false }
);

// recorrencia
function parseISODate(d: string): Date {
  const [y, m, dia] = d.split("-").map((n) => Number(n));
  return new Date(y, (m || 1) - 1, dia || 1);
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function addDaysISO(dISO: string, dias: number): string {
  const d = parseISODate(dISO);
  d.setDate(d.getDate() + dias);
  return toISODate(d);
}

// helper pra converter Date -> "YYYY-MM-DD"
function dateToISO(d: Date): string {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// -------------------- Tipos --------------------
type Modalidade = {
  id: string;
  nome: string;
  ativo: boolean;
};

type Responsavel = {
  id: string;
  nome: string;
  email: string;
  cpf: string;
  endereco: string;
  numero?: string;
  complemento?: string;
  telefone?: string;
  alunosIds: string[];
  ativo: boolean;
};

type Familia = {
  responsavel: Responsavel;
  alunos: Aluno[];
};

type Professor = {
  id: string;
  nome: string;
  telefone?: string;
  email: string;
  ativo: boolean;
};

// ------------------------------------------------
export default function PainelPage() { const router = useRouter();

   // 🔹 Data “base” selecionada para carregar aulas na agenda
  const [dataSelecionada, setDataSelecionada] = useState<Date>(() => new Date());

  // sempre que a data mudar, geramos a string ISO (YYYY-MM-DD)
  const dataSelecionadaISO = dateToISO(dataSelecionada);


  // -------------------- Estados gerais --------------------
  const [showPerfis, setShowPerfis] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [emailUsuario, setEmailUsuario] = useState<string>("");
  const [nomeUsuario, setNomeUsuario] = useState("");

  const [showLocais, setShowLocais] = useState(false);
  const [showTiposCobranca, setShowTiposCobranca] = useState(false);

  const [alunos, setAlunos] = useState<Aluno[]>([]);

   // lista de alunos ativos para usar no ModalAulaForm
   const alunosAtivos = useMemo(
  () => alunos.filter((a) => a.status === "ativo"),
  [alunos]
);
  const [aulasHoje, setAulasHoje] = useState<Aula[]>([]);
  const [familias, setFamilias] = useState<Familia[]>([]);

  const [professores, setProfessores] = useState<Professor[]>([]);
  const [showProfModal, setShowProfModal] = useState(false);
  const [modoProfModal, setModoProfModal] = useState<"novo" | "editar">("novo");
  const [profSelecionado, setProfSelecionado] = useState<Professor | null>(null);

  const [showProfList, setShowProfList] = useState(false);

  const [abaSelecionada, setAbaSelecionada] = useState<
    "agenda" | "reservasQuadra" | "alunos" | "responsaveis" | "financeiro"
  >("agenda");

  const [responsavelSelecionadoId, setResponsavelSelecionadoId] = useState<
    string | null
  >(null);

  const [editando, setEditando] = useState(false);
  const [editEmail, setEditEmail] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editEndereco, setEditEndereco] = useState("");

  const [showPlanosList, setShowPlanosList] = useState(false);

  const [erroFirestore, setErroFirestore] = useState("");
  const [showGerenciamento, setShowGerenciamento] = useState(false);

  const [showAgendas, setShowAgendas] = useState(false);

  // Agendas de configuração (aulas/reservas/híbrida)
const [agendasConfig, setAgendasConfig] = useState<AgendaConfig[]>([]);
const [agendaSelecionadaId, setAgendaSelecionadaId] = useState<string | null>(null);
const [carregandoAgendas, setCarregandoAgendas] = useState(false);
const [carregandoAgendasConfig, setCarregandoAgendasConfig] = useState(true);

const agendaSelecionada = useMemo(
  () =>
    agendasConfig.find((a) => a.id === agendaSelecionadaId) ?? null,
  [agendasConfig, agendaSelecionadaId]
);


const agendaSelecionadaConfig =
  agendaSelecionadaId
    ? agendasConfig.find((a) => a.id === agendaSelecionadaId) ?? null
    : null;


// -------------------- Edição de aluno --------------------
const [editAluno, setEditAluno] = useState<Aluno | null>(null);
const [salvandoAluno, setSalvandoAluno] = useState(false);
const [erroAluno, setErroAluno] = useState("");

// abre/fecha card detalhes do aluno
const [alunoAbertoId, setAlunoAbertoId] = useState<string | null>(null);

// modal de novo aluno (se já existe, mantenha)
const [showNovoAluno, setShowNovoAluno] = useState(false);

const [alunoAbertoIdPorResponsavel, setAlunoAbertoIdPorResponsavel] = useState<string | null>(null);



  // -------------------- Agenda / calendário --------------------
  const [agendaView, setAgendaView] = useState<"mes" | "semana" | "dia">("mes");
 

  // Data base usada pra navegar entre mês/semana/dia
  const [agendaDataBase, setAgendaDataBase] = useState<Date>(new Date());

  // Dia que a visão "Dia" mostra
  const [diaFocado, setDiaFocado] = useState<Date>(new Date());

  // aula atualmente aberta no modal de detalhe
  const [aulaSelecionadaDetalhe, setAulaSelecionadaDetalhe] = useState<Aula | null>(null);

  // controle do modal de confirmação de exclusão (opcional, mas eu já deixo simples)
  const [excluindoAula, setExcluindoAula] = useState(false);

  // -------------------- Form de AULA (criar/editar) --------------------
  const [showAulaForm, setShowAulaForm] = useState(false);
  const [modoAulaForm, setModoAulaForm] = useState<"novo" | "editar">("novo");
  const [aulaSelecionadaEdicao, setAulaSelecionadaEdicao] = useState<Aula | null>(null);
  const [aulaSelecionada, setAulaSelecionada] = useState<Aula | null>(null);
  const [diaDefault, setDiaDefault] = useState<Date | null>(null);
  const [horaDefault, setHoraDefault] = useState<string | undefined>(undefined);
 
  //------
const [aulaParaExcluir, setAulaParaExcluir] = useState<Aula | null>(null);
const [showConfirmExclusao, setShowConfirmExclusao] = useState(false);

  // valores default quando for NOVO
  const [diaDefaultForm, setDiaDefaultForm] = useState<Date | null>(null);
  const [horaDefaultForm, setHoraDefaultForm] = useState<string | undefined>(undefined);

const [menuOpen, setMenuOpen] = useState(false);
function closeMenu() { setMenuOpen(false); }

const [buscaGlobal, setBuscaGlobal] = useState("");

const [modalidades, setModalidades] = useState<Modalidade[]>([]);
const [showModalidades, setShowModalidades] = useState(false);

  // -------------------- Helpers globais --------------------
  function toggleAlunoVinculado(alunoId: string) {
  setAlunoAbertoIdPorResponsavel((prev) => (prev === alunoId ? null : alunoId));
}

  function nomeDoResponsavelDoAluno(a: Aluno) {
  const fam = familias.find((f) => f.responsavel.id === a.responsavelId);
  return fam?.responsavel?.nome ?? "";
}

const alunosFiltrados = useMemo(() => {
  return !buscaGlobal
    ? alunos
    : alunos.filter((a) =>
        matchByTerm(a, buscaGlobal, {
          // só olho campos úteis do ALUNO…
          allowKeys: [
            "nome",
            "telefone",
            "cpf",
            "modalidades",
            "status",
            "observacoes",
            // e também o "responsavelNome" derivado:
            "responsavelNome",
          ],
          // …mas acrescento um derivado para cair na busca
          augment: (x) => ({ responsavelNome: nomeDoResponsavelDoAluno(x) }),
        })
      );
}, [alunos, familias, buscaGlobal]);

const familiasFiltradas = useMemo(() => {
  return !buscaGlobal
    ? familias
    : familias.filter((f) =>
        matchByTerm(
          // junto responsável + alunos (para buscar em tudo de uma vez)
          { ...f.responsavel, alunos: f.alunos },
          buscaGlobal,
          {
            // foco nos campos principais do responsável + lista de alunos
            allowKeys: [
              "nome",
              "email",
              "cpf",
              "telefone",
              "endereco",
              "numero",
              "complemento",
              "alunos", // inclui alunos aninhados!
            ],
          }
        )
      );
}, [familias, buscaGlobal]);

const aulasFiltradas = useMemo(() => {
  // 1) Base: aulas do dia
  let base = aulasHoje;

  // 2) Se tiver uma agenda selecionada, filtra por ela
  if (agendaSelecionadaConfig) {
    base = base.filter((aula) => {
      const aAny = aula as any;

      // Se a aula tem agendaId explícito, só aparece
      // quando bate com a agenda selecionada
      if (aAny.agendaId) {
        return aAny.agendaId === agendaSelecionadaConfig.id;
      }

      // Se for aula antiga sem agendaId, você decide:
      // - false = não mostrar quando há agenda selecionada
      // - true  = mostrar em todas as agendas (não recomendo)
      return false;
    });
  }

  // 3) Se não tem buscaGlobal, retorna só o filtro por agenda
  if (!buscaGlobal) {
    return base;
  }

  // 4) Aplica a busca em cima da base já filtrada pela agenda
  return base.filter((a) =>
    matchByTerm(a, buscaGlobal, {
      allowKeys: [
        "data",
        "horaInicio",
        "horaFim",
        "alunosNomes",
        "professorNome",
        "professorId",
        "localNome",
        "localId",
        "tipoNome",
        "tipoCobranca",
        "atividadeTexto",
        "referenciaTipo",
      ],
    })
  );
}, [aulasHoje, buscaGlobal, agendaSelecionadaConfig]);


  // utilitário: verifica se o termo aparece em qualquer campo string
function includesTerm(value: unknown, term: string) {
  if (!term) return true;
  if (value == null) return false;
  return String(value).toLowerCase().includes(term.toLowerCase());
}

// filtra um responsável por qualquer campo relevante
function filtraResponsavel(r: any, term: string) {
  return [
    r.nome,
    r.email,
    r.cpf,
    r.telefone,
    r.endereco,
    r.numero,
    r.complemento,
  ].some((v) => includesTerm(v, term));
}

// filtra um aluno por qualquer campo relevante
function filtraAluno(a: any, term: string) {
  return [
    a.nome,
    a.responsavelNome,   // se você tiver esse campo
    a.telefone,
    a.cpf,
    a.modalidades?.join(", "),
    a.status,
  ].some((v) => includesTerm(v, term));
}

  function avancarPeriodo() {
  setAgendaDataBase(prev => {
    const nova = new Date(prev);
    if (agendaView === "mes") {
      nova.setMonth(nova.getMonth() + 1);
    } else if (agendaView === "semana") {
      nova.setDate(nova.getDate() + 7);
    } else {
      // "dia"
      nova.setDate(nova.getDate() + 1);
    }
    return nova;
  });

  if (agendaView === "dia") {
    setDiaFocado(prev => {
      const nova = new Date(prev);
      nova.setDate(nova.getDate() + 1);
      return nova;
    });
  }
}


async function carregarAulasDoDia(
  agendaId: string,
  dataISO: string
): Promise<Aula[]> {
  const col = collection(db, "aulas");

  const q = query(
    col,
    where("agendaId", "==", agendaId),
    where("data", "==", dataISO)
  );

  const snap = await getDocs(q);
  const out: Aula[] = [];

  snap.forEach((docSnap) => {
    const d = docSnap.data() as any;
    out.push({
      ...(d as Aula),
      id: docSnap.id,
    });
  });

  return out;
}



async function carregarAgendasConfig() {
  try {
    setCarregandoAgendasConfig(true);
    const lista = await listAgendas();
    setAgendasConfig(lista);
  } catch (e) {
    console.error(e);
  } finally {
    setCarregandoAgendasConfig(false);
  }
}

useEffect(() => {
  carregarAgendasConfig();
}, []);


function voltarPeriodo() {
  setAgendaDataBase(prev => {
    const nova = new Date(prev);
    if (agendaView === "mes") {
      nova.setMonth(nova.getMonth() - 1);
    } else if (agendaView === "semana") {
      nova.setDate(nova.getDate() - 7);
    } else {
      // "dia"
      nova.setDate(nova.getDate() - 1);
    }
    return nova;
  });

  if (agendaView === "dia") {
    setDiaFocado(prev => {
      const nova = new Date(prev);
      nova.setDate(nova.getDate() - 1);
      return nova;
    });
  }
}


  function tituloAgenda() {
    const d = agendaDataBase;

    const dia = String(d.getDate()).padStart(2, "0");
    const mesTexto = d.toLocaleString("pt-BR", { month: "long" });
    const mesNum = String(d.getMonth() + 1).padStart(2, "0");
    const ano = d.getFullYear();

    if (agendaView === "mes") {
      return `${mesTexto.charAt(0).toUpperCase() + mesTexto.slice(1)} ${ano}`;
    }
    if (agendaView === "semana") {
      return `Semana de ${dia}/${mesNum}/${ano}`;
    }
    return `${dia}/${mesNum}/${ano}`;
  }

  // gera matriz de 6 semanas (42 dias) pro mês atual
  function gerarGradeMes(base: Date) {
    const ano = base.getFullYear();
    const mes = base.getMonth();
    const primeiroDia = new Date(ano, mes, 1);
    const startWeekday = primeiroDia.getDay(); // 0=Dom
    const inicioGrade = new Date(ano, mes, 1 - startWeekday);

    const semanas: Date[][] = [];
    let cursor = new Date(inicioGrade);

    for (let w = 0; w < 6; w++) {
      const semana: Date[] = [];
      for (let d = 0; d < 7; d++) {
        semana.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      semanas.push(semana);
    }

    return semanas;
  }

// Converte Date -> "YYYY-MM-DD"
function dataISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Todas as aulas de um dia específico
function aulasDoDiaBase(dia: Date, todas: Aula[]): Aula[] {
  const iso = dataISO(dia);
  return todas.filter((a) => a.data === iso && a.ativa !== false);
}

// Versão usada pelo BlocoAgenda (sem agenda ainda)
function aulasDoDia(dia: Date): Aula[] {
  return aulasDoDiaBase(dia, todasAulas);
}

// Ordena pelo horário de início
function aulasDoDiaOrdenadas(dia: Date): Aula[] {
  return [...aulasDoDia(dia)].sort((a, b) => {
    const hA = a.horaInicio || "00:00";
    const hB = b.horaInicio || "00:00";
    return hA.localeCompare(hB);
  });
}

  function gerarSemana(base: Date) {
    const inicio = new Date(base);
    const day = inicio.getDay(); // 0 = Dom
    inicio.setDate(inicio.getDate() - day);

    const dias: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      dias.push(d);
    }
    return dias;
  }

  function gerarSlotsHorario(inicioHora = 6, fimHora = 22) {
    const slots: string[] = [];
    for (let h = inicioHora; h <= fimHora; h++) {
      const hh = String(h).padStart(2, "0");
      slots.push(`${hh}:00`);
    }
    return slots;
  }



function corDoProfessor(profId?: string) {
  if (!profId) return "#9ca3af"; // cinza se faltar

  // hash bobo do id -> número
  let hash = 0;
  for (let i = 0; i < profId.length; i++) {
    hash = (hash * 31 + profId.charCodeAt(i)) % 360;
  }

  // usamos HSL pra ter cores diferentes no círculo
  return `hsl(${hash}deg 70% 85%)`; // fundo claro
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0; // >>>0 mantém positivo
  }
  return hash;
}


function getProfessorColor(profNameOrId: string | undefined) {
  // se não veio nada, usa fallback azul (primeira cor da paleta só pra não quebrar)
  if (!profNameOrId || profNameOrId.trim() === "") {
    return PALETA_PROFESSOR[0];
  }

  const h = hashString(profNameOrId.toLowerCase().trim());
  const idx = h % PALETA_PROFESSOR.length;
  return PALETA_PROFESSOR[idx];
}

useEffect(() => {
  async function carregarNome() {
    if (typeof window === "undefined") return;

    const tipo = localStorage.getItem("nexquadraPerfilTipo");
    const id = localStorage.getItem("nexquadraPerfilId");

    if (!tipo || !id) return;

    let collectionName = "responsaveis";
    if (tipo === "gestor") collectionName = "users";
    else if (tipo === "colaborador") collectionName = "professores";

    const snap = await getDoc(doc(db, collectionName, id));
    if (snap.exists()) {
      setNomeUsuario(snap.data().nome || "");
    }
  }

  carregarNome();
}, []);


useEffect(() => {
  async function carregarProfessores() {
    const snapProf = await getDocs(collection(db, "professores"));
    const listaProfs: Professor[] = [];
    snapProf.forEach((docSnap) => {
      const d = docSnap.data() as DocumentData;
      listaProfs.push({
        id: docSnap.id,
        nome: d.nome ?? "",
        telefone: d.telefone ?? "",
        email: d.email ?? "",
        ativo: d.ativo !== false,
      });
    });
    setProfessores(listaProfs);
  }

  carregarProfessores();
}, []);

useEffect(() => {
  async function carregarAgendasConfig() {
    try {
      setCarregandoAgendas(true);
      const lista = await listAgendas();
      setAgendasConfig(lista);
    } catch (e) {
      console.error("Erro ao carregar agendasConfig:", e);
    } finally {
      setCarregandoAgendas(false);
    }
  }

  carregarAgendasConfig();
}, []);

useEffect(() => {
  // define agenda padrão (primeira da lista) se ainda não tiver uma selecionada
  if (!agendaSelecionadaId && agendasConfig.length > 0) {
    setAgendaSelecionadaId(agendasConfig[0].id);
  }
}, [agendasConfig, agendaSelecionadaId]);

useEffect(() => {
  async function carregar() {
    try {
      const lista = await listAgendas();
      setAgendasConfig(lista);
    } catch (e) {
      console.error("Erro ao carregar agendas:", e);
    }
  }
  carregar();
}, []);

useEffect(() => {
  async function carregarAgendasConfig() {
    try {
      setCarregandoAgendasConfig(true);
      const lista = await listAgendas();
      setAgendasConfig(lista);
    } catch (e) {
      console.error("Erro ao carregar agendasConfig:", e);
    } finally {
      setCarregandoAgendasConfig(false);
    }
  }

  carregarAgendasConfig();
}, []);


useEffect(() => {
  // se estiver no card de Aulas → queremos agendas tipo "aulas" ou "hibrida"
  // se estiver no card de Reservas → "reservas" ou "hibrida"
  const tipoView = abaSelecionada === "reservasQuadra" ? "reservas" : "aulas";

  const candidatas = agendasConfig.filter((a) => {
    if (a.ativo === false) return false;
    if (tipoView === "aulas") {
      return a.tipo === "aulas" || a.tipo === "hibrida";
    }
    // reservasQuadra
    return a.tipo === "reservas" || a.tipo === "hibrida";
  });

  if (!candidatas.length) {
    setAgendaSelecionadaId(null);
    return;
  }

  setAgendaSelecionadaId((prev) => {
    if (prev && candidatas.some((a) => a.id === prev)) return prev;
    return candidatas[0].id; // primeira ativa do tipo certo
  });
}, [abaSelecionada, agendasConfig]);


useEffect(() => {
  async function carregarModalidades() {
    // lazy import para evitar peso no bundle inicial
    const { listModalidades } = await import("../admin/modalidades/service");
    const items = await listModalidades();
    setModalidades(items);
  }
  carregarModalidades();
}, []);


async function garantirRecorrenciaAdiante(aulaBase: Aula) {
  // Cast para acessar campos extras que não estão no tipo Aula
  const base: any = aulaBase;

  // se não for recorrente ou não tiver repetirId, não faz nada
  if (!base.recorrente || !base.repetirId) return;

  const semanasJanela: number =
    base.repetirJanelaSemanas && base.repetirJanelaSemanas > 0
      ? base.repetirJanelaSemanas
      : 12;

  const hoje = new Date();
  const limite = new Date();
  limite.setDate(limite.getDate() + semanasJanela * 7);
  const limiteISO = toISODate(limite);

  // 🔹 Busca todas as aulas dessa recorrência
  const q = query(
    collection(db, "aulas"),
    where("repetirId", "==", base.repetirId)
  );
  const snap = await getDocs(q);

  if (snap.empty) return;

  // maior data já criada nessa recorrência
  let maxData: string = base.data;
  snap.forEach((docSnap) => {
    const d = (docSnap.data() as any).data;
    if (d && d > maxData) {
      maxData = d;
    }
  });

  // se já temos aula até depois do limite, não precisa criar nada
  if (maxData >= limiteISO) return;

  // começa a partir da semana seguinte à última data
  let proxData = addDaysISO(maxData, 7);

  while (proxData <= limiteISO) {
    const agoraISO = new Date().toISOString();

    const novaAula: any = {
      ...base,
      data: proxData,

      // zera campos que você NÃO quer copiar
      atividadeFonte: "manual",
      atividadePlanoId: "",
      atividadeTitulo: "",
      atividadeTexto: "",
      observacao: "",

      criadoEm: agoraISO,
      atualizadoEm: agoraISO,
    };

    delete novaAula.id; // Firestore vai gerar um novo id

    await addDoc(collection(db, "aulas"), novaAula);

    proxData = addDaysISO(proxData, 7);
  }
}


useEffect(() => {
  async function expandirRecorrencias() {
    // supondo que você tenha um estado `aulasHoje` ou `aulas`
    const lista = aulasHoje || [];

for (const aula of aulasHoje) {
  const aAny = aula as any;
  if (aAny.recorrente && aAny.repetirId) {
    await garantirRecorrenciaAdiante(aula);
  }
}

  }

  if (aulasHoje && aulasHoje.length > 0) {
    expandirRecorrencias();
  }
}, [aulasHoje]);


function resolveColorDaAula(aula: Aula) {
  // FUTURO: se um dia aula.professores for array
  // if (Array.isArray(aula.professores) && aula.professores.length > 1) {
  //   return {
  //     bg: "bg-gray-200",
  //     border: "border-gray-500",
  //     textMain: "text-gray-900",
  //     textSub: "text-gray-700",
  //   };
  // }

  // HOJE: usa professorNome ou professorId único
  const nomeOuId =
    (aula.professorNome && aula.professorNome.trim() !== ""
      ? aula.professorNome
      : aula.professorId) || "professor";

  return getProfessorColor(nomeOuId);
}


  const familiaSelecionada: Familia | null = (() => {
    if (!responsavelSelecionadoId) return null;
    return (
      familias.find(
        (f) => f.responsavel.id === responsavelSelecionadoId
      ) || null
    );
  })();

  const responsavelDoAlunoEditando = (() => {
    if (!editAluno) return null;
    const fam = familias.find(
      (f) => f.responsavel.id === editAluno.responsavelId
    );
    return fam ? fam.responsavel : null;
  })();

  function responsavelEstaAtivoDoAluno(aluno: Aluno): boolean {
    const fam = familias.find(
      (f) => f.responsavel.id === aluno.responsavelId
    );
    if (!fam) return false;
    return fam.responsavel.ativo === true;
  }

  const resumoModalidadesAtivos = (() => {
    const resumoAlunos = (() => {
    const ativos = alunos.filter(a => a.status === "ativo").length;
    const inativos = alunos.filter(a => a.status === "inativo").length;
    return `Ativos: ${ativos} / Inativos: ${inativos}`;
    })();
    const mapa: Record<string, number> = {};

    alunos
      .filter((a) => a.status === "ativo")
  
    return Object.entries(mapa)
      .map(([mod, qtd]) => `${mod}: ${qtd}`)
      .join(" / ");
  })();


  // -------------------- Auth + carregamento inicial --------------------
 useEffect(() => {
  const unsub = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      router.replace("/login");
      return;
    }

    setEmailUsuario(user.email ?? "");

    try {
      await carregarDados(); // agora protegido por try/catch
      setCarregando(false);
    } catch (err: any) {
      console.error("Erro ao carregar dados:", err);
      setErroFirestore(err?.message || "Erro ao carregar dados.");
      setCarregando(false);
    }
  });

  return () => unsub();
}, [router]);


  // -------------------- Carregar dados do Firestore --------------------
  async function carregarDados() {
    // ALUNOS
    const snapAlunos = await getDocs(collection(db, "alunos"));
    const listaAlunos: Aluno[] = [];
    snapAlunos.forEach((docSnap) => {
      const data = docSnap.data() as DocumentData;
      listaAlunos.push({
        id: docSnap.id,
        nome: data.nome,
        status: data.status ?? "ativo",
        responsavelId: data.responsavelId,

        telefone: data.telefone || "",
        cpf: data.cpf || "",
        email: data.email || "",
        nascimento: data.nascimento || "",

        cep: data.cep || "",
        endereco: data.endereco || "",
        numero: data.numero || "",
        complemento: data.complemento || "",

        observacoes: data.observacoes || "",
      });
    });
    setAlunos(listaAlunos);

    // AULAS
    const snapAulas = await getDocs(collection(db, "aulas"));
    const listaAulas: Aula[] = [];
snapAulas.forEach((docSnap) => {
  const data = docSnap.data() as DocumentData;
  listaAulas.push({
    id: docSnap.id,
    data: data.data ?? "",
    horaInicio: data.horaInicio ?? "",
    horaFim: data.horaFim ?? "",

    professorId: data.professorId ?? data.professor ?? "",
    professorNome: data.professorNome ?? "",

    localId: data.localId ?? data.local ?? "",
    localNome: data.localNome ?? "",

    referenciaTipo: (data.referenciaTipo ?? "aula") as "aula" | "outro",

    // cobrança
    tipoId: data.tipoId ?? "",
    tipoNome: data.tipoNome ?? data.tipoCobranca ?? "",
    tipoCobranca: data.tipoCobranca ?? "",
    valorPrevisto:
      typeof data.valorPrevisto === "number"
        ? data.valorPrevisto
        : data.valorId
        ? parseFloat(String(data.valorId).replace(",", "."))
        : 0,

    atividadeTexto:
      data.atividadeTexto ??
      data.atividadeId ??
      data.turma ??
      "",
    atividadeFonte: data.atividadeFonte ?? "manual",

    alunosIds: Array.isArray(data.alunosIds)
      ? data.alunosIds
      : [],
    alunosNomes: Array.isArray(data.alunosNomes)
      ? data.alunosNomes
      : Array.isArray(data.alunos)
      ? data.alunos
      : data.alunoId
      ? [data.alunoId]
      : [],

    repetirId: data.repetirId ?? "",

    criadoEm: data.criadoEm ?? "",
    atualizadoEm: data.atualizadoEm ?? "",
  });
});
setAulasHoje(listaAulas);

    // RESPONSÁVEIS
    const snapResp = await getDocs(collection(db, "responsaveis"));
    const familiasTemp: Familia[] = [];

    snapResp.forEach((docSnap) => {
      const data = docSnap.data() as DocumentData;

      const respObj: Responsavel = {
        id: docSnap.id,
        nome: data.nome ?? "",
        email: data.email ?? "",
        cpf: data.cpf ?? "",
        endereco: data.endereco ?? "",
        numero: data.numero ?? "",
        complemento: data.complemento ?? "",
        telefone: data.telefone ?? "",
        alunosIds: Array.isArray(data.alunosIds) ? data.alunosIds : [],
        ativo: data.ativo ?? true,
      };

      const alunosDaFamilia = listaAlunos.filter(
        (aluno) => aluno.responsavelId === docSnap.id
      );

      familiasTemp.push({
        responsavel: respObj,
        alunos: alunosDaFamilia,
      });
    });

    setFamilias(familiasTemp);

    if (responsavelSelecionadoId) {
      const famSel = familiasTemp.find(
        (f) => f.responsavel.id === responsavelSelecionadoId
      );
      if (famSel) {
        setEditEmail(famSel.responsavel.email || "");
        setEditTelefone(famSel.responsavel.telefone || "");
        setEditEndereco(famSel.responsavel.endereco || "");
      } else {
        setResponsavelSelecionadoId(null);
        setEditando(false);
      }
    }
  }

 
  // -------------------- Ações gerais --------------------
  async function sair() {
    await signOut(auth);
    router.push("/login");
  }

  async function alternarStatusAluno(
    aluno: Aluno,
    novoStatus: "ativo" | "inativo"
  ) {
    if (novoStatus === "ativo") {
      if (!responsavelEstaAtivoDoAluno(aluno)) {
        alert(
          "Não é possível ativar este aluno porque o responsável está INATIVO."
        );
        return;
      }
    }

    try {
      await updateDoc(fsDoc(db, "alunos", aluno.id), {
        status: novoStatus,
      });

      setAlunos((prev) =>
        prev.map((a) =>
          a.id === aluno.id ? { ...a, status: novoStatus } : a
        )
      );

      setFamilias((prev) =>
        prev.map((f) => ({
          ...f,
          alunos: f.alunos.map((a) =>
            a.id === aluno.id ? { ...a, status: novoStatus } : a
          ),
        }))
      );
    } catch (e) {
      console.error("Erro ao alterar status do aluno:", e);
    }
  }

  async function alternarStatusResponsavel(
    familia: Familia,
    novoStatusResponsavel: boolean
  ) {
    const resp = familia.responsavel;

    if (novoStatusResponsavel === true) {
      const candidatos = familia.alunos.filter(
        (al) => al.status !== "ativo"
      );

      if (candidatos.length === 0) {
        alert(
          "Não é possível ativar este responsável: não há alunos para ativar."
        );
        return;
      }

      const listaNomes = candidatos
        .map((al, idx) => `${idx + 1} - ${al.nome}`)
        .join("\n");

      const escolha = window.prompt(
        "Qual aluno você quer ativar para reativar este responsável?\n\n" +
          listaNomes +
          "\n\nDigite o número do aluno:"
      );
      if (!escolha) return;

      const idxEscolhido = parseInt(escolha.trim(), 10) - 1;
      const alunoEscolhido = candidatos[idxEscolhido];
      if (!alunoEscolhido) {
        alert("Opção inválida. Operação cancelada.");
        return;
      }

      try {
        await updateDoc(fsDoc(db, "alunos", alunoEscolhido.id), {
          status: "ativo",
        });

        await updateDoc(fsDoc(db, "responsaveis", resp.id), {
          ativo: true,
        });

        setAlunos((prev) =>
          prev.map((a) =>
            a.id === alunoEscolhido.id
              ? { ...a, status: "ativo" }
              : a
          )
        );

        setFamilias((prev) =>
          prev.map((f) => {
            if (f.responsavel.id !== resp.id) return f;
            return {
              ...f,
              responsavel: { ...f.responsavel, ativo: true },
              alunos: f.alunos.map((al) =>
                al.id === alunoEscolhido.id
                  ? { ...al, status: "ativo" }
                  : al
              ),
            };
          })
        );
      } catch (e) {
        console.error("Erro ao reativar responsável:", e);
        alert("Erro ao reativar. Tente novamente.");
      }

      return;
    }

    try {
      await updateDoc(fsDoc(db, "responsaveis", resp.id), {
        ativo: false,
      });

      for (const aluno of familia.alunos) {
        await updateDoc(fsDoc(db, "alunos", aluno.id), {
          status: "inativo",
        });
      }

      setAlunos((prev) =>
        prev.map((a) =>
          a.responsavelId === resp.id
            ? { ...a, status: "inativo" }
            : a
        )
      );

      setFamilias((prev) =>
        prev.map((f) =>
          f.responsavel.id === resp.id
            ? {
                ...f,
                responsavel: { ...f.responsavel, ativo: false },
                alunos: f.alunos.map((al) => ({
                  ...al,
                  status: "inativo",
                })),
              }
            : f
        )
      );
    } catch (e) {
      console.error("Erro ao inativar responsável:", e);
      alert("Erro ao inativar. Tente novamente.");
    }
  }

  async function salvarEdicaoResponsavel(familia: Familia) {
    const resp = familia.responsavel;
    try {
      await updateDoc(fsDoc(db, "responsaveis", resp.id), {
        email: editEmail,
        telefone: editTelefone,
        endereco: editEndereco,
      });

      setFamilias((prev) =>
        prev.map((f) =>
          f.responsavel.id === resp.id
            ? {
                ...f,
                responsavel: {
                  ...f.responsavel,
                  email: editEmail,
                  telefone: editTelefone,
                  endereco: editEndereco,
                },
              }
            : f
        )
      );

      setEditando(false);
    } catch (e) {
      console.error("Erro ao salvar edição do responsável:", e);
      alert("Não foi possível salvar as alterações.");
    }
  }

async function deletarFamilia(familia: Familia) {
  const confirmar = window.confirm(
    "Tem certeza? Isso vai apagar o responsável e TODOS os alunos relacionados. Essa ação não pode ser desfeita."
  );
  if (!confirmar) return;

  try {
    // 1) Apaga TODOS os alunos vinculados (continua no client mesmo)
    for (const aluno of familia.alunos) {
      await deleteDoc(fsDoc(db, "alunos", aluno.id));
    }

    // 2) Apaga o responsável + índices + Auth via API ADMIN
    const resp = await fetch(
  `/api/admin/responsaveis/${familia.responsavel.id}`,
  { method: "DELETE" }
);


    if (!resp.ok) {
      let msg = "Erro ao excluir o responsável.";
      try {
        const data = await resp.json();
        if (data?.error) msg = data.error;
      } catch {
        /* resposta não era JSON, mantém msg padrão */
      }
      throw new Error(msg);
    }

    // 3) Atualiza estado local (UI) depois que deu tudo certo
    setAlunos((prev) =>
      prev.filter((a) => a.responsavelId !== familia.responsavel.id)
    );

    setFamilias((prev) =>
      prev.filter((f) => f.responsavel.id !== familia.responsavel.id)
    );

    if (responsavelSelecionadoId === familia.responsavel.id) {
      setResponsavelSelecionadoId(null);
      setEditando(false);
    }
  } catch (e: any) {
    console.error("Erro ao deletar família:", e);
    alert(e?.message || "Erro ao deletar. Tente novamente.");
  }
}

function abrirEdicaoAluno(aluno: Aluno) {
  setEditAluno({ ...aluno });
  setErroAluno("");
}

function fecharEdicaoAluno() {
  setEditAluno(null);
  setErroAluno("");
  setSalvandoAluno(false);
}

function setCampoAluno<K extends keyof Aluno>(campo: K, valor: Aluno[K]) {
  setEditAluno((prev) => (prev ? { ...prev, [campo]: valor } : prev));
}

async function salvarAlunoEditado() {
  if (!editAluno) return;

  if (!editAluno.nome?.trim()) {
    setErroAluno("O nome do aluno é obrigatório.");
    return;
  }

  if (editAluno.status === "ativo") {
    const podeAtivar = responsavelEstaAtivoDoAluno(editAluno);
    if (!podeAtivar) {
      setErroAluno(
        "Não é possível marcar este aluno como ATIVO porque o responsável está INATIVO."
      );
      return;
    }
  }

  try {
    setSalvandoAluno(true);
    setErroAluno("");

    const { id, ...payload } = editAluno;

    await updateDoc(fsDoc(db, "alunos", id), payload);

    // atualiza alunos
    setAlunos((prev: Aluno[]) => prev.map((a) => (a.id === id ? editAluno : a)));

    // atualiza famílias
    setFamilias((prev: any[]) =>
      prev.map((f) => ({
        ...f,
        alunos: (f.alunos || []).map((a: Aluno) =>
          a.id === id ? editAluno : a
        ),
      }))
    );

    fecharEdicaoAluno();
  } catch (err) {
    console.error(err);
    setErroAluno("Erro ao salvar alterações do aluno.");
  } finally {
    setSalvandoAluno(false);
  }
}

async function buscarEnderecoPorCepAluno() {
  try {
    const cep = (editAluno?.cep || "").replace(/\D/g, "");
    if (!cep || cep.length !== 8) return;

    const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await resp.json();

    if (data?.erro) return;

    const enderecoFormatado = `${data.logradouro || ""}${data.bairro ? `, ${data.bairro}` : ""}${data.localidade ? `, ${data.localidade}` : ""}${data.uf ? ` - ${data.uf}` : ""}`.trim();

    setCampoAluno("endereco", enderecoFormatado);
  } catch (e) {
    // opcional: console.log(e)
  }
}


type ModoExclusaoRecorrente = "so-esta" | "esta-e-futuras";

// ---------- excluir aula (com recorrência) ----------
async function excluirAula(aula: Aula, modoRecorrente?: ModoExclusaoRecorrente) {
  console.log("🔥 excluirAula chamada no painel com:", {
    id: aula.id,
    data: aula.data,
    repetirId: (aula as any)?.repetirId,
    modoRecorrente,
  });

  if (!aula?.id) {
    console.error("Sem ID da aula para excluir");
    alert("Erro interno: aula sem ID.");
    return;
  }

  const repetirIdOriginal = (aula as any)?.repetirId || "";
  const dataAulaAtual = aula.data as string | undefined; // "YYYY-MM-DD"

  try {
    // 📌 CASO 1: aula NÃO recorrente
    if (!repetirIdOriginal) {
      console.log("🧹 Exclusão simples (não recorrente)");

      await deleteDoc(fsDoc(db, "aulas", aula.id));

      // Atualiza estado local de hoje
      setAulasHoje((prev) => prev.filter((a) => a.id !== aula.id));

      // Se tiver estado global de todas as aulas, pode atualizar aqui também:
      // setTodasAulas((prev) => prev.filter((a) => a.id !== aula.id));

      setAulaSelecionadaDetalhe(null);

     // 🔄 Refresh geral da página
if (typeof window !== "undefined") {
  window.location.reload();
}

      console.log("✅ Aula simples excluída:", aula.id);
      return;
    }

    // 📌 CASO 2: aula RECORRENTE → precisa do modoRecorrente
    if (!modoRecorrente) {
      console.warn(
        "Aula recorrente, mas nenhum modoRecorrente foi passado. Nada será excluído."
      );
      return;
    }

    if (modoRecorrente === "so-esta") {
      console.log("🧹 Exclusão recorrente: SOMENTE esta aula");

      await deleteDoc(fsDoc(db, "aulas", aula.id));

      setAulasHoje((prev) => prev.filter((a) => a.id !== aula.id));
      // setTodasAulas((prev) => prev.filter((a) => a.id !== aula.id));

      setAulaSelecionadaDetalhe(null);
// 🔄 Refresh geral da página
if (typeof window !== "undefined") {
  window.location.reload();
}

      console.log("✅ Aula recorrente (apenas esta) excluída:", aula.id);
      return;
    }

    console.log(
      "🔁 Exclusão recorrente: ESTA aula e TODAS as FUTURAS",
      repetirIdOriginal,
      "a partir de",
      dataAulaAtual
    );

    // 1) Busca todas as aulas com o mesmo repetirId
    const qAulas = query(
      collection(db, "aulas"),
      where("repetirId", "==", repetirIdOriginal)
    );
    const snap = await getDocs(qAulas);

    console.log("📦 Aulas retornadas pela query de recorrência:", snap.size);

    const idsExcluidos: string[] = [];

    // 2) Filtra em memória apenas as com data >= data da aula atual
    const docsParaExcluir = snap.docs.filter((docSnap) => {
      const d = docSnap.data() as any;
      const dataDoc = d.data as string | undefined; // "YYYY-MM-DD"
      if (!dataDoc) return false;

      if (dataAulaAtual) {
        return dataDoc >= dataAulaAtual;
      }
      // se por algum motivo a aula atual não tiver data, exclui todas do repetirId
      return true;
    });

    console.log(
      "🧾 Aulas que serão excluídas (recorrência):",
      docsParaExcluir.length
    );

    // 3) Deleta todas
    await Promise.all(
      docsParaExcluir.map(async (docSnap) => {
        await deleteDoc(fsDoc(db, "aulas", docSnap.id));
        idsExcluidos.push(docSnap.id);
      })
    );

    // 4) Atualiza estados locais
    if (idsExcluidos.length > 0) {
      setAulasHoje((prev) => prev.filter((a) => !idsExcluidos.includes(a.id)));
      // setTodasAulas((prev) => prev.filter((a) => !idsExcluidos.includes(a.id)));
    }

    setAulaSelecionadaDetalhe(null);
// 🔄 Refresh geral da página
if (typeof window !== "undefined") {
  window.location.reload();
}

    console.log("✅ Aulas recorrentes excluídas (IDs):", idsExcluidos);
  } catch (err) {
    console.error("Erro ao excluir aula(s):", err);
    alert("Erro ao excluir aula(s). Veja o console para mais detalhes.");
  }
}


// Abrir criar aula
function criarAulaNoDiaHora(dia: Date, hora?: string) {
  setAulaSelecionadaDetalhe(null);
  setModoAulaForm("novo");
  setAulaSelecionada(null);
  setDiaDefault(dia);
  setHoraDefault(hora);
  setShowAulaForm(true);
}

// Abrir edição de aula
function editarAula(aula: Aula) {
  setModoAulaForm("editar");
  setAulaSelecionada(aula);
  setDiaDefault(null);
  setHoraDefault(undefined);
  setShowAulaForm(true);
}


// Excluir aluno
async function deletarAluno(aluno: Aluno) {
  const confirmar = window.confirm(
    `Tem certeza que deseja excluir o aluno "${aluno.nome}"? Essa ação não pode ser desfeita.`
  );
  if (!confirmar) return;

  try {
    // apaga do Firestore
    await deleteDoc(fsDoc(db, "alunos", aluno.id));

    // tira da lista geral de alunos
    setAlunos((prev) => prev.filter((a) => a.id !== aluno.id));

    // tira esse aluno da lista interna de cada família
    setFamilias((prev) =>
      prev.map((f) => ({
        ...f,
        alunos: f.alunos.filter((a) => a.id !== aluno.id),
      }))
    );

    // se o modal de edição desse aluno estiver aberto, fecha
    if (editAluno && editAluno.id === aluno.id) {
      fecharEdicaoAluno();
    }
  } catch (err) {
    console.error(err);
    alert("Erro ao deletar aluno.");
  }
}

  // -------------------- BLOCO ALUNOS --------------------
 function BlocoAlunos() {
  const alunosOrdenados = [...alunosFiltrados].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
  );

  const ativos = alunosOrdenados.filter((a) => a.status === "ativo");
  const inativos = alunosOrdenados.filter((a) => a.status === "inativo");

  return (
    <section className="bg-white rounded-2xl shadow p-4 space-y-6">
      {/* cabeçalho com botão */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Alunos ({alunos.length} total)
        </h2>

        <button
          onClick={() => setShowNovoAluno(true)}
          className="inline-flex items-center gap-2 text-sm border border-gray-300 rounded-xl px-4 py-2 hover:bg-gray-100 font-medium"
        >
          + Novo Aluno
        </button>
      </div>

      {/* ... resto do BlocoAlunos (ATIVOS / INATIVOS) exatamente como está ... */}


      {/* ATIVOS */}
      <div>
        <h3 className="text-sm font-semibold text-green-700 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
          Ativos ({ativos.length})
        </h3>

        {ativos.length === 0 ? (
          <p className="text-sm text-gray-500 mt-2">Nenhum aluno ativo.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {ativos.map((aluno) => {
              const aberto = alunoAbertoId === aluno.id;
              return (
                <li
                  key={aluno.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition cursor-pointer"
                  onClick={() => {
                    setAlunoAbertoId((prev) =>
                      prev === aluno.id ? null : aluno.id
                    );
                  }}
                >
                  {/* resumo visível sempre */}
                  <div className="text-sm">
                    <div className="font-semibold text-gray-900">
                      {aluno.nome}
                    </div>

                    <div className="text-xs text-gray-600">
                      Telefone:{" "}
                      {aluno.telefone && aluno.telefone.trim() !== ""
                        ? aluno.telefone
                        : "-"}
                    </div>

                   

                    <div className="text-xs text-gray-600">
                      Obs:{" "}
                      {aluno.observacoes &&
                      aluno.observacoes.trim() !== ""
                        ? aluno.observacoes
                        : "-"}
                    </div>
                  </div>

                  {/* detalhes quando aberto */}
                  {aberto && (
                    <div className="mt-4 border-t pt-4 text-xs text-gray-700 space-y-3">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <div className="text-[11px] text-gray-500 uppercase font-semibold">CPF</div>
                          <div className="text-gray-800">
                            {aluno.cpf && aluno.cpf.trim() !== "" ? aluno.cpf : "-"}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-gray-500 uppercase font-semibold">Email</div>
                          <div className="text-gray-800">
                            {aluno.email && aluno.email.trim() !== "" ? aluno.email : "-"}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-gray-500 uppercase font-semibold">Nascimento</div>
                          <div className="text-gray-800">
                            {aluno.nascimento && aluno.nascimento !== "" ? aluno.nascimento : "-"}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-gray-500 uppercase font-semibold">CEP</div>
                          <div className="text-gray-800">
                            {aluno.cep && aluno.cep.trim() !== "" ? aluno.cep : "-"}
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <div className="text-[11px] text-gray-500 uppercase font-semibold">Endereço</div>
                          <div className="text-gray-800">
                            {aluno.endereco && aluno.endereco.trim() !== "" ? aluno.endereco : "-"}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-gray-500 uppercase font-semibold">Número</div>
                          <div className="text-gray-800">
                            {aluno.numero && String(aluno.numero).trim() !== "" ? String(aluno.numero) : "-"}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-gray-500 uppercase font-semibold">Complemento</div>
                          <div className="text-gray-800">
                            {aluno.complemento && aluno.complemento.trim() !== "" ? aluno.complemento : "-"}
                          </div>
                        </div>
                    </div>

                      {/* ações */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex flex-row gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              abrirEdicaoAluno(aluno);
                            }}
                            className="text-[10px] px-2 py-1 rounded-lg bg-black text-white hover:bg-gray-800 uppercase tracking-wide"
                          >
                            EDITAR
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deletarAluno(aluno);
                            }}
                            className="text-[10px] px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 uppercase tracking-wide"
                          >
                            DELETAR
                          </button>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            alternarStatusAluno(aluno, "inativo");
                          }}
                          className="text-[10px] px-2 py-1 rounded-lg bg-green-100 text-green-700 uppercase tracking-wide w-fit hover:bg-green-200"
                        >
                          ATIVO (clique p/ inativar)
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* INATIVOS */}
      <div>
        <h3 className="text-sm font-semibold text-gray-600 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-gray-400"></span>
          Inativos ({inativos.length})
        </h3>

        {inativos.length === 0 ? (
          <p className="text-sm text-gray-500 mt-2">
            Nenhum aluno inativo.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {inativos.map((aluno) => {
              const aberto = alunoAbertoId === aluno.id;
              const podeAtivar = responsavelEstaAtivoDoAluno(aluno);

              return (
                <li
                  key={aluno.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition cursor-pointer"
                  onClick={() => {
                    setAlunoAbertoId((prev) =>
                      prev === aluno.id ? null : aluno.id
                    );
                  }}
                >
                  <div className="text-sm">
                    <div className="font-semibold text-gray-900">
                      {aluno.nome}
                    </div>

                    <div className="text-xs text-gray-600">
                      Telefone:{" "}
                      {aluno.telefone && aluno.telefone.trim() !== ""
                        ? aluno.telefone
                        : "-"}
                    </div>

                    <div className="text-xs text-gray-600">
                      Obs:{" "}
                      {aluno.observacoes &&
                      aluno.observacoes.trim() !== ""
                        ? aluno.observacoes
                        : "-"}
                    </div>
                  </div>
                  {/* detalhes quando aberto */}
                  {aberto && (
                    <div className="mt-4 border-t pt-4 text-xs text-gray-700 space-y-3">
                      <div className="grid sm:grid-cols-2 gap-3">

                      <div>
                          <div className="text-[11px] text-gray-500 uppercase font-semibold">CPF</div>
                          <div className="text-gray-800">
                            {aluno.cpf && aluno.cpf.trim() !== "" ? aluno.cpf : "-"}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-gray-500 uppercase font-semibold">Email</div>
                          <div className="text-gray-800">
                            {aluno.email && aluno.email.trim() !== "" ? aluno.email : "-"}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-gray-500 uppercase font-semibold">Nascimento</div>
                          <div className="text-gray-800">
                            {aluno.nascimento && aluno.nascimento !== "" ? aluno.nascimento : "-"}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-gray-500 uppercase font-semibold">CEP</div>
                          <div className="text-gray-800">
                            {aluno.cep && aluno.cep.trim() !== "" ? aluno.cep : "-"}
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <div className="text-[11px] text-gray-500 uppercase font-semibold">Endereço</div>
                          <div className="text-gray-800">
                            {aluno.endereco && aluno.endereco.trim() !== "" ? aluno.endereco : "-"}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-gray-500 uppercase font-semibold">Número</div>
                          <div className="text-gray-800">
                            {aluno.numero && String(aluno.numero).trim() !== "" ? String(aluno.numero) : "-"}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-gray-500 uppercase font-semibold">Complemento</div>
                          <div className="text-gray-800">
                            {aluno.complemento && aluno.complemento.trim() !== "" ? aluno.complemento : "-"}
                          </div>
                        </div>

                    </div>

                     {/* ações */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex flex-row gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              abrirEdicaoAluno(aluno);
                            }}
                            className="text-[10px] px-2 py-1 rounded-lg bg-black text-white hover:bg-gray-800 uppercase tracking-wide"
                          >
                            EDITAR
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deletarAluno(aluno);
                            }}
                            className="text-[10px] px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 uppercase tracking-wide"
                          >
                            DELETAR
                          </button>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!podeAtivar) {
                              alert("Não é possível ativar este aluno porque o responsável está INATIVO.");
                              return;
                            }
                            alternarStatusAluno(aluno, "ativo");
                          }}
                          className={`text-[10px] px-2 py-1 rounded-lg uppercase tracking-wide w-fit ${
                            podeAtivar
                              ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                              : "bg-gray-100 text-gray-400 cursor-not-allowed"
                          }`}
                        >
                          INATIVO (clique p/ ativar)
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

//------

{erroFirestore && (
  <div className="bg-red-100 border border-red-300 text-red-700 text-sm rounded-xl p-3">
    ⚠️ Erro ao carregar dados: {erroFirestore}
  </div>
)}



// -------------------- MODAL DETALHE AULA --------------------
type ModalDetalheAulaProps = {
  aula: Aula;
  onFechar: () => void;
  onEditar: () => void;
  onExcluir: () => void;
};




// paleta de cores disponíveis pros professores, em loop
const PALETA_PROFESSOR = [
  {
    bg: "bg-green-100",
    border: "border-green-500",
    textMain: "text-green-900",
    textSub: "text-green-700",
  },
  {
    bg: "bg-red-100",
    border: "border-red-500",
    textMain: "text-red-900",
    textSub: "text-red-700",
  },
  {
    bg: "bg-blue-100",
    border: "border-blue-500",
    textMain: "text-blue-900",
    textSub: "text-blue-700",
  },
  {
    bg: "bg-yellow-100",
    border: "border-yellow-500",
    textMain: "text-yellow-900",
    textSub: "text-yellow-700",
  },
  {
    bg: "bg-purple-100",
    border: "border-purple-500",
    textMain: "text-purple-900",
    textSub: "text-purple-700",
  },
  {
    bg: "bg-pink-100",
    border: "border-pink-500",
    textMain: "text-pink-900",
    textSub: "text-pink-700",
  },
  {
    bg: "bg-orange-100",
    border: "border-orange-500",
    textMain: "text-orange-900",
    textSub: "text-orange-700",
  },
];

// -------------------- BLOCO AGENDA --------------------
type BlocoAgendaProps = {
  tipo: AgendaTipo; // "aulas" | "reservas"
  agendasConfig: AgendaConfig[];
  carregandoAgendasConfig: boolean;
  agendaSelecionadaId: string | null;
  setAgendaSelecionadaId: (id: string | null) => void;
  onOpenGerenciarAgendas: () => void;
};


// helper: converte "HH:MM" em minutos
function timeToMinutes(hhmm: string | undefined | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// helper genérico: gera slots entre dois minutos com um step
function gerarSlotsPorRange(
  minInicio: number,
  minFim: number,
  stepMin: number
): string[] {
  const out: string[] = [];
  for (let t = minInicio; t < minFim; t += stepMin) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return out;
}

// tipo local só pra facilitar o uso de diasDetalhados
type DiaDetalhadoConfig = {
  ativo: boolean;
  inicio: string;
  fim: string;
  intervaloMinutos: number;
};

// 🔹 pega config detalhada de UM dia da semana para a agenda
// dow: 0=Dom ... 6=Sáb
function getDiaDetalhado(
  agenda: AgendaConfig,
  dow: number
): DiaDetalhadoConfig | null {
  const detalhados = (agenda.diasDetalhados || []) as DiaDetalhadoConfig[];

  // se já tiver estrutura nova por dia (7 posições, 0..6)
  if (Array.isArray(detalhados) && detalhados.length === 7) {
    const d = detalhados[dow];
    if (!d || d.ativo === false) return null;

    return {
      ativo: true,
      inicio: d.inicio || agenda.horaInicio || "08:00",
      fim: d.fim || agenda.horaFim || "22:00",
      intervaloMinutos: d.intervaloMinutos || agenda.intervaloMinutos || 60,
    };
  }

  // fallback: estrutura antiga -> usa diasSemana + horaInicio/horaFim global
  if (
    agenda.diasSemana &&
    agenda.diasSemana.length &&
    !agenda.diasSemana.includes(dow)
  ) {
    return null;
  }

  if (!agenda.horaInicio || !agenda.horaFim) return null;

  return {
    ativo: true,
    inicio: agenda.horaInicio,
    fim: agenda.horaFim,
    intervaloMinutos: agenda.intervaloMinutos || 60,
  };
}

// 🔹 faixa horária em minutos de UM dia (ou null se não ativo)
function getFaixaHorariaDia(
  agenda: AgendaConfig,
  dow: number
): { inicioMin: number; fimMin: number } | null {
  const dia = getDiaDetalhado(agenda, dow);
  if (!dia) return null;

  const ini = timeToMinutes(dia.inicio);
  const fi = timeToMinutes(dia.fim);
  if (ini == null || fi == null || fi <= ini) return null;

  return { inicioMin: ini, fimMin: fi };
}

// 🔹 menor início / maior fim entre TODOS os dias ativos
// -> define a grade semanal (ex.: 06:00–22:00)
function getMinMaxSemana(
  agenda: AgendaConfig
): { minSemana: number; maxSemana: number } {
  let min = Infinity;
  let max = -Infinity;

  for (let dow = 0; dow <= 6; dow++) {
    const faixa = getFaixaHorariaDia(agenda, dow);
    if (faixa) {
      if (faixa.inicioMin < min) min = faixa.inicioMin;
      if (faixa.fimMin > max) max = faixa.fimMin;
    }
  }

  // fallback 06:00–22:00 se nada encontrado
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    const fallbackIni = 6 * 60;
    const fallbackFim = 22 * 60;
    return { minSemana: fallbackIni, maxSemana: fallbackFim };
  }

  return { minSemana: min, maxSemana: max };
}

// verifica se uma aula "cabe" na agenda (professor / local / modalidade / horário)
function aulaEncaixaNaAgenda(aula: Aula, agenda: AgendaConfig): boolean {
  if (agenda.tipo === "reservas") return false;

  if (agenda.professorId && aula.professorId !== agenda.professorId) return false;
  if (agenda.localId && aula.localId !== agenda.localId) return false;
  if (agenda.modalidadeId && aula.modalidadeId !== agenda.modalidadeId) return false;

  if (agenda.horaInicio && aula.horaInicio && aula.horaInicio < agenda.horaInicio)
    return false;
  if (agenda.horaFim && aula.horaInicio && aula.horaInicio > agenda.horaFim)
    return false;

  return true;
}


// ---------- ESTADO GLOBAL DE AULAS PARA A AGENDA ----------
const [todasAulas, setTodasAulas] = useState<Aula[]>([]);
const [carregandoAulas, setCarregandoAulas] = useState(true);

useEffect(() => {
  async function carregarAulas() {
    try {
const snap = await getDocs(collection(db, "aulas"));
const lista: Aula[] = snap.docs.map((docSnap) => {
  const d = docSnap.data() as any;
  return {
    ...d,
    id: docSnap.id, // 🔹 AGORA o id correto do Firestore sobrescreve qualquer "id" salvo no doc
  } as Aula;
});


      console.log("🔥 Aulas carregadas do Firebase:", lista);
      setTodasAulas(lista);
    } catch (err) {
      console.error("Erro ao carregar aulas:", err);
    } finally {
      setCarregandoAulas(false);
    }
  }

  carregarAulas();
}, []);


function BlocoAgenda({
  tipo,
  agendasConfig,
  carregandoAgendasConfig,
  agendaSelecionadaId,
  setAgendaSelecionadaId,
  onOpenGerenciarAgendas,
}: BlocoAgendaProps) {
  const tipoAtual: AgendaTipo = tipo === "reservas" ? "reservas" : "aulas";

  // só agendas ativas e compatíveis
  const agendasAtivas = (agendasConfig || []).filter((a) => {
    if (a.ativo === false) return false;
    if (tipoAtual === "aulas") {
      return a.tipo === "aulas" || a.tipo === "hibrida";
    }
    if (tipoAtual === "reservas") {
      return a.tipo === "reservas" || a.tipo === "hibrida";
    }
    return false;
  });

  if (carregandoAgendasConfig) {
    return (
      <section className="bg-white rounded-2xl shadow p-6 space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">
          Agenda — {tipoAtual === "aulas" ? "Aulas" : "Reservas de quadra"}
        </h2>
        <p className="text-xs text-gray-500">Carregando agendas...</p>
      </section>
    );
  }

  if (!agendasAtivas.length) {
    const labelTipo = tipoAtual === "aulas" ? "aulas" : "reservas de quadra";

    return (
      <section className="bg-white rounded-2xl shadow p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Agenda — {tipoAtual === "aulas" ? "Aulas" : "Reservas de quadra"}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Nenhuma agenda ativa configurada para {labelTipo} no momento.
          </p>
        </div>

        <div className="text-sm text-gray-600 space-y-1">
          <p>
            Para usar este painel, primeiro crie ou ative uma agenda no
            gerenciamento de agendas.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenGerenciarAgendas}
          className="inline-flex items-center gap-2 rounded-xl bg-black text-white text-xs font-semibold px-4 py-2 hover:bg-gray-800"
        >
          Gerenciar agendas
        </button>
      </section>
    );
  }

  const agendaSelecionada =
    agendasAtivas.find((a) => a.id === agendaSelecionadaId) || agendasAtivas[0];

  const agendaSelecionadaIdEfetiva =
    agendaSelecionadaId || agendaSelecionada.id;
    agendasAtivas.find((a) => a.id === agendaSelecionadaId) || agendasAtivas[0];

   // 🔹 Helpers para trabalhar com aulas por dia (usando "data", não "dia")
  const aulasDoDia = (dia: Date): Aula[] => {
    const diaISO = dataISO(dia); // você já usa dataISO na visão de mês

    return todasAulas.filter((aula) => {
      // garante que tem campo data
      if (!aula.data) return false;

      // data exata
      if (aula.data !== diaISO) return false;

      // se a aula estiver vinculada a uma agenda, respeita a agendaSelecionada
      if (
        aula.agendaId &&
        agendaSelecionada &&
        aula.agendaId !== agendaSelecionada.id
      ) {
        return false;
      }

      // se chegou aqui, é uma aula do dia para essa agenda
      return true;
    });
  };

  const aulasDoDiaOrdenadas = (dia: Date): Aula[] => {
    const lista = aulasDoDia(dia);
    // ordena por horaInicio (string "HH:MM" ordena bem)
    return [...lista].sort((a, b) => {
      const ha = a.horaInicio || "";
      const hb = b.horaInicio || "";
      if (ha < hb) return -1;
      if (ha > hb) return 1;
      return 0;
    });
  };


  useEffect(() => {
    if (!agendaSelecionadaId && agendasAtivas.length > 0) {
      setAgendaSelecionadaId(agendasAtivas[0].id);
    }
  }, [agendaSelecionadaId, agendasAtivas, setAgendaSelecionadaId]);

  const tituloPrincipal =
    tipoAtual === "aulas"
      ? `Agenda — ${agendaSelecionada.nome || "Aulas"}`
      : `Agenda — ${agendaSelecionada.nome || "Reservas de quadra"}`;

  const subtituloTipo =
    agendaSelecionada.tipo === "aulas"
      ? "Visualize e cadastre aulas."
      : agendaSelecionada.tipo === "reservas"
      ? "Visualize e cadastre reservas de quadra."
      : "Visualize e cadastre aulas e reservas.";

  const semanas = gerarGradeMes(agendaDataBase);

  // 🔹 grade base da semana: menor início / maior fim entre dias ativos
  const { minSemana, maxSemana } = getMinMaxSemana(agendaSelecionada);
  const step = agendaSelecionada.intervaloMinutos || 60;
  const horariosSemana = gerarSlotsPorRange(minSemana, maxSemana, step);

  const aulasDoDiaFiltradas = (dia: Date) => {
    const dow = dia.getDay();
    if (!getDiaDetalhado(agendaSelecionada, dow)) {
      return [];
    }
    return aulasDoDia(dia).filter((a) =>
      aulaEncaixaNaAgenda(a, agendaSelecionada)
    );
  };

  const aulasDoDiaOrdenadasFiltradas = (dia: Date) => {
    const dow = dia.getDay();
    if (!getDiaDetalhado(agendaSelecionada, dow)) {
      return [];
    }
    return aulasDoDiaOrdenadas(dia).filter((a) =>
      aulaEncaixaNaAgenda(a, agendaSelecionada)
    );
  };

  return (
    <section className="bg-white rounded-2xl shadow p-4 space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {tituloPrincipal}
          </h2>
          <p className="text-xs text-gray-500">{subtituloTipo}</p>
        </div>

        <div className="flex flex-col gap-2 items-stretch sm:items-end">
          {/* seleção de agenda + navegação */}
          <div className="flex flex-wrap gap-2 justify-end items-center">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-600">Agenda:</span>
              <select
                className="border rounded-xl px-2 py-1 text-xs bg-white"
                value={agendaSelecionadaIdEfetiva}
                onChange={(e) => setAgendaSelecionadaId(e.target.value)}
              >
                {agendasAtivas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}{" "}
                    {a.tipo === "aulas"
                      ? "(Aulas)"
                      : a.tipo === "reservas"
                      ? "(Reservas)"
                      : "(Híbrida)"}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={voltarPeriodo}
                className="px-2 py-1 rounded-xl border text-xs bg-white hover:bg-gray-100"
                title="Período anterior"
              >
                ◀
              </button>

              {agendaView === "mes" && (
                <div className="text-sm font-bold text-gray-900 min-w-[140px] text-center">
                  {tituloAgenda()}
                </div>
              )}

              <button
                onClick={avancarPeriodo}
                className="px-2 py-1 rounded-xl border text-xs bg-white hover:bg-gray-100"
                title="Próximo período"
              >
                ▶
              </button>
            </div>
          </div>

          {/* visão + botões */}
          <div className="flex flex-wrap gap-2 justify-end items-center">
            <div className="flex items-center gap-1 text-xs">
              <button
                onClick={() => setAgendaView("mes")}
                className={`px-3 py-2 rounded-xl border ${
                  agendaView === "mes"
                    ? "bg-black text-white border-black"
                    : "bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                Mês
              </button>
              <button
                onClick={() => setAgendaView("semana")}
                className={`px-3 py-2 rounded-xl border ${
                  agendaView === "semana"
                    ? "bg-black text-white border-black"
                    : "bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                Semana
              </button>
              <button
                onClick={() => setAgendaView("dia")}
                className={`px-3 py-2 rounded-xl border ${
                  agendaView === "dia"
                    ? "bg-black text-white border-black"
                    : "bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                Dia
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Visão MÊS */}
      {agendaView === "mes" && (
        <div className="space-y-2">
          <div className="grid grid-cols-7 text-[11px] font-semibold text-gray-500 text-center uppercase tracking-wide">
            <div>Dom</div>
            <div>Seg</div>
            <div>Ter</div>
            <div>Qua</div>
            <div>Qui</div>
            <div>Sex</div>
            <div>Sáb</div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-gray-300 rounded-xl overflow-hidden text-xs">
            {semanas.map((semana, wIdx) =>
              semana.map((dia, dIdx) => {
                const isMesAtual = dia.getMonth() === agendaDataBase.getMonth();
                const hojeISO = dataISO(new Date());
                const diaISO = dataISO(dia);

                const aulas = aulasDoDiaFiltradas(dia);

                return (
                  <div
                    key={`${wIdx}-${dIdx}`}
                    className={`bg-white min-h-[90px] p-2 flex flex-col cursor-pointer ${
                      isMesAtual ? "text-gray-800" : "text-gray-400 bg-gray-50"
                    } ${diaISO === hojeISO ? "ring-2 ring-black" : ""}`}
                    onClick={() => {
                      setDiaFocado(dia);
                      setAgendaDataBase(dia);
                      setAgendaView("dia");
                    }}
                  >
                    <div className="text-[11px] font-semibold mb-1 leading-none">
                      {dia.getDate()}
                    </div>

                    <div className="flex-1 space-y-1 overflow-hidden">
                      {aulas.length === 0 ? (
                        <div className="text-[10px] text-gray-400 italic">—</div>
                      ) : (
                        aulas.slice(0, 3).map((aula, idxAula) => (
                          <div
                            key={idxAula}
                            className="rounded-md border border-gray-200 px-2 py-1 leading-tight"
                            style={{
                              backgroundColor: corDoProfessor(aula.professorId),
                            }}
                          >
                            <div className="font-medium text-[10px] text-gray-800">
                              {aula.horaInicio}{" "}
                              {aula.alunosNomes?.join(", ") || aula.atividadeTexto}
                            </div>
                          </div>
                        ))
                      )}

                      {aulas.length > 3 && (
                        <div className="text-[10px] text-blue-600">
                          + {aulas.length - 3} aulas
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <p className="text-[10px] text-gray-400 text-right">
            Clique em um dia para ver a agenda diária
          </p>
        </div>
      )}

      {/* Visão SEMANA */}
      {agendaView === "semana" && (() => {
        const diasSemana = gerarSemana(agendaDataBase); // [Dom..Sáb]

        return (
          <div className="space-y-4 text-xs text-gray-700">
            {/* Cabeçalho dos dias */}
            <div
              className="grid"
              style={{ gridTemplateColumns: "80px repeat(7, 1fr)" }}
            >
              <div></div>

              {diasSemana.map((dia, idx) => {
                const dd = String(dia.getDate()).padStart(2, "0");
                const mm = String(dia.getMonth() + 1).padStart(2, "0");

                const nomeDia = [
                  "Dom",
                  "Seg",
                  "Ter",
                  "Qua",
                  "Qui",
                  "Sex",
                  "Sáb",
                ][dia.getDay()];
                const hojeISO = dataISO(new Date());
                const diaISO = dataISO(dia);

                const dow = dia.getDay();
                const diaInfo = getDiaDetalhado(agendaSelecionada, dow);
                const diaAtivo = !!diaInfo;

                const baseClasses =
                  "p-2 text-center text-[11px] font-semibold uppercase tracking-wide";

                const estadoDia =
                  diaISO === hojeISO
                    ? "bg-black text-white rounded-xl"
                    : diaAtivo
                    ? ""
                    : "text-gray-300";

                return (
                  <div key={idx} className={`${baseClasses} ${estadoDia}`}>
                    <div>{nomeDia}</div>
                    <div className="text-[10px] font-normal normal-case">
                      {dd}/{mm}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Grade de horários x dias */}
            <div className="overflow-y-auto max-h-[80vh]">
              <div
                className="grid border border-gray-300 rounded-xl overflow-hidden"
                style={{ gridTemplateColumns: "80px repeat(7, 1fr)" }}
              >
                {horariosSemana.map((hora, hIdx) => {
                  const minutosSlot = timeToMinutes(hora) ?? 0;

                  return (
                    <React.Fragment key={hora}>
                      {/* coluna dos horários */}
                      <div
                        className={`border-t border-gray-200 bg-gray-50 p-2 text-[10px] text-gray-500 font-medium ${
                          hIdx === 0 ? "border-t-0" : ""
                        }`}
                      >
                        {hora}
                      </div>

                      {/* colunas dos dias */}
                      {diasSemana.map((dia, dIdx) => {
                        const dow = dia.getDay();
                        const diaInfo = getDiaDetalhado(
                          agendaSelecionada,
                          dow
                        );
                        const faixaDia = getFaixaHorariaDia(
                          agendaSelecionada,
                          dow
                        );

                        const diaAtivo = !!diaInfo && !!faixaDia;

                        const slotDentroFaixa =
                          diaAtivo &&
                          minutosSlot >= (faixaDia!.inicioMin ?? 0) &&
                          minutosSlot < (faixaDia!.fimMin ?? 0);

                        const aulasNesseSlot =
                          tipoAtual === "aulas" && diaAtivo
                            ? aulasDoDiaOrdenadasFiltradas(dia).filter(
                                (aula) => (aula.horaInicio || "") === hora
                              )
                            : [];

                        const podeCriarAula =
                          tipoAtual === "aulas" &&
                          (agendaSelecionada.tipo === "aulas" ||
                            agendaSelecionada.tipo === "hibrida");

                        const baseClasses =
                          "border-t border-l border-gray-200 p-1 min-h-[3px] text-[11px] leading-tight";
                        const bordaTopo = hIdx === 0 ? "border-t-0" : "";

                        const estadoCelula = slotDentroFaixa
                          ? "bg-white cursor-pointer hover:bg-gray-50"
                          : "bg-gray-100 text-gray-300 cursor-not-allowed";

                        return (
                          <div
                            key={dIdx}
                            className={`${baseClasses} ${bordaTopo} ${estadoCelula}`}
                            onClick={() => {
                              // 🔒 só deixa clicar se estiver dentro da faixa daquele dia
                              if (!slotDentroFaixa) return;
                              if (podeCriarAula) {
                                criarAulaNoDiaHora(dia, hora);
                              }
                            }}
                          >
                            {aulasNesseSlot.length === 0 ? (
                              <div className="italic select-none text-transparent">
                                .
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {aulasNesseSlot.map((aula, idxAula) => (
                                  <div
                                    key={idxAula}
                                    className="rounded-md border border-gray-300 bg-white shadow-sm cursor-pointer p-2 hover:bg-gray-50"
                                    style={{
                                      backgroundColor: corDoProfessor(
                                        aula.professorId
                                      ),
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!slotDentroFaixa) return;
                                      setAulaSelecionadaDetalhe(aula);
                                    }}
                                  >
                                    <div className="font-semibold text-gray-800 text-[11px]">
                                      {Array.isArray(aula.alunosNomes)
                                        ? aula.alunosNomes.join(", ")
                                        : "-"}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>

              <p className="text-[10px] text-gray-400 text-right">
                Clique em um bloco disponível para cadastrar{" "}
                {tipoAtual === "aulas" ? "aula" : "reserva (em breve)"}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Visão DIA */}
      {agendaView === "dia" && (() => {
        const d = diaFocado;
        const dow = d.getDay();

        const diaInfo = getDiaDetalhado(agendaSelecionada, dow);
        const faixaDia = getFaixaHorariaDia(agendaSelecionada, dow);

        const diaAtivo = !!diaInfo && !!faixaDia;

        const dataFormatada = (() => {
          const dd = String(d.getDate()).padStart(2, "0");
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const yyyy = d.getFullYear();
          const nomeDia = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][
            d.getDay()
          ];
          return `${nomeDia}, ${dd}/${mm}/${yyyy}`;
        })();

        const aulasOrdenadas =
          tipoAtual === "aulas" && diaAtivo
            ? aulasDoDiaOrdenadasFiltradas(diaFocado)
            : [];

        return (
          <div className="space-y-4 text-sm text-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-gray-900">
                  {dataFormatada}
                </div>
                <div className="text-[11px] text-gray-500">
                  {tipoAtual === "aulas"
                    ? "Agenda de aulas desse dia"
                    : "Agenda de reservas desse dia (em breve)"}
                </div>
              </div>
              <div className="flex items-center gap-2" />
            </div>

            {/* Dia não ativo ou sem faixa */}
            {!diaAtivo || !faixaDia ? (
              <div className="text-xs text-red-500 font-medium">
                Agenda não ativa para este dia.
              </div>
            ) : (
              <>
                {/* Grade de horários do dia:
                    usa a mesma grade base da semana (minSemana–maxSemana),
                    mas apenas a faixa do dia fica branca/clicável */}
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  {horariosSemana.map((hora) => {
                    const minutosSlot = timeToMinutes(hora) ?? 0;

                    const slotDentroFaixa =
                      minutosSlot >= faixaDia.inicioMin &&
                      minutosSlot < faixaDia.fimMin;

                    const aulasNesseSlot =
                      tipoAtual === "aulas"
                        ? aulasOrdenadas.filter(
                            (aula) => (aula.horaInicio || "") === hora
                          )
                        : [];

                    const podeCriarAula =
                      tipoAtual === "aulas" &&
                      (agendaSelecionada.tipo === "aulas" ||
                        agendaSelecionada.tipo === "hibrida");

                    const ocupado = aulasNesseSlot.length > 0;

                    const linhaBase =
                      "flex items-start justify-between px-3 py-2 border-t border-gray-100 text-xs first:border-t-0";

                    const estiloLinha = slotDentroFaixa
                      ? ocupado
                        ? "bg-white"
                        : "bg-gray-50 hover:bg-gray-100 cursor-pointer"
                      : "bg-gray-100 text-gray-300 cursor-not-allowed";

                    return (
                      <div
                        key={hora}
                        className={`${linhaBase} ${estiloLinha}`}
                        onClick={() => {
                          // 🔒 só permite clique/criação dentro da faixa e se estiver livre
                          if (!slotDentroFaixa) return;
                          if (!podeCriarAula) return;
                          if (!ocupado) {
                            criarAulaNoDiaHora(diaFocado, hora);
                          }
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[11px] text-gray-700 w-10">
                            {hora}
                          </span>

                          {!slotDentroFaixa ? (
                            <span className="text-[11px] text-gray-400 italic">
                              Fora da agenda
                            </span>
                          ) : ocupado ? (
                            <div className="space-y-1">
                              {aulasNesseSlot.map((aula, idxAula) => (
                                <div
                                  key={idxAula}
                                  className="px-2 py-1 rounded-md border border-gray-200 shadow-sm cursor-pointer hover:bg-gray-50"
                                  style={{
                                    backgroundColor: corDoProfessor(
                                      aula.professorId
                                    ),
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAulaSelecionadaDetalhe(aula);
                                  }}
                                >
                                  <div className="font-semibold text-[11px] text-gray-900">
                                    {Array.isArray(aula.alunosNomes)
                                      ? aula.alunosNomes.join(", ")
                                      : aula.atividadeTexto}
                                  </div>
                                  <div className="text-[10px] text-gray-700">
                                    {aula.professorNome?.trim() ||
                                      aula.professorId}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-400 italic">
                              Livre
                            </span>
                          )}
                        </div>

                        {/* Botão lateral "+ Aula" só dentro da faixa, livre */}
                        {slotDentroFaixa && podeCriarAula && !ocupado && (
                          <button
                            type="button"
                            className="text-[10px] font-semibold text-blue-600"
                          >
                            + Aula
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <p className="text-[10px] text-gray-400">
                  Clique em um horário livre dentro da faixa da agenda para cadastrar
                  uma aula.
                </p>
              </>
            )}
          </div>
        );
      })()}
    </section>
  );
}

// <-- FECHA BlocoAgenda ✅

// -------------------- BLOCO FINANCEIRO --------------------
  function BlocoFinanceiro() {
    return (
      <section className="bg-white rounded-2xl shadow p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Financeiro
        </h2>

        <div className="text-sm text-gray-600">
          <p>
            Em aberto total:{" "}
            <span className="font-semibold text-red-600">
              R$ 0,00
            </span>
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Aqui vamos listar mensalidades / pendências por responsável.
          </p>
        </div>
      </section>
    );
  }

  // -------------------- BLOCO RESPONSÁVEIS --------------------
 function BlocoResponsaveis() {
  if (!familiaSelecionada) {
    // ordenar lista
    const familiasOrdenadas = [...familiasFiltradas].sort((a, b) =>
      a.responsavel.nome.localeCompare(b.responsavel.nome, "pt-BR", {
        sensitivity: "base",
      })
    );

    // separar ativos e inativos
    const familiasAtivas = familiasOrdenadas.filter(
      (f) => f.responsavel.ativo === true
    );
    const familiasInativas = familiasOrdenadas.filter(
      (f) => f.responsavel.ativo !== true
    );

    function ListaFamiliasGrupo(
      lista: Familia[],
      estiloBadgeAtivo: boolean
    ) {
      if (lista.length === 0) {
        return (
          <div className="text-xs text-gray-500 mt-1">
            Nenhum responsável.
          </div>
        );
      }

      return (
        <ul className="divide-y divide-gray-100">
          {lista.map((familia) => (
            <li
              key={familia.responsavel.id}
              className="py-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between cursor-pointer hover:bg-gray-50 rounded-xl px-2"
              onClick={() => {
                setResponsavelSelecionadoId(familia.responsavel.id);
                setEditando(false);
                setEditEmail(familia.responsavel.email || "");
                setEditTelefone(familia.responsavel.telefone || "");
                setEditEndereco(familia.responsavel.endereco || "");
              }}
            >
              {/* bloco esquerdo */}
              <div className="text-sm">
                <div className="font-medium text-gray-900">
                  {familia.responsavel.nome}
                </div>

                <div className="text-xs text-gray-500">
                  {familia.responsavel.telefone || "-"}
                </div>

                <div className="text-[11px] text-gray-500 mt-1 leading-snug">
                  {`Ativos: ${
                    familia.alunos.filter((a) => a.status === "ativo")
                      .length
                  } • Inativos: ${
                    familia.alunos.filter((a) => a.status === "inativo")
                      .length
                  }`}
                </div>
              </div>

              {/* badge status */}
              <span
                className={`self-start sm:self-auto text-[10px] px-2 py-1 rounded-lg uppercase tracking-wide w-fit ${
                  estiloBadgeAtivo
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {estiloBadgeAtivo ? "ATIVO" : "INATIVO"}
              </span>
            </li>
          ))}
        </ul>
      );
    }

return (
  <section className="bg-white rounded-2xl shadow p-4">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-gray-900">
        Responsáveis cadastrados ({familias.length})
      </h2>

      <Link
        href="/admin/novo-responsavel"  // ajuste se sua rota for diferente
        className="inline-flex items-center gap-2 text-sm border border-gray-300 rounded-xl px-4 py-2 hover:bg-gray-100 font-medium"
      >
        <span>+ Novo responsável</span>
      </Link>
    </div>

        {/* ATIVOS */}
        <div className="mb-6">
          <div className="text-sm font-semibold text-green-700 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            {`Ativos (${familiasAtivas.length})`}
          </div>

          {ListaFamiliasGrupo(familiasAtivas, true)}
        </div>

        {/* INATIVOS */}
        <div>
          <div className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
            {`Inativos (${familiasInativas.length})`}
          </div>

          {ListaFamiliasGrupo(familiasInativas, false)}
        </div>
      </section>
    );
  }

  // modo detalhe
  const fam = familiaSelecionada;
  const resp = fam.responsavel;

  const alunosOrdenados = [...fam.alunos].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", {
      sensitivity: "base",
    })
  );
  const alunosAtivos = alunosOrdenados.filter(
    (a) => a.status === "ativo"
  );
  const alunosInativos = alunosOrdenados.filter(
    (a) => a.status === "inativo"
  );

  return (
    <section className="bg-white rounded-2xl shadow p-4 space-y-6">
      {/* header do responsável */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {resp.nome}
          </h2>

          <p className="text-xs text-gray-500">CPF: {resp.cpf || "-"}</p>

          <p className="text-xs text-gray-500">
            Status: {resp.ativo ? "ATIVO" : "INATIVO"}
          </p>

          <p className="text-[11px] text-gray-500 mt-1">
            {`Alunos ativos: ${alunosAtivos.length} • Inativos: ${alunosInativos.length}`}
          </p>
        </div>

        <button
          className="text-xs text-gray-500 hover:text-gray-800"
          onClick={() => {
            setResponsavelSelecionadoId(null);
            setEditando(false);
          }}
        >
          ← Voltar
        </button>
      </div>

      {/* contato + endereço + alunos */}
      <div className="space-y-4 text-sm text-gray-700">
        {/* contato */}
        <div>
          <div className="text-gray-500 text-xs font-semibold uppercase">
            Contato
          </div>
          <div>Email: {resp.email || "-"}</div>
          <div>Telefone: {resp.telefone || "-"}</div>
        </div>

        {/* endereço */}
        <div>
          <div className="text-gray-500 text-xs font-semibold uppercase">
            Endereço
          </div>

          {resp.endereco ? (
            <div className="text-sm text-gray-800 leading-snug">
              <div>{resp.endereco}</div>
              <div className="text-gray-600">
                {resp.numero ? `Nº ${resp.numero}` : ""}
                {resp.complemento
                  ? `${resp.numero ? ", " : ""}${resp.complemento}`
                  : ""}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">-</div>
          )}
        </div>

        {/* alunos vinculados */}
        <div className="space-y-3">
          <div className="text-gray-500 text-xs font-semibold uppercase">
            {`Alunos vinculados (${fam.alunos.length})`}
          </div>

          <div className="space-y-4">
            {/* ATIVOS */}
            <div>
              <div className="text-[11px] font-semibold text-green-700 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                {`Ativos (${alunosAtivos.length})`}
              </div>

              {alunosAtivos.length === 0 ? (
                <div className="text-xs text-gray-500 mt-1">
                  Nenhum aluno ativo.
                </div>
              ) : (
                <ul className="mt-2 space-y-3">
                  {alunosAtivos.map((aluno) => {
                    const aberto = alunoAbertoIdPorResponsavel === aluno.id;

                    return (
                      <li
                        key={aluno.id}
                        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition cursor-pointer"
                        onClick={() => toggleAlunoVinculado(aluno.id)}
                      >
                        {/* resumo */}
                        <div className="text-sm">
                          <div className="font-semibold text-gray-900">{aluno.nome}</div>

                          <div className="text-xs text-gray-600">
                            Telefone:{" "}
                            {aluno.telefone && aluno.telefone.trim() !== ""
                              ? aluno.telefone
                              : "-"}
                          </div>

                          <div className="text-xs text-gray-600">
                            Obs:{" "}
                            {aluno.observacoes && aluno.observacoes.trim() !== ""
                              ? aluno.observacoes
                              : "-"}
                          </div>
                        </div>

                        {/* detalhes */}
                        {aberto && (
                          <div className="mt-4 border-t pt-4 text-xs text-gray-700 space-y-3">
                            <div className="grid sm:grid-cols-2 gap-3">
                              <div>
                                <div className="text-[11px] text-gray-500 uppercase font-semibold">
                                  CPF
                                </div>
                                <div className="text-gray-800">
                                  {aluno.cpf && aluno.cpf.trim() !== "" ? aluno.cpf : "-"}
                                </div>
                              </div>

                              <div>
                                <div className="text-[11px] text-gray-500 uppercase font-semibold">
                                  Email
                                </div>
                                <div className="text-gray-800">
                                  {aluno.email && aluno.email.trim() !== "" ? aluno.email : "-"}
                                </div>
                              </div>

                              <div>
                                <div className="text-[11px] text-gray-500 uppercase font-semibold">
                                  Nascimento
                                </div>
                                <div className="text-gray-800">
                                  {aluno.nascimento && aluno.nascimento !== ""
                                    ? aluno.nascimento
                                    : "-"}
                                </div>
                              </div>

                              <div>
                                <div className="text-[11px] text-gray-500 uppercase font-semibold">
                                  CEP
                                </div>
                                <div className="text-gray-800">
                                  {aluno.cep && aluno.cep.trim() !== "" ? aluno.cep : "-"}
                                </div>
                              </div>

                              <div className="sm:col-span-2">
                                <div className="text-[11px] text-gray-500 uppercase font-semibold">
                                  Endereço
                                </div>
                                <div className="text-gray-800">
                                  {aluno.endereco && aluno.endereco.trim() !== ""
                                    ? aluno.endereco
                                    : "-"}
                                </div>
                              </div>

                              <div>
                                <div className="text-[11px] text-gray-500 uppercase font-semibold">
                                  Número
                                </div>
                                <div className="text-gray-800">
                                  {aluno.numero && String(aluno.numero).trim() !== ""
                                    ? String(aluno.numero)
                                    : "-"}
                                </div>
                              </div>

                              <div>
                                <div className="text-[11px] text-gray-500 uppercase font-semibold">
                                  Complemento
                                </div>
                                <div className="text-gray-800">
                                  {aluno.complemento && aluno.complemento.trim() !== ""
                                    ? aluno.complemento
                                    : "-"}
                                </div>
                              </div>

                              <div className="sm:col-span-2">
                                <div className="text-[11px] text-gray-500 uppercase font-semibold">
                                  Observações
                                </div>
                                <div className="text-gray-800">
                                  {aluno.observacoes && aluno.observacoes.trim() !== ""
                                    ? aluno.observacoes
                                    : "-"}
                                </div>
                              </div>
                            </div>

                            {/* ações */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="flex flex-row gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    abrirEdicaoAluno(aluno);
                                  }}
                                  className="text-[10px] px-2 py-1 rounded-lg bg-black text-white hover:bg-gray-800 uppercase tracking-wide"
                                >
                                  EDITAR
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deletarAluno(aluno);
                                  }}
                                  className="text-[10px] px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 uppercase tracking-wide"
                                >
                                  DELETAR
                                </button>
                              </div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  alternarStatusAluno(aluno, "inativo");
                                }}
                                className="text-[10px] px-2 py-1 rounded-lg bg-green-100 text-green-700 uppercase tracking-wide w-fit hover:bg-green-200"
                              >
                                ATIVO (clique p/ inativar)
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* INATIVOS */}
            <div>
              <div className="text-[11px] font-semibold text-gray-600 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-gray-400"></span>
                {`Inativos (${alunosInativos.length})`}
              </div>

              {alunosInativos.length === 0 ? (
                <div className="text-xs text-gray-500 mt-1">
                  Nenhum aluno inativo.
                </div>
              ) : (
               <ul className="mt-2 space-y-3">
                {alunosInativos.map((aluno) => {
                  const aberto = alunoAbertoIdPorResponsavel === aluno.id;
                  const podeAtivar = responsavelEstaAtivoDoAluno(aluno);

                  return (
                    <li
                      key={aluno.id}
                      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition cursor-pointer"
                      onClick={() => toggleAlunoVinculado(aluno.id)}
                    >
                      {/* resumo */}
                      <div className="text-sm">
                        <div className="font-semibold text-gray-900">{aluno.nome}</div>

                        <div className="text-xs text-gray-600">
                          Telefone:{" "}
                          {aluno.telefone && aluno.telefone.trim() !== ""
                            ? aluno.telefone
                            : "-"}
                        </div>

                        <div className="text-xs text-gray-600">
                          Obs:{" "}
                          {aluno.observacoes && aluno.observacoes.trim() !== ""
                            ? aluno.observacoes
                            : "-"}
                        </div>
                      </div>

                      {/* detalhes */}
                      {aberto && (
                        <div className="mt-4 border-t pt-4 text-xs text-gray-700 space-y-3">
                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <div className="text-[11px] text-gray-500 uppercase font-semibold">
                                CPF
                              </div>
                              <div className="text-gray-800">
                                {aluno.cpf && aluno.cpf.trim() !== "" ? aluno.cpf : "-"}
                              </div>
                            </div>

                            <div>
                              <div className="text-[11px] text-gray-500 uppercase font-semibold">
                                Email
                              </div>
                              <div className="text-gray-800">
                                {aluno.email && aluno.email.trim() !== "" ? aluno.email : "-"}
                              </div>
                            </div>

                            <div>
                              <div className="text-[11px] text-gray-500 uppercase font-semibold">
                                Nascimento
                              </div>
                              <div className="text-gray-800">
                                {aluno.nascimento && aluno.nascimento !== ""
                                  ? aluno.nascimento
                                  : "-"}
                              </div>
                            </div>

                            <div>
                              <div className="text-[11px] text-gray-500 uppercase font-semibold">
                                CEP
                              </div>
                              <div className="text-gray-800">
                                {aluno.cep && aluno.cep.trim() !== "" ? aluno.cep : "-"}
                              </div>
                            </div>

                            <div className="sm:col-span-2">
                              <div className="text-[11px] text-gray-500 uppercase font-semibold">
                                Endereço
                              </div>
                              <div className="text-gray-800">
                                {aluno.endereco && aluno.endereco.trim() !== ""
                                  ? aluno.endereco
                                  : "-"}
                              </div>
                            </div>

                            <div>
                              <div className="text-[11px] text-gray-500 uppercase font-semibold">
                                Número
                              </div>
                              <div className="text-gray-800">
                                {aluno.numero && String(aluno.numero).trim() !== ""
                                  ? String(aluno.numero)
                                  : "-"}
                              </div>
                            </div>

                            <div>
                              <div className="text-[11px] text-gray-500 uppercase font-semibold">
                                Complemento
                              </div>
                              <div className="text-gray-800">
                                {aluno.complemento && aluno.complemento.trim() !== ""
                                  ? aluno.complemento
                                  : "-"}
                              </div>
                            </div>

                            <div className="sm:col-span-2">
                              <div className="text-[11px] text-gray-500 uppercase font-semibold">
                                Observações
                              </div>
                              <div className="text-gray-800">
                                {aluno.observacoes && aluno.observacoes.trim() !== ""
                                  ? aluno.observacoes
                                  : "-"}
                              </div>
                            </div>
                          </div>

                          {/* ações */}
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="flex flex-row gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  abrirEdicaoAluno(aluno);
                                }}
                                className="text-[10px] px-2 py-1 rounded-lg bg-black text-white hover:bg-gray-800 uppercase tracking-wide"
                              >
                                EDITAR
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deletarAluno(aluno);
                                }}
                                className="text-[10px] px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 uppercase tracking-wide"
                              >
                                DELETAR
                              </button>
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!podeAtivar) {
                                  alert(
                                    "Não é possível ativar este aluno porque o responsável está INATIVO."
                                  );
                                  return;
                                }
                                alternarStatusAluno(aluno, "ativo");
                              }}
                              className={`text-[10px] px-2 py-1 rounded-lg uppercase tracking-wide w-fit ${
                                podeAtivar
                                  ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
                              }`}
                            >
                              INATIVO (clique p/ ativar)
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ações do responsável */}
      <div className="space-y-4">
        {/* ativar/inativar responsável */}
        <div className="flex items-start justify-between flex-col sm:flex-row gap-3">
          <div className="text-sm">
            <div className="font-semibold text-gray-800">
              Status do responsável
            </div>
            <div className="text-xs text-gray-500">
              Se marcar como INATIVO, todos os alunos dele vão
              para inativo automaticamente.
            </div>
            <div className="text-xs text-gray-500">
              Para ATIVAR novamente, você escolhe qual aluno
              volta como ATIVO.
            </div>
          </div>

          <button
            onClick={() => alternarStatusResponsavel(fam, !resp.ativo)}
            className={`text-[10px] px-3 py-2 rounded-lg uppercase tracking-wide w-fit ${
              resp.ativo
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {resp.ativo
              ? "INATIVAR RESPONSÁVEL"
              : "ATIVAR RESPONSÁVEL"}
          </button>
        </div>

        {/* ir para tela de edição do responsável */}
        <div className="border rounded-xl p-4 bg-gray-50">
          <div className="flex items-start justify-between flex-col sm:flex-row gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-800">
                Editar dados do responsável
              </div>
              <div className="text-xs text-gray-500">
                Você poderá alterar telefone, email, endereço.
              </div>
              <div className="text-xs text-gray-500">
                Nome e CPF do responsável NÃO podem ser alterados.
              </div>
            </div>

            <button
              onClick={() =>
                router.push(`/admin/editar-responsavel/${resp.id}`)
              }
              className="text-[10px] px-3 py-2 rounded-lg bg-black text-white hover:bg-gray-800 uppercase tracking-wide w-fit"
            >
              EDITAR RESPONSÁVEL
            </button>
          </div>
        </div>

        {/* deletar família */}
        <div className="border rounded-xl p-4 bg-red-50">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-semibold text-red-700">
              Deletar responsável e alunos
            </div>
            <div className="text-xs text-red-600">
              Essa ação apaga este responsável e TODOS os alunos
              vinculados. Não pode ser desfeita.
            </div>

            <button
              onClick={() => deletarFamilia(fam)}
              className="self-start text-[10px] px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 uppercase tracking-wide"
            >
              DELETAR FAMÍLIA
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}


// -------------------- renderConteudo --------------------
function renderConteudo() {
  switch (abaSelecionada) {
    case "agenda":
  return (
    <BlocoAgenda
      tipo="aulas"
      agendasConfig={agendasConfig}
      carregandoAgendasConfig={carregandoAgendasConfig}
      agendaSelecionadaId={agendaSelecionadaId}
      setAgendaSelecionadaId={setAgendaSelecionadaId}
      onOpenGerenciarAgendas={() => setShowAgendas(true)}
    />
  );

case "reservasQuadra":
  return (
    <BlocoAgenda
      tipo="reservas"
      agendasConfig={agendasConfig}
      carregandoAgendasConfig={carregandoAgendasConfig}
      agendaSelecionadaId={agendaSelecionadaId}
      setAgendaSelecionadaId={setAgendaSelecionadaId}
      onOpenGerenciarAgendas={() => setShowAgendas(true)}
    />
  );


    case "alunos":
      return BlocoAlunos();
    case "responsaveis":
      return BlocoResponsaveis();
    case "financeiro":
      return BlocoFinanceiro();
    default:
      return BlocoAgenda({
        tipo: "aulas",
        agendasConfig,
        agendaSelecionadaId,
        setAgendaSelecionadaId,
      } as any);
  }
}


  // -------------------- ModalEditarAluno --------------------
function ModalEditarAluno() {
  if (!editAluno) return null;

  const responsavelDoAlunoEditando =
    familias.find((f: any) => f.responsavel?.id === editAluno.responsavelId)
      ?.responsavel || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Editar aluno</h2>

            <p className="text-[11px] text-gray-500 leading-snug">
              Responsável:&nbsp;
              <span className="font-medium text-gray-800">
                {responsavelDoAlunoEditando ? responsavelDoAlunoEditando.nome : "—"}
              </span>
            </p>

            <p className="text-[11px] text-gray-500 leading-snug">
              (não é possível trocar o responsável aqui)
            </p>
          </div>

          <button
            onClick={fecharEdicaoAluno}
            className="text-xs text-gray-500 hover:text-gray-800"
          >
            ✕
          </button>
        </div>

<div className="space-y-3 text-sm">
  {/* Nome (linha única) */}
  <div className="flex flex-col">
    <label className="text-xs text-gray-700 font-medium">
      Nome do aluno *
    </label>
    <input
      className="border rounded-xl p-2 text-sm"
      value={editAluno.nome || ""}
      onChange={(e) => setCampoAluno("nome", e.target.value)}
      placeholder="Ex: Theo Santo"
    />
  </div>

  {/* Telefone e CPF (lado a lado) */}
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div className="flex flex-col">
      <label className="text-xs text-gray-700 font-medium">
        Telefone (opcional)
      </label>
      <input
        className="border rounded-xl p-2 text-sm"
        value={editAluno.telefone || ""}
        onChange={(e) => setCampoAluno("telefone", e.target.value)}
        placeholder="(11) 98888-7777"
      />
    </div>

    <div className="flex flex-col">
      <label className="text-xs text-gray-700 font-medium">
        CPF (opcional)
      </label>
      <input
        className="border rounded-xl p-2 text-sm"
        value={editAluno.cpf || ""}
        onChange={(e) => setCampoAluno("cpf", e.target.value)}
        placeholder="000.000.000-00"
      />
    </div>
  </div>

  {/* Nascimento e Email (lado a lado) */}
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div className="flex flex-col">
      <label className="text-xs text-gray-700 font-medium">
        Nascimento
      </label>
      <input
        type="date"
        className="border rounded-xl p-2 text-sm"
        value={editAluno.nascimento || ""}
        onChange={(e) => setCampoAluno("nascimento", e.target.value)}
      />
    </div>

    <div className="flex flex-col">
      <label className="text-xs text-gray-700 font-medium">
        Email
      </label>
      <input
        type="email"
        className="border rounded-xl p-2 text-sm"
        value={editAluno.email || ""}
        onChange={(e) => setCampoAluno("email", e.target.value)}
        placeholder="email@exemplo.com"
      />
    </div>
  </div>

  {/* CEP e botão buscar (lado a lado) */}
  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
    <div className="flex flex-col">
      <label className="text-xs text-gray-700 font-medium">CEP</label>
      <input
        className="border rounded-xl p-2 text-sm"
        value={editAluno.cep || ""}
        onChange={(e) => setCampoAluno("cep", e.target.value)}
        placeholder="00000-000"
      />
    </div>

    <button
      type="button"
      onClick={buscarEnderecoPorCepAluno}
      className="bg-black text-white rounded-xl px-3 py-2 text-xs hover:bg-gray-800 h-[38px]"
    >
      Buscar endereço
    </button>
  </div>

  {/* Rua / Bairro / Cidade - UF (linha única) */}
  <div className="flex flex-col">
    <label className="text-xs text-gray-700 font-medium">
      Rua / Bairro / Cidade - UF
    </label>
    <input
      className="border rounded-xl p-2 text-sm"
      value={editAluno.endereco || ""}
      onChange={(e) => setCampoAluno("endereco", e.target.value)}
      placeholder="Rua Tal, Bairro Tal, Cidade - UF"
    />
  </div>

  {/* Número e Complemento (lado a lado) */}
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div className="flex flex-col">
      <label className="text-xs text-gray-700 font-medium">
        Número
      </label>
      <input
        className="border rounded-xl p-2 text-sm"
        value={editAluno.numero || ""}
        onChange={(e) => setCampoAluno("numero", e.target.value)}
        placeholder="123"
      />
    </div>

    <div className="flex flex-col">
      <label className="text-xs text-gray-700 font-medium">
        Complemento
      </label>
      <input
        className="border rounded-xl p-2 text-sm"
        value={editAluno.complemento || ""}
        onChange={(e) => setCampoAluno("complemento", e.target.value)}
        placeholder="Apto / Bloco..."
      />
    </div>
  </div>

  {/* Observações */}
  <div className="flex flex-col">
    <label className="text-xs text-gray-700 font-medium">
      Observações
    </label>
    <textarea
      className="border rounded-xl p-2 text-sm"
      rows={2}
      value={editAluno.observacoes || ""}
      onChange={(e) => setCampoAluno("observacoes", e.target.value)}
      placeholder="Ex: canhoto, nível intermediário, alergia..."
    />
  </div>
</div>

          {/* Status */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-700 font-medium">Status</label>
            <select
              className="border rounded-xl p-2 text-sm"
              value={(editAluno.status as any) || "ativo"}
              onChange={(e) =>
                setCampoAluno("status", e.target.value as any)
              }
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>

          {erroAluno && (
            <div className="text-red-600 text-xs font-medium">{erroAluno}</div>
          )}
       
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            onClick={fecharEdicaoAluno}
            className="flex-1 bg-gray-200 text-gray-700 rounded-xl px-4 py-2 text-xs font-semibold hover:bg-gray-300"
          >
            Cancelar
          </button>

          <button
            disabled={salvandoAluno}
            onClick={salvarAlunoEditado}
            className="flex-1 bg-black text-white rounded-xl px-4 py-2 text-xs font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {salvandoAluno ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
      );
     }

  // -------------------- RENDER FINAL --------------------
 if (carregando) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-gray-600">Carregando painel...</div>
    </main>
  );
}

return (
  <main className="min-h-screen bg-gray-100 p-6">
    <div className="max-w-6xl mx-auto space-y-6">

      

      {/* Cabeçalho topo */}
 <header className="flex items-center justify-between bg-white rounded-2xl shadow p-4">
  {/* Lado esquerdo: botão menu + título */}
  <div className="flex items-center gap-3">
    {/* Botão hamburger */}
    <button
      onClick={() => setMenuOpen(true)}
      className="inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
      aria-label="Abrir menu"
      title="Abrir menu"
    >
      ☰
    </button>

    {/* Título */}
    <div>
      <h1 className="text-xl font-semibold text-gray-900">
        Painel Administrativo — NexQuadra
      </h1>
      <p className="text-sm text-gray-600">
        Usuário logado: {nomeUsuario || "Carregando..."}
      </p>
    </div>
  </div>


  <div className="flex items-center gap-3">
  {/* Campo Pesquisar */}
  <div className="hidden sm:flex items-center gap-2 border rounded-xl px-3 py-2">
    <input
      value={buscaGlobal}
      onChange={(e) => setBuscaGlobal(e.target.value)}
      placeholder="Pesquisar"
      className="outline-none text-sm placeholder:text-gray-400"
    />
    {buscaGlobal && (
      <button
        onClick={() => setBuscaGlobal("")}
        className="text-xs text-gray-500 hover:text-gray-800"
        title="Limpar"
        aria-label="Limpar busca"
      >
        ✕
      </button>
    )}
  </div>

  <button
    onClick={() => router.push("/")}
    className="text-sm bg-black text-white rounded-xl px-4 py-2 hover:bg-gray-800"
  >
    Sair
  </button>
</div>
</header>


{/* MENU LATERAL (Drawer) */}
{menuOpen && (
  <div className="fixed inset-0 z-50">
    {/* backdrop */}
    <div
      className="absolute inset-0 bg-black/40"
      onClick={closeMenu}
      aria-hidden="true"
    />

    {/* painel */}
    <aside
      className="absolute left-0 top-0 h-full w-[290px] bg-white shadow-2xl p-4 flex flex-col gap-4"
      role="dialog"
      aria-label="Menu"
    >
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold text-gray-900">Menu</div>
        <button
          onClick={closeMenu}
          className="text-xs text-gray-500 hover:text-gray-800"
          aria-label="Fechar menu"
          title="Fechar"
        >
          ✕
        </button>
      </div>

      <nav className="mt-2 space-y-2 text-sm">
  {/* Perfil */}
  <button
    onClick={() => {
      closeMenu();
      router.push("/perfil");
    }}
    className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-50 border"
  >
    Perfil
    <span className="block text-[11px] text-gray-500">
      Ver/editar foto e endereço
    </span>
  </button>

        {/* Cadastro de Professores */}
        <button
  onClick={() => {
    closeMenu();
    setShowProfList(true); // <-- abre a LISTA (não mais o ModalProfessor direto)
  }}
  className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-50 border"
>
  Colaboradores
  <span className="block text-[11px] text-gray-500">
    Adicionar/editar colaboradores
  </span>
</button>

        {/* Modalidades */}
<button
  onClick={() => {closeMenu(); setShowModalidades(true);
  }}
  className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-50 border"
>
  Modalidades
  <span className="block text-[11px] text-gray-500">
    Criar/editar e ativar/desativar
  </span>
</button>

        {/* Planos de aulas */}
<button
   onClick={() => setShowPlanosList(true)}
  className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-50 border"
>
  Planos de aulas
  <span className="block text-[11px] text-gray-500">
    Criar e editar
  </span>
</button>

        {/* Cadastro de Locais */}
        <button
  onClick={() => {
    closeMenu();
    setShowLocais(true);
  }}
  className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-50 border"
>
  Local
  <span className="block text-[11px] text-gray-500">Quadras / espaços de aula</span>
</button>

{/* Gerenciamento de agendas */}
<button
  onClick={() => {
    closeMenu();
    setShowAgendas(true);
  }}
  className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-50 border"
>
  Gerenciamento de agendas
  <span className="block text-[11px] text-gray-500">
    Configurar agendas de aulas e reservas
  </span>
</button>


        {/* Tipos de Cobrança */}
        <button
  onClick={() => {
    closeMenu();
    setShowTiposCobranca(true);
  }}
  className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-50 border"
>
  Tipos de cobrança
  <span className="block text-[11px] text-gray-500">
    Mensalidades e aulas
  </span>
</button>

        {/* Outras cobranças - atalho */}
        <button
          onClick={() => {
            closeMenu();
            // router.push("/admin/outras-cobrancas");
            alert("Outras cobranças: em seguida criamos o card/registro (encordoamento, aluguel...).");
          }}
          className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-50 border"
        >
          Outras cobranças
          <span className="block text-[11px] text-gray-500">
            Registrar serviços avulsos
          </span>
        </button>

        {/* Financeiro */}
<button
  onClick={() => {
    closeMenu();
    setAbaSelecionada("financeiro"); // se você já usa esse switch no renderConteudo()
    setResponsavelSelecionadoId(null);
    setEditando(false);
  }}
  className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-50 border"
>
  Financeiro
  <span className="block text-[11px] text-gray-500">
    Visão geral de cobranças e recebimentos
  </span>
</button>

      

         {/* Gerenciamento de permissões */}
  <button
    onClick={() => {
      closeMenu();
      setShowGerenciamento(true);
    }}
    className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-50 border"
  >
    Permissões
    <span className="block text-[11px] text-gray-500">
      Regras de acesso por perfil
    </span>
  </button>


      </nav>
    </aside>
  </div>
)}


{/* Cards resumo clicáveis */}
<section className="grid gap-4 sm:grid-cols-4">
{/* Card Aulas (Agenda) */}
<button
  onClick={() => {
    setAbaSelecionada("agenda");
    setAgendaSelecionadaId(null);        // 👍 força escolher a 1ª agenda ativa de aulas/híbrida
    setResponsavelSelecionadoId(null);
    setEditando(false);
  }}
  className={`text-left font-bold bg-white rounded-2xl shadow p-4 border-2 ${
    abaSelecionada === "agenda"
      ? "border-black"
      : "border-transparent hover:border-gray-300"
  }`}
>
  <div className="text-sm text-gray-500">Aulas</div>
  <div className="text-2xl font-bold text-gray-900">
    {aulasHoje.length}
  </div>
  <div className="text-xs text-gray-400 mt-1">
    Gerenciar todas as aulas
  </div>
</button>

{/* Card Reservas de quadra */}
<button
  onClick={() => {
    setAbaSelecionada("reservasQuadra");
    setAgendaSelecionadaId(null);        // 👍 idem para reservas
    setResponsavelSelecionadoId(null);
    setEditando(false);
  }}
  className={`text-left font-bold bg-white rounded-2xl shadow p-4 border-2 ${
    abaSelecionada === "reservasQuadra"
      ? "border-black"
      : "border-transparent hover:border-gray-300"
  }`}
>
  <div className="text-sm text-gray-500">Reservas de quadra</div>
  <div className="text-2xl font-bold text-gray-900">
    0 {/* depois podemos trocar por contador real */}
  </div>
  <div className="text-xs text-gray-400 mt-1">
    Ver agenda de locações
  </div>
</button>


  {/* Card Alunos */}
  <button
    onClick={() => {
      setAbaSelecionada("alunos");
      setResponsavelSelecionadoId(null);
      setEditando(false);
    }}
    className={`text-left font-bold bg-white rounded-2xl shadow p-4 border-2 ${
      abaSelecionada === "alunos"
        ? "border-black"
        : "border-transparent hover:border-gray-300"
    }`}
  >
    <div className="text-sm text-gray-500">Alunos</div>
    <div className="text-2xl font-bold text-gray-900">
      {alunos.filter((a) => a.status === "ativo").length}
    </div>
    <div className="text-xs text-gray-400 mt-1">
      Todos alunos
    </div>
  </button>

  {/* Card Responsáveis */}
  <button
    onClick={() => {
      setAbaSelecionada("responsaveis");
      // mantém selecionado se já estiver
    }}
    className={`text-left font-bold bg-white rounded-2xl shadow p-4 border-2 ${
      abaSelecionada === "responsaveis"
        ? "border-black"
        : "border-transparent hover:border-gray-300"
    }`}
  >
    <div className="text-sm text-gray-500">
      Responsáveis
    </div>
    <div className="text-2xl font-bold text-gray-900">
      {familias.length}
    </div>
    <div className="text-xs text-gray-400 mt-1">
      Visualizar e gerenciar
    </div>
  </button>
</section>

{/* Conteúdo da aba selecionada */}
{renderConteudo()}
</div>
          
    {/* Modais */}
{ModalEditarAluno()}

{/* Modal de Modalidades (import dinâmico correto) */}
{showModalidades && (
  <ModalidadesModal
    onClose={() => setShowModalidades(false)}
    onChanged={(items) => setModalidades(items)}
  />
)}


{/* Modal NOVO ALUNO */}
{showNovoAluno && (
  <ModalNovoAluno
    familias={familias}
    onClose={() => setShowNovoAluno(false)}
    onSaved={(alunoSalvo: Aluno) => {
  setAlunos((prev: Aluno[]) => [...prev, alunoSalvo]);
    }}
  />
)}

{showPerfis && (
  <ModalPerfisList
    onClose={() => setShowPerfis(false)}
    onChanged={(items) => {
      // se quiser sincronizar em um estado global
      // setPerfis(items);
    }}
  />
)}

{showPlanosList && (
  <ModalPlanosAulaList
    onClose={() => setShowPlanosList(false)}
    onChanged={() => {}}
  />
)}


{showProfList && (
  <ModalProfessoresList
    onClose={() => setShowProfList(false)}
    onChanged={(items) => {
      // opcional: se quiser sincronizar com um estado global/local
      setProfessores(items);
    }}
  />
)}

{showLocais && (
  <ModalLocaisList
    onClose={() => setShowLocais(false)}
    onChanged={() => {
      // opcional: se quiser refletir em estados locais
      // (o ModalAulaForm já lê "locais" direto do Firestore)
    }}
  />
)}

{showTiposCobranca && (
  <ModalTiposCobrancaList
    onClose={() => setShowTiposCobranca(false)}
    onChanged={() => {}}
  />
)}

{showGerenciamento && (
  <ModalPermissoesRoles onClose={() => setShowGerenciamento(false)} />
)}

{showAgendas && (
  <ModalAgendasList
    onClose={() => setShowAgendas(false)}
  />
)}


{showAulaForm && (
  <ModalAulaForm
    modo={modoAulaForm}
    aulaInicial={aulaSelecionada}
    diaDefault={diaDefault}
    horaInicioDefault={horaDefault}
    alunosAtivos={alunosAtivos}        // do seu estado/consulta
    professores={professores}          // idem
    modalidades={modalidades}          // idem
    agendaSelecionada={agendaSelecionada} // a agenda atual
    onClose={() => {
      setShowAulaForm(false);
      setAulaSelecionada(null);
    }}
    onSaved={(aulaSalva) => {
      // atualiza lista global:
      setTodasAulas((prev) => {
        const idx = prev.findIndex((a) => a.id === aulaSalva.id);
        if (idx === -1) return [...prev, aulaSalva];
        const copia = [...prev];
        copia[idx] = aulaSalva;
        return copia;
      });
    }}
  />
)}

{aulaSelecionadaDetalhe && (
  <ModalDetalheAula
    aula={aulaSelecionadaDetalhe}
    onFechar={() => setAulaSelecionadaDetalhe(null)}
    onEditar={(aula) => editarAula(aula)}
    onExcluir={(aula) => {
      console.log("🗑 onExcluir recebeu no painel:", aula.id);

      const repetirId = (aula as any)?.repetirId;

      // 👉 Se NÃO é recorrente, exclui direto
      if (!repetirId) {
        excluirAula(aula);
        return;
      }

      // 👉 Se é recorrente, abre o modal bonitinho com 3 opções
      setAulaParaExcluir(aula);
      setShowConfirmExclusao(true);
    }}
  />
)}

{/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE AULA RECORRENTE */}
{showConfirmExclusao && aulaParaExcluir && (
  <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">
        Excluir aula recorrente
      </h2>

      <p className="text-sm text-gray-700">
        Esta aula faz parte de uma recorrência. O que você deseja fazer?
      </p>

      <div className="bg-gray-50 border rounded-xl p-3 text-xs text-gray-700 space-y-1">
        <div>
          <span className="font-semibold">Data:</span>{" "}
          {aulaParaExcluir.data || "—"}
        </div>
        <div>
          <span className="font-semibold">Horário:</span>{" "}
          {aulaParaExcluir.horaInicio || "—"}{" "}
          {aulaParaExcluir.horaFim
            ? `– ${aulaParaExcluir.horaFim}`
            : ""}
        </div>
        <div>
          <span className="font-semibold">Aluno(s):</span>{" "}
          {Array.isArray(aulaParaExcluir.alunosNomes) &&
          aulaParaExcluir.alunosNomes.length > 0
            ? aulaParaExcluir.alunosNomes.join(", ")
            : "—"}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        {/* Somente esta aula */}
        <button
          type="button"
          onClick={async () => {
            await excluirAula(aulaParaExcluir, "so-esta");
            setShowConfirmExclusao(false);
            setAulaParaExcluir(null);
          }}
          className="flex-1 rounded-xl px-4 py-2 text-xs font-semibold bg-white border border-gray-300 text-gray-800 hover:bg-gray-50"
        >
          Somente esta aula
        </button>

        {/* Esta aula e as futuras */}
        <button
          type="button"
          onClick={async () => {
            await excluirAula(aulaParaExcluir, "esta-e-futuras");
            setShowConfirmExclusao(false);
            setAulaParaExcluir(null);
          }}
          className="flex-1 rounded-xl px-4 py-2 text-xs font-semibold bg-red-600 text-white hover:bg-red-700"
        >
          Esta aula e as futuras
        </button>
      </div>

      {/* Cancelar */}
      <button
        type="button"
        onClick={() => {
          setShowConfirmExclusao(false);
          setAulaParaExcluir(null);
        }}
        className="w-full mt-1 rounded-xl px-4 py-2 text-xs font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300"
      >
        Cancelar
      </button>
    </div>
  </div>
)}


  </main>
);
}
