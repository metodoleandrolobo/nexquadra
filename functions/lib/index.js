"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.manter5SemanasRecorrentes = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
// helpers
function isoDateBR(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`; // "YYYY-MM-DD"
}
function addDays(d, days) {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
}
exports.manter5SemanasRecorrentes = (0, scheduler_1.onSchedule)({
    schedule: "0 21 * * 0", // domingo 21:00
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
}, async () => {
    const hojeISO = isoDateBR(new Date());
    const JANELA = 5;
    // 1) pega as séries recorrentes existentes (repetirId)
    //    (limitamos a recorrentes ativas; ajuste se quiser incluir desativadas)
    const snapRec = await db
        .collection("aulas")
        .where("recorrente", "==", true)
        .where("repetirId", "!=", "")
        .limit(2000)
        .get();
    if (snapRec.empty)
        return;
    const series = new Set();
    snapRec.docs.forEach((d) => {
        const rid = d.data().repetirId;
        if (rid)
            series.add(rid);
    });
    // 2) para cada série, garante 5 à frente
    for (const repetirId of series) {
        // (a) aulas futuras dessa série
        const futurasSnap = await db
            .collection("aulas")
            .where("repetirId", "==", repetirId)
            .where("data", ">=", hojeISO)
            .orderBy("data", "asc")
            .get();
        const futuras = futurasSnap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
        const faltam = Math.max(0, JANELA - futuras.length);
        if (faltam === 0)
            continue;
        // (b) pega a última aula existente da série (maior data)
        const ultimaSnap = await db
            .collection("aulas")
            .where("repetirId", "==", repetirId)
            .orderBy("data", "desc")
            .limit(1)
            .get();
        if (ultimaSnap.empty)
            continue;
        const modelo = ultimaSnap.docs[0].data();
        // baseDate = data da última aula (YYYY-MM-DD)
        const [yy, mm, dd] = String(modelo.data).split("-").map(Number);
        if (!yy || !mm || !dd)
            continue;
        let cursor = new Date(yy, mm - 1, dd);
        // cria faltantes: sempre +7 dias
        for (let i = 0; i < faltam; i++) {
            cursor = addDays(cursor, 7);
            const dataNova = isoDateBR(cursor);
            // evita duplicar se já existir (segurança)
            const existeSnap = await db
                .collection("aulas")
                .where("repetirId", "==", repetirId)
                .where("data", "==", dataNova)
                .limit(1)
                .get();
            if (!existeSnap.empty)
                continue;
            const novo = Object.assign(Object.assign({}, modelo), { data: dataNova, 
                // mantém “janela” registrada
                repetirJanelaSemanas: JANELA, 
                // limpa conteúdo específico (igual você faz no i>0)
                atividadePlanoId: "", atividadeTitulo: "", atividadeTexto: "", observacao: "", 
                // timestamps (você usa ISO string no app)
                criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() });
            // IMPORTANTÍSSIMO: não copiar ID, nem campos internos estranhos
            delete novo.id;
            await db.collection("aulas").add(novo);
        }
    }
});
//# sourceMappingURL=index.js.map