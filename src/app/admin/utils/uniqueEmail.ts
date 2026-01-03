// utils/uniqueEmail.ts
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";

export function normalizeEmailStrict(v: string) {
  return (v || "").trim().toLowerCase();
}

/**
 * Cria um PROFESSOR garantindo e-mail único globalmente.
 * - Cria doc em /unique_email_global/{emailLower}
 * - Cria doc em /professores/{novoId}
 * Tudo na MESMA transação (atômico).
 */
export async function createProfessorWithUniqueEmail(data: {
  nome: string;
  telefone?: string;
  email: string;
  ativo?: boolean;
}) {
  const emailLower = normalizeEmailStrict(data.email);
  if (!emailLower) throw new Error("EMAIL_INVALIDO");

  const uniqueRef = doc(db, "unique_email_global", emailLower);
  const profRef = doc(collection(db, "professores")); // gera ID novo

  await runTransaction(db, async (tx) => {
    const uniqueSnap = await tx.get(uniqueRef);
    if (uniqueSnap.exists()) {
      throw new Error("EMAIL_TAKEN"); // já está reservado por alguém
    }

    // Reserva o e-mail
    tx.set(uniqueRef, {
      ownerCollection: "professores",
      ownerId: profRef.id,
      createdAt: serverTimestamp(),
    });

    // Cria o professor
    tx.set(profRef, {
      id: profRef.id,
      nome: data.nome.trim(),
      telefone: (data.telefone || "").trim(),
      email: emailLower,
      emailLower,
      ativo: data.ativo ?? true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return { id: profRef.id };
}

/**
 * Edita PROFESSOR com possível troca de e-mail, mantendo unicidade.
 * - Se trocar e-mail, remove a reserva antiga e reserva a nova.
 * - Atualiza o professor.
 */
export async function updateProfessorWithUniqueEmail(params: {
  profId: string;
  prevEmail: string; // o e-mail atual (antes da edição)
  newData: {
    nome?: string;
    telefone?: string;
    email: string; // novo e-mail
    ativo?: boolean;
  };
}) {
  const { profId, prevEmail, newData } = params;
  const prevLower = normalizeEmailStrict(prevEmail);
  const nextLower = normalizeEmailStrict(newData.email);
  if (!nextLower) throw new Error("EMAIL_INVALIDO");

  const profRef = doc(db, "professores", profId);
  const prevUniqueRef = prevLower
    ? doc(db, "unique_email_global", prevLower)
    : null;
  const nextUniqueRef = doc(db, "unique_email_global", nextLower);

  await runTransaction(db, async (tx) => {
    // Se e-mail mudou, libera o antigo e reserva o novo
    if (prevLower !== nextLower) {
      // 1) Checa e apaga a reserva antiga (se pertencer a este professor)
      if (prevUniqueRef) {
        const prevSnap = await tx.get(prevUniqueRef);
        if (prevSnap.exists()) {
          const d = prevSnap.data() as any;
          if (d.ownerCollection === "professores" && d.ownerId === profId) {
            tx.delete(prevUniqueRef);
          }
        }
      }

      // 2) Checa e cria a reserva nova
      const nextSnap = await tx.get(nextUniqueRef);
      if (nextSnap.exists()) {
        throw new Error("EMAIL_TAKEN");
      }
      tx.set(nextUniqueRef, {
        ownerCollection: "professores",
        ownerId: profId,
        createdAt: serverTimestamp(),
      });
    }

    // 3) Atualiza o professor
    tx.update(profRef, {
      ...(newData.nome !== undefined ? { nome: newData.nome.trim() } : {}),
      ...(newData.telefone !== undefined
        ? { telefone: (newData.telefone || "").trim() }
        : {}),
      email: nextLower,
      emailLower: nextLower,
      ...(newData.ativo !== undefined ? { ativo: newData.ativo } : {}),
      updatedAt: serverTimestamp(),
    });
  });
}
