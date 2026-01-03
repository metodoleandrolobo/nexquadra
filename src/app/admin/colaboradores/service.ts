// src/app/admin/colaboradores/service.ts
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  getDocs,
  query,
  where,
  limit,
  getDoc,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { normalizeEmail } from "../../../utils/normalize";

export type ColaboradorUpdateInput = {
  telefone: string;
  email: string;
  funcao: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
};

// ---------- helpers de sync com Auth (reuso da rota já existente) ----------

async function syncAuthAfterUpdateEmail(params: {
  oldEmail: string;
  newEmail: string;
}) {
  try {
    await fetch("/api/admin/responsaveis/sync-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateEmail",
        oldEmail: params.oldEmail,
        newEmail: params.newEmail,
      }),
    });
  } catch (err) {
    console.error(
      "Falha ao sincronizar colaborador com Auth (updateEmail):",
      err
    );
  }
}

// -------------------------------------------------------------

/**
 * Atualiza colaborador/professor:
 * - valida e normaliza email
 * - garante que não existe outro professor com o mesmo email
 * - atualiza doc em "professores"
 * - mantém índice único em "unique_email_global"
 * - sincroniza email no Authentication (via API existente)
 */
export async function updateColaborador(
  colaboradorId: string,
  next: ColaboradorUpdateInput
) {
  const email = normalizeEmail(next.email);
  if (!email) throw new Error("Email é obrigatório.");

  const profRef = doc(db, "professores", colaboradorId);
  const colProf = collection(db, "professores");

  // 🧩 Busca estado atual do colaborador/professor
  const currentSnap = await getDoc(profRef);
  if (!currentSnap.exists()) {
    throw new Error("Colaborador não encontrado.");
  }
  const current = currentSnap.data() as any;

  const currentEmailRaw = String(current.email || current.emailNorm || "");
  const currentEmailNorm = normalizeEmail(currentEmailRaw);

  // -------- Pré-checagem: evitar iniciar transação se já existe outro com mesmo email --------
  {
    const dupByEmail = await getDocs(
      query(colProf, where("emailNorm", "==", email), limit(1))
    );
    if (!dupByEmail.empty && dupByEmail.docs[0].id !== colaboradorId) {
      throw new Error("Já existe um colaborador com este email.");
    }
  }

  const uniqueEmailRef = doc(db, "unique_email_global", email);

  await runTransaction(db, async (tx) => {
    // Se email mudou, reserva o novo e libera o antigo na coleção global
    if (email !== currentEmailNorm) {
      const emailDoc = await tx.get(uniqueEmailRef);
      if (emailDoc.exists()) {
        throw new Error("Já existe um cadastro com este email.");
      }

      if (currentEmailNorm) {
        // remove índice antigo, se existir
        tx.delete(doc(db, "unique_email_global", currentEmailNorm));
      }

      // reserva novo índice global
      tx.set(uniqueEmailRef, {
        perfilId: colaboradorId,
        tipoPerfil: "professor",
      });
    }

    // Atualiza doc principal
    tx.update(profRef, {
      // nome e cpf não mudam aqui
      email,
      emailNorm: email,
      telefone: next.telefone || "",
      funcao: next.funcao || current.funcao || "",
      cep: next.cep || "",
      endereco: next.endereco || "",
      numero: next.numero || "",
      complemento: next.complemento || "",
      atualizadoEm: serverTimestamp(),
    });
  });

  // 🔹 Se o email mudou, sincroniza com Authentication via API genérica
  if (email !== currentEmailNorm) {
    await syncAuthAfterUpdateEmail({
      oldEmail: currentEmailNorm,
      newEmail: email,
    });
  }

  return { id: colaboradorId };
}
