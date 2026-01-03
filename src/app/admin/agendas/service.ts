// src/app/admin/agendas/service.ts
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";

export type AgendaTipo = "aulas" | "reservas" | "hibrida";

// configuração detalhada por dia (0=Dom, 1=Seg, ..., 6=Sáb)
export type DiaDetalhado = {
  ativo: boolean;
  inicio: string;           // "08:00"
  fim: string;              // "22:00"
  intervaloMinutos: number; // 30, 60 etc.
};

export type AgendaConfig = {
  id: string;
  nome: string;
  tipo: AgendaTipo;          // "aulas" | "reservas" | "hibrida"
  publica: boolean;          // se pode aparecer em página pública/link
  ativo: boolean;            // se está ativa

  professorId?: string | null;
  professorNome?: string;

  localId?: string | null;
  localNome?: string;

  modalidadeId?: string | null;
  modalidadeNome?: string;

  // campos agregados (resumo, compatíveis com versão antiga)
  diasSemana: number[];      // 0=Dom, 1=Seg, ... 6=Sáb
  horaInicio: string;        // "08:00"
  horaFim: string;           // "22:00"
  intervaloMinutos: number;  // 30, 60, etc.

  // nova estrutura detalhada por dia (opcional)
  diasDetalhados?: DiaDetalhado[];

  criadoEm?: any;
  atualizadoEm?: any;
};

const COL = "agendasConfig";

export async function listAgendas(): Promise<AgendaConfig[]> {
  const q = query(collection(db, COL), orderBy("nome", "asc"));
  const snap = await getDocs(q);
  const out: AgendaConfig[] = [];
  snap.forEach((d) => {
    const data = d.data() as any;

    // campos agregados (velho formato)
    const diasSemana = Array.isArray(data.diasSemana)
      ? data.diasSemana.map((n: any) => Number(n))
      : [];

    const horaInicio = data.horaInicio ?? "08:00";
    const horaFim = data.horaFim ?? "22:00";
    const intervaloMinutos = Number(data.intervaloMinutos ?? 60);

    // tentar ler estrutura detalhada (se já existir)
    let diasDetalhados: DiaDetalhado[] | undefined;
    if (Array.isArray(data.diasDetalhados)) {
      diasDetalhados = data.diasDetalhados.map((dd: any) => ({
        ativo: dd.ativo !== false,
        inicio: dd.inicio ?? horaInicio,
        fim: dd.fim ?? horaFim,
        intervaloMinutos: Number(
          dd.intervaloMinutos ?? intervaloMinutos ?? 60
        ),
      }));
    }

    out.push({
      id: d.id,
      nome: data.nome ?? "",
      tipo: (data.tipo as AgendaTipo) ?? "aulas",
      publica: !!data.publica,
      ativo: data.ativo !== false,

      professorId: data.professorId ?? null,
      professorNome: data.professorNome ?? "",

      localId: data.localId ?? null,
      localNome: data.localNome ?? "",

      modalidadeId: data.modalidadeId ?? null,
      modalidadeNome: data.modalidadeNome ?? "",

      diasSemana,
      horaInicio,
      horaFim,
      intervaloMinutos,

      diasDetalhados,

      criadoEm: data.criadoEm,
      atualizadoEm: data.atualizadoEm,
    });
  });
  return out;
}

export async function createAgenda(
  fields: Omit<AgendaConfig, "id" | "criadoEm" | "atualizadoEm">
) {
  const now = serverTimestamp();

  // se vierem diasDetalhados do formulário, salvamos;
  // se não, só omitimos (compatível com versão antiga)
  const diasDetalhadosToSave = Array.isArray(fields.diasDetalhados)
    ? fields.diasDetalhados.map((dd) => ({
        ativo: dd.ativo !== false,
        inicio: dd.inicio || fields.horaInicio || "08:00",
        fim: dd.fim || fields.horaFim || "22:00",
        intervaloMinutos: dd.intervaloMinutos || fields.intervaloMinutos || 60,
      }))
    : undefined;

  const ref = await addDoc(collection(db, COL), {
    nome: fields.nome.trim(),
    tipo: fields.tipo,
    publica: !!fields.publica,
    ativo: fields.ativo !== false,

    professorId: fields.professorId || null,
    professorNome: fields.professorNome || "",

    localId: fields.localId || null,
    localNome: fields.localNome || "",

    modalidadeId: fields.modalidadeId || null,
    modalidadeNome: fields.modalidadeNome || "",

    diasSemana: fields.diasSemana || [],
    horaInicio: fields.horaInicio || "08:00",
    horaFim: fields.horaFim || "22:00",
    intervaloMinutos: fields.intervaloMinutos || 60,

    ...(diasDetalhadosToSave ? { diasDetalhados: diasDetalhadosToSave } : {}),

    criadoEm: now,
    atualizadoEm: now,
  });
  return ref.id;
}

export async function updateAgenda(
  id: string,
  fields: Partial<Omit<AgendaConfig, "id">>
) {
  const ref = doc(db, COL, id);
  const payload: any = {
    atualizadoEm: serverTimestamp(),
  };

  if (fields.nome !== undefined) payload.nome = fields.nome.trim();
  if (fields.tipo !== undefined) payload.tipo = fields.tipo;
  if (fields.publica !== undefined) payload.publica = !!fields.publica;
  if (fields.ativo !== undefined) payload.ativo = !!fields.ativo;

  if (fields.professorId !== undefined)
    payload.professorId = fields.professorId || null;
  if (fields.professorNome !== undefined)
    payload.professorNome = fields.professorNome || "";

  if (fields.localId !== undefined) payload.localId = fields.localId || null;
  if (fields.localNome !== undefined) payload.localNome = fields.localNome || "";

  if (fields.modalidadeId !== undefined)
    payload.modalidadeId = fields.modalidadeId || null;
  if (fields.modalidadeNome !== undefined)
    payload.modalidadeNome = fields.modalidadeNome || "";

  if (fields.diasSemana !== undefined)
    payload.diasSemana = fields.diasSemana || [];
  if (fields.horaInicio !== undefined) payload.horaInicio = fields.horaInicio;
  if (fields.horaFim !== undefined) payload.horaFim = fields.horaFim;
  if (fields.intervaloMinutos !== undefined)
    payload.intervaloMinutos = fields.intervaloMinutos;

  if (fields.diasDetalhados !== undefined) {
    payload.diasDetalhados = Array.isArray(fields.diasDetalhados)
      ? fields.diasDetalhados.map((dd) => ({
          ativo: dd.ativo !== false,
          inicio: dd.inicio,
          fim: dd.fim,
          intervaloMinutos: dd.intervaloMinutos,
        }))
      : [];
  }

  await updateDoc(ref, payload);
}

export async function deleteAgenda(id: string) {
  await deleteDoc(doc(db, COL, id));
}
