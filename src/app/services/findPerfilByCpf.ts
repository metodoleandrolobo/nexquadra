// src/app/services/findPerfilByCpf.ts
import {
  collection,
  getDocs,
  query,
  where,
  limit,
  DocumentData,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { NexquadraRole } from "../admin/types";

export type ColecaoOrigem = "users" | "responsaveis" | "professores";

export type PerfilPorCpf = {
  id: string;
  email: string;
  tipo: NexquadraRole;
  colecao: ColecaoOrigem;
  data: DocumentData;
};

function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

export async function findPerfilByCpf(
  cpfDigitado: string
): Promise<PerfilPorCpf | null> {
  const cpf = normalizeCpf(cpfDigitado);
  if (!cpf || cpf.length !== 11) return null;

  // 1) users -> gestor / coordenador
  {
    const qUsers = query(
      collection(db, "users"),
      where("cpf", "==", cpf),
      limit(1)
    );
    const snapUsers = await getDocs(qUsers);

    if (!snapUsers.empty) {
      const docSnap = snapUsers.docs[0];
      const data = docSnap.data() as DocumentData;
      const email = String(data.email || "").toLowerCase().trim();
      if (!email) return null;

      const role: NexquadraRole = (data.role as NexquadraRole) ?? "gestor";

      return {
        id: docSnap.id,
        email,
        tipo: role,
        colecao: "users",
        data,
      };
    }
  }

  // 2) responsaveis -> "responsavel"
  {
    const qResp = query(
      collection(db, "responsaveis"),
      where("cpf", "==", cpf),
      limit(1)
    );
    const snapResp = await getDocs(qResp);

    if (!snapResp.empty) {
      const docSnap = snapResp.docs[0];
      const data = docSnap.data() as DocumentData;
      const email = String(data.email || "").toLowerCase().trim();
      if (!email) return null;

      return {
        id: docSnap.id,
        email,
        tipo: "responsavel",
        colecao: "responsaveis",
        data,
      };
    }
  }

  // 3) professores -> "professores" | "secretaria" | "coordenador"
  {
    const qProf = query(
      collection(db, "professores"),
      where("cpf", "==", cpf),
      limit(1)
    );
    const snapProf = await getDocs(qProf);

    if (!snapProf.empty) {
      const docSnap = snapProf.docs[0];
      const data = docSnap.data() as DocumentData;
      const email = String(data.email || "").toLowerCase().trim();
      if (!email) return null;

      const role: NexquadraRole =
        (data.role as NexquadraRole) ?? "professores";

      return {
        id: docSnap.id,
        email,
        tipo: role,
        colecao: "professores",
        data,
      };
    }
  }

  return null;
}
