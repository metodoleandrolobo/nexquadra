// src/app/api/perfil/atualizar/route.ts
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "../../../../lib/firebaseAdmin";

type PerfilTipo = "gestor" | "responsavel" | "professor";

function getCollectionByTipo(tipo: PerfilTipo): string {
  if (tipo === "gestor") return "users";
  if (tipo === "professor") return "professores";
  return "responsaveis";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      tipoPerfil,
      perfilId,
      telefone,
      email,
      cep,
      endereco,
      numero,
      complemento,
      funcao, // 👈 NOVO: para professor/colaborador
    } = body as {
      tipoPerfil: PerfilTipo;
      perfilId: string;
      telefone?: string;
      email?: string;
      cep?: string;
      endereco?: string;
      numero?: string;
      complemento?: string;
      funcao?: string;
    };

    if (!tipoPerfil || !perfilId) {
      return NextResponse.json(
        { error: "Perfil não identificado." },
        { status: 400 }
      );
    }

    const collectionName = getCollectionByTipo(tipoPerfil);
    const ref = adminDb.collection(collectionName).doc(perfilId);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Dados do perfil não encontrados." },
        { status: 404 }
      );
    }

    const current = snap.data() as any;

    const newEmailNorm = (email || current.email || "")
      .toString()
      .trim()
      .toLowerCase();

    const updates: any = {
      telefone: telefone ?? current.telefone ?? "",
      email: newEmailNorm,
      emailNorm: newEmailNorm,
      cep: cep ?? current.cep ?? "",
      endereco: endereco ?? current.endereco ?? "",
      numero: numero ?? current.numero ?? "",
      complemento: complemento ?? current.complemento ?? "",
      atualizadoEm: new Date(),
    };

    // 👇 NOVO: se for professor, também atualiza funcao
    if (tipoPerfil === "professor") {
      updates.funcao = funcao ?? current.funcao ?? "";
    }

    // ----- Atualiza Auth + coleções de email único se email mudou -----
    const currentEmailNorm = (current.emailNorm || current.email || "")
      .toString()
      .trim()
      .toLowerCase();

    if (newEmailNorm && newEmailNorm !== currentEmailNorm) {
      // 1) Atualiza no Authentication (se tiver authUid salvo)
      if (current.authUid) {
        await adminAuth.updateUser(current.authUid, {
          email: newEmailNorm,
        });
      }

      // 2) Atualiza coleções de email único
      if (tipoPerfil === "responsavel") {
        const uniqueColl = adminDb.collection("unique_email");
        if (currentEmailNorm) {
          await uniqueColl.doc(currentEmailNorm).delete().catch(() => {});
        }
        await uniqueColl.doc(newEmailNorm).set({ responsavelId: perfilId });
      } else {
        const uniqueGlobal = adminDb.collection("unique_email_global");
        if (currentEmailNorm) {
          await uniqueGlobal.doc(currentEmailNorm).delete().catch(() => {});
        }
        await uniqueGlobal.doc(newEmailNorm).set({
          perfilId,
          tipoPerfil,
        });
      }
    }

    // 3) Atualiza o documento principal
    await ref.update(updates);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Erro em /api/perfil/atualizar:", err);
    return NextResponse.json(
      { error: err?.message || "Erro ao atualizar perfil." },
      { status: 500 }
    );
  }
}
