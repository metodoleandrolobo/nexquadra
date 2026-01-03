// app/api/admin/responsaveis/sync-auth/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "../../../../../lib/firebaseAdmin"; // 👈 ajuste o caminho se estiver diferente

type BodyCreate = {
  action: "create";
  email: string;
  nome?: string;
};

type BodyUpdateEmail = {
  action: "updateEmail";
  oldEmail: string;
  newEmail: string;
};

type Body = BodyCreate | BodyUpdateEmail;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;

    if (body.action === "create") {
      const email = body.email.trim().toLowerCase();
      const nome = (body.nome || "").trim();

      if (!email) {
        throw new Error("Email é obrigatório para action=create.");
      }

      // 1) Verifica se já existe usuário com esse email
      try {
        await adminAuth.getUserByEmail(email);
        // Já existe: não faz nada
        console.log("[sync-auth] Usuário já existe em Auth:", email);
      } catch (err: any) {
        if (err?.code === "auth/user-not-found") {
          // 2) Cria usuário com senha aleatória
          const tempPassword = Math.random().toString(36).slice(-10);
          await adminAuth.createUser({
            email,
            password: tempPassword,
            displayName: nome || email,
            emailVerified: false,
            disabled: false,
          });
          console.log("[sync-auth] Usuário criado em Auth:", email);
        } else {
          throw err;
        }
      }

      return NextResponse.json({ ok: true });
    }

    if (body.action === "updateEmail") {
      const oldEmail = body.oldEmail.trim().toLowerCase();
      const newEmail = body.newEmail.trim().toLowerCase();

      if (!oldEmail || !newEmail) {
        throw new Error("oldEmail e newEmail são obrigatórios.");
      }
      if (oldEmail === newEmail) {
        return NextResponse.json({ ok: true, skipped: true });
      }

      let user;

      try {
        // tenta encontrar pelo email antigo
        user = await adminAuth.getUserByEmail(oldEmail);
      } catch (err: any) {
        if (err?.code === "auth/user-not-found") {
          // se não achou pelo antigo, tenta pelo novo (caso já tenha sido alterado)
          try {
            user = await adminAuth.getUserByEmail(newEmail);
          } catch (err2: any) {
            if (err2?.code === "auth/user-not-found") {
              // não existe mesmo → cria usuário novo
              const tempPassword = Math.random().toString(36).slice(-10);
              user = await adminAuth.createUser({
                email: newEmail,
                password: tempPassword,
                emailVerified: false,
                disabled: false,
              });
              console.log(
                "[sync-auth] Usuário criado em Auth durante updateEmail:",
                newEmail
              );
            } else {
              throw err2;
            }
          }
        } else {
          throw err;
        }
      }

      // se achamos o usuário, atualiza email
      if (user) {
        await adminAuth.updateUser(user.uid, {
          email: newEmail,
        });
        console.log(
          "[sync-auth] Email atualizado no Auth:",
          oldEmail,
          "→",
          newEmail
        );
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, error: "Action inválida." },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[sync-auth] Erro:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro interno." },
      { status: 500 }
    );
  }
}
