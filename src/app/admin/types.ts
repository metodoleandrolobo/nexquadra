// src/app/admin/types.ts

export type Aula = {
  id: string;

  data: string;
  horaInicio: string;
  horaFim: string;

  professorId: string;
  professorNome?: string;

  localId: string;
  localNome?: string;

  tipoId?: string;
  tipoNome?: string;
  tipoCobranca?: string;
  valorPrevisto?: number;

  modalidadeId?: string;
  modalidadeNome?: string;

  alunosIds?: string[];
  alunosNomes?: string[];

  atividadeFonte?: "manual" | "plano";
  atividadePlanoId?: string;
  atividadeTitulo?: string;
  atividadeTexto?: string;
  observacao?: string;

  // 🔹 VÍNCULO COM AGENDA
  agendaId?: string | null;
  agendaNome?: string;

  // 🔹 RECORRÊNCIA
  recorrente?: boolean;
  repetirId?: string;
  repetirJanelaSemanas?: number;

  // 🔹 CONTROLE
  ativa?: boolean;
  tipoGrupo?: "exclusiva" | "compartilhada";
  capacidadeMaxima?: number;

  // 🔹 REFERÊNCIA PARA FINANCEIRO / OUTRAS TABELAS
  referenciaTipo?: string;   // <<<<<< ADICIONE ESTA LINHA

  criadoEm?: string;
  atualizadoEm?: string;
};


// -------------------- Professor --------------------
export type Professor = {
  id: string;
  nome: string;
  telefone?: string;
  ativo: boolean;
  cor?: string;
};

//-------------------- Alunos --------------------
export type StatusAluno = "ativo" | "inativo";

export type Aluno = {
  id: string;
  nome: string;
  cpf?: string;
  telefone?: string;
  email?: string;
  nascimento?: string;

  cep?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;

  observacoes?: string;
  status: StatusAluno; // ✅ VOLTA PRA UNION
  responsavelId: string;
};

export type Responsavel = {
  id: string;
  nome: string;
  cpf?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  ativo: boolean;
};

export type Familia = {
  responsavel: Responsavel;
  alunos: Aluno[];
};

//-----------Gestão (modelo antigo / atual em uso)----------------

export type Role = "gestor" | "professor" | "responsavel";

export type UserDoc = {
  id: string;
  nome: string;
  email: string;
  role: Role;
  status: "ativo" | "inativo";
  alunosVinculados?: string[]; // usados para responsáveis
  createdAt?: number;
  updatedAt?: number;
};

export const ROLE_LABEL: Record<Role, string> = {
  gestor: "Gestor",
  professor: "Professor",
  responsavel: "Responsável",
};

export const ROLE_ORDER: Role[] = ["gestor", "professor", "responsavel"];

// =======================================================
// 🔹 NOVO MODELO DE ROLES DO NEXQUADRA (SEM QUEBRAR O ANTIGO)
// =======================================================

export type NexquadraRole =
  | "gestor"
  | "coordenador"
  | "professores"
  | "secretaria"
  | "responsavel"
  | "aluno";

export type NexquadraPerfilTipo = NexquadraRole;

// Pode ser usado como base para qualquer perfil autenticado
export interface BasePerfil {
  id: string;
  authUid: string;
  nome: string;
  email: string;
  cpf: string;
  role: NexquadraRole;
  status: "ativo" | "inativo";
}

// Gestor e Coordenador (nível topo)
export interface GestorPerfil extends BasePerfil {
  role: "gestor" | "coordenador";
}

// Responsável (pai/mãe/tutor/pagador)
export interface ResponsavelPerfil extends BasePerfil {
  role: "responsavel";
}

// Professores / Secretaria / Coordenador operacional
export type ProfessorFuncao = "professor" | "secretaria" | "coordenador";

export interface ProfessorPerfil extends BasePerfil {
  role: "professores" | "secretaria" | "coordenador";
  funcao: ProfessorFuncao;
}

// Aluno (pode ou não ter authUid no começo)
export interface AlunoPerfil {
  id: string;
  nome: string;
  cpf?: string;
  role?: "aluno";
  responsavelId: string;
}

// Labels e ordem para o novo modelo
export const NEXQUADRA_ROLE_LABEL: Record<NexquadraRole, string> = {
  gestor: "Gestor",
  coordenador: "Coordenador",
  professores: "Professores",
  secretaria: "Secretaria",
  responsavel: "Responsável",
  aluno: "Aluno",
};

export const NEXQUADRA_ROLE_ORDER: NexquadraRole[] = [
  "gestor",
  "coordenador",
  "professores",
  "secretaria",
  "responsavel",
  "aluno",
];
