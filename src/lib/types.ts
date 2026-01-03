export type UID = string;

export type Responsavel = {
  id: string;
  nome: string;
  email?: string;
};

export type Aluno = {
  id: string;
  nome: string;
  responsavelId: string;
  ativo: boolean;
};

export type Aula = {
  id: string;
  alunoId: string;
  data: string; // ISO date
  modalidade?: string; // tenis / beach
  professor?: string;
  valor?: number; // R$
};

export type Pagamento = {
  id: string;
  responsavelId: string;
  data: string; // ISO date
  valor: number; // R$
  descricao?: string;
};

export type PainelData = {
  responsavel?: Responsavel | null;
  alunos: Aluno[];
  aulas: Aula[];
  pagamentos: Pagamento[];
};