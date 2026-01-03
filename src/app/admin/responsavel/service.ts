import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  getDocs,
  query,
  where,
  limit,
  getDoc, // 👈 NOVO
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { normalizeCpf, normalizeEmail } from "../../../utils/normalize";

export type ResponsavelInput = {
  nome: string;
  cpf: string;
  email: string;
  telefone?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  ativo?: boolean;
};

// ---------- helpers de sync com Auth (via API route) ----------

async function syncAuthAfterCreateResponsavel(params: {
  email: string;
  nome: string;
}) {
  try {
    await fetch("/api/admin/responsaveis/sync-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        email: params.email,
        nome: params.nome,
      }),
    });
  } catch (err) {
    console.error("Falha ao sincronizar responsável com Auth (create):", err);
  }
}

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
    console.error("Falha ao sincronizar responsável com Auth (updateEmail):", err);
  }
}

// -------------------------------------------------------------

export async function createResponsavel(input: ResponsavelInput) {
  const cpf = normalizeCpf(input.cpf);
  const email = normalizeEmail(input.email);
  if (!cpf) throw new Error("CPF é obrigatório.");
  if (!email) throw new Error("Email é obrigatório.");

  const colResp = collection(db, "responsaveis");

  // Pré-checagem por query (pega colisões em docs que ainda não possuem índices unique_*).
  {
    const dupByEmail = await getDocs(
      query(colResp, where("emailNorm", "==", email), limit(1))
    );
    if (!dupByEmail.empty)
      throw new Error("Já existe um responsável com este email.");

    const dupByCpf = await getDocs(
      query(colResp, where("cpfNorm", "==", cpf), limit(1))
    );
    if (!dupByCpf.empty)
      throw new Error("Já existe um responsável com este CPF.");
  }

  const uniqueCpfRef = doc(db, "unique_cpf", cpf);
  const uniqueEmailRef = doc(db, "unique_email", email);
  const newRespRef = doc(colResp); // id automático

  await runTransaction(db, async (tx) => {
    // Checagem forte via índices únicos (atômica)
    const cpfDoc = await tx.get(uniqueCpfRef);
    if (cpfDoc.exists()) throw new Error("Já existe um responsável com este CPF.");

    const emailDoc = await tx.get(uniqueEmailRef);
    if (emailDoc.exists())
      throw new Error("Já existe um responsável com este email.");

    // Cria responsável (sempre com normalizados)
    tx.set(newRespRef, {
      nome: input.nome.trim(),
      cpf,
      cpfNorm: cpf,
      email,
      emailNorm: email,
      telefone: input.telefone || "",
      endereco: input.endereco || "",
      numero: input.numero || "",
      complemento: input.complemento || "",
      ativo: input.ativo !== false,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });

    // Reserva índices únicos
    tx.set(uniqueCpfRef, { responsavelId: newRespRef.id });
    tx.set(uniqueEmailRef, { responsavelId: newRespRef.id });
  });

  // 🔹 Depois que deu tudo certo no Firestore, sincroniza com Auth
  // (se falhar aqui, o cadastro continua existindo; só loga erro no console)
  syncAuthAfterCreateResponsavel({
    email,
    nome: input.nome.trim(),
  });

  return { id: newRespRef.id };
}

export async function updateResponsavel(
  responsavelId: string,
  next: ResponsavelInput
) {
  const cpf = normalizeCpf(next.cpf);
  const email = normalizeEmail(next.email);
  if (!cpf) throw new Error("CPF é obrigatório.");
  if (!email) throw new Error("Email é obrigatório.");

  const respRef = doc(db, "responsaveis", responsavelId);
  const colResp = collection(db, "responsaveis");

  // 🧩 Busca o estado atual do responsável para saber o email antigo
  const currentSnap = await getDoc(respRef);
  if (!currentSnap.exists()) {
    throw new Error("Responsável não encontrado.");
  }
  const current = currentSnap.data() as any;
  const currentCpf = String(current.cpf || "");
  const currentEmailRaw = String(current.email || current.emailNorm || "");
  const currentEmailNorm = normalizeEmail(currentEmailRaw);

  // Pré-checagem por query (evita custo de iniciar a transação à toa)
  {
    const dupByEmail = await getDocs(
      query(colResp, where("emailNorm", "==", email), limit(1))
    );
    if (!dupByEmail.empty && dupByEmail.docs[0].id !== responsavelId) {
      throw new Error("Já existe um responsável com este email.");
    }

    const dupByCpf = await getDocs(
      query(colResp, where("cpfNorm", "==", cpf), limit(1))
    );
    if (!dupByCpf.empty && dupByCpf.docs[0].id !== responsavelId) {
      throw new Error("Já existe um responsável com este CPF.");
    }
  }

  const uniqueCpfRef = doc(db, "unique_cpf", cpf);
  const uniqueEmailRef = doc(db, "unique_email", email);

  await runTransaction(db, async (tx) => {
    // Aqui usamos os valores "currentCpf" e "currentEmailNorm" já lidos acima

    // Se CPF mudou, reserva o novo e libera o antigo
    if (cpf !== currentCpf) {
      const cpfDoc = await tx.get(uniqueCpfRef);
      if (cpfDoc.exists())
        throw new Error("Já existe um responsável com este CPF.");

      if (currentCpf) {
        tx.delete(doc(db, "unique_cpf", currentCpf));
      }
      tx.set(uniqueCpfRef, { responsavelId });
    }

    // Se email mudou, reserva o novo e libera o antigo
    if (email !== currentEmailNorm) {
      const emailDoc = await tx.get(uniqueEmailRef);
      if (emailDoc.exists())
        throw new Error("Já existe um responsável com este email.");

      if (currentEmailNorm) {
        tx.delete(doc(db, "unique_email", currentEmailNorm));
      }
      tx.set(uniqueEmailRef, { responsavelId });
    }

    // Atualiza doc principal sempre com normalizados
    tx.update(respRef, {
      nome: next.nome.trim(),
      cpf,
      cpfNorm: cpf,
      email,
      emailNorm: email,
      telefone: next.telefone || "",
      endereco: next.endereco || "",
      numero: next.numero || "",
      complemento: next.complemento || "",
      atualizadoEm: serverTimestamp(),
    });
  });

  // 🔹 Se o email mudou, sincroniza com Authentication
  if (email !== currentEmailNorm) {
    syncAuthAfterUpdateEmail({
      oldEmail: currentEmailNorm,
      newEmail: email,
    });
  }

  return { id: responsavelId };
}
