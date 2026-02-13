import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import dotenv from "dotenv";

dotenv.config();

// Configurações via .env
const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const stringSession = new StringSession(process.env.TG_SESSION_1);

(async () => {
    console.log("[#] Conectando ao Telegram...");
    
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    try {
        await client.connect();
        console.log("[+] Conectado com sucesso!\n");

        console.log(`${"NOME DO GRUPO".padEnd(35)} | ${"ID DO GRUPO"}`);
        console.log("-".repeat(60));

        // Pega todos os diálogos da conta
        const dialogs = await client.getDialogs({});

        for (const dialog of dialogs) {
            const entity = dialog.entity;

            // Identifica se é grupo simples
            const isGroup = entity instanceof Api.Chat;
            
            // Identifica se é supergrupo
            const isSupergroup = entity instanceof Api.Channel && entity.megagroup;

            if (isGroup || isSupergroup) {
                const title = entity.title || "Sem Título";
                let rawId = entity.id.toString();
                let formattedId = "";

                if (isSupergroup) {
                    // Ajusta o prefixo para o padrão de supergrupos
                    formattedId = rawId.startsWith("-100") ? rawId : `-100${rawId}`;
                } else {
                    // Ajusta o prefixo para grupos normais
                    formattedId = rawId.startsWith("-") ? rawId : `-${rawId}`;
                }

                console.log(`${title.substring(0, 35).padEnd(35)} | ${formattedId}`);
            }
        }

    } catch (error) {
        console.error("[!] Erro ao listar grupos:", error.message);
    } finally {
        await client.disconnect();
        console.log("\n[+] Processo finalizado.");
    }
})();