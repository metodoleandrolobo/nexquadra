// src/app/services/findPerfilByEmail.ts
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";

export type PerfilTipo = "gestor" | "responsavel" | "colaborador";

type ResultadoPerfil = {
  tipo: PerfilTipo;
  id: string;
  data: any;
};

export async function findPerfilByEmail(
  email: string
): Promise<ResultadoPerfil | null> {
  const emailLimpo = email.trim().toLowerCase();

  const colecoes: { tipo: PerfilTipo; nome: string }[] = [
    { tipo: "gestor", nome: "users" },
    { tipo: "responsavel", nome: "responsaveis" },
    { tipo: "colaborador", nome: "professores" }, // 👈 AQUI É O PULO DO GATO
  ];

  for (const col of colecoes) {
    const q = query(collection(db, col.nome), where("email", "==", emailLimpo));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const docSnap = snap.docs[0];
      return {
        tipo: col.tipo,
        id: docSnap.id,
        data: docSnap.data(),
      };
    }
  }

  return null;
}
