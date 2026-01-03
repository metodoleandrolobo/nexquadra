//src/app/admin/modalidades/service.ts
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

export type Modalidade = {
  id: string;
  nome: string;
  ativo: boolean;
  criadoEm?: any;
  atualizadoEm?: any;
};

const COL = "modalidades";

export async function listModalidades(): Promise<Modalidade[]> {
  const q = query(collection(db, COL), orderBy("nome", "asc"));
  const snap = await getDocs(q);
  const out: Modalidade[] = [];
  snap.forEach((d) => {
    const data = d.data() as any;
    out.push({
      id: d.id,
      nome: data.nome ?? "",
      ativo: data.ativo !== false,
      criadoEm: data.criadoEm,
      atualizadoEm: data.atualizadoEm,
    });
  });
  return out;
}

export async function createModalidade(nome: string) {
  const ref = await addDoc(collection(db, COL), {
    nome: nome.trim(),
    ativo: true,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
  return ref.id;
}

export async function updateModalidade(id: string, fields: Partial<Modalidade>) {
  const ref = doc(db, COL, id);
  await updateDoc(ref, {
    ...(fields.nome !== undefined ? { nome: fields.nome.trim() } : {}),
    ...(fields.ativo !== undefined ? { ativo: !!fields.ativo } : {}),
    atualizadoEm: serverTimestamp(),
  });
}

export async function deleteModalidade(id: string) {
  await deleteDoc(doc(db, COL, id));
}
