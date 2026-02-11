import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input"; // Para receber o código SMS
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

// Configurações do .env
const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const SESSION_FILE = "./session.txt"; // Onde guardaremos sua chave de acesso

// Tenta carregar uma sessão existente
let sessionKey = "";
if (fs.existsSync(SESSION_FILE)) {
    sessionKey = fs.readFileSync(SESSION_FILE, "utf8");
}

const stringSession = new StringSession(sessionKey);

(async () => {
    console.log("🚀 Iniciando a autenticação em Node.js...");

    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    // O método start() cuida de tudo: pede telefone, código SMS e senha (se tiver)
    await client.start({
        phoneNumber: async () => await input.text("Digite seu número (ex: +55819...): "),
        password: async () => await input.text("Digite sua senha (2FA) se houver: "),
        phoneCode: async () => await input.text("Digite o código recebido no Telegram: "),
        onError: (err) => console.log("❌ Erro:", err.message),
    });

    console.log("✅ Autenticação concluída!");
    
    // Salva a sessão para não precisar logar de novo
    const novaSessao = client.session.save();
    fs.writeFileSync(SESSION_FILE, novaSessao);
    
    const me = await client.getMe();
    console.log(`👤 Sucesso! Você está logado como: ${me.firstName}`);

    // Encerra a conexão para salvar os dados
    await client.disconnect();
    process.exit(0);
})();