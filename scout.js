import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import Database from 'better-sqlite3';
import dotenv from "dotenv";

dotenv.config();

// --- CONFIGURAÇÕES DO BANCO DE DADOS ---
const db = new Database('downloads.db');

// Cria a tabela garantindo a coluna dc_id para organizar os downloads
db.exec(`
    CREATE TABLE IF NOT EXISTS arquivos (
        id_mensagem INTEGER,
        id_grupo TEXT,
        nome_arquivo TEXT,
        tamanho INTEGER,
        dc_id INTEGER,
        status TEXT DEFAULT 'pendente',
        PRIMARY KEY (id_mensagem, id_grupo)
    )
`);

const salvarNoBanco = db.prepare(`
    INSERT OR IGNORE INTO arquivos (id_mensagem, id_grupo, nome_arquivo, tamanho, dc_id, status)
    VALUES (?, ?, ?, ?, ?, ?)
`);

// --- CONFIGURAÇÕES DO TELEGRAM ---
const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const stringSession = new StringSession(process.env.TG_SESSION_1);

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.log("\n[!] Uso: node scout.js NOME_OU_ID_DO_GRUPO");
        return;
    }

    const grupoAlvo = args[0];
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    try {
        await client.connect();
        console.log("[+] Conectado com sucesso!");

        // Localiza o grupo ou canal informado
        const entidade = await client.getEntity(grupoAlvo);
        
        // --- FORMATAÇÃO DO ID DO GRUPO ---
        let rawId = entidade.id.toString();
        let chatId = (entidade instanceof Api.Channel && entidade.megagroup)
            ? (rawId.startsWith("-100") ? rawId : `-100${rawId}`)
            : (rawId.startsWith("-") ? rawId : `-${rawId}`);

        console.log(`\n[#] Varrendo: ${entidade.title || 'Grupo'} [ID: ${chatId}]`);
        console.log("--------------------------------------------------");

        let encontrados = 0;
        let novos = 0;

        // Busca mensagens que contenham documentos e o termo ".txt"
        for await (const message of client.iterMessages(entidade, {
            search: ".txt",
            filter: new Api.InputMessagesFilterDocument(),
        })) {
            
            if (message.document) {
                // Extrai o nome real do arquivo nos metadados
                const attr = message.document.attributes.find(a => a instanceof Api.DocumentAttributeFilename);
                const nomeOriginal = attr ? attr.fileName : "arquivo_desconhecido.txt";

                if (nomeOriginal.toLowerCase().endsWith(".txt")) {
                    encontrados++;
                    
                    const dcId = message.document.dcId; // ID do servidor de arquivos do Telegram
                    const tamanho = Number(message.document.size);

                    const resultado = salvarNoBanco.run(
                        message.id, 
                        chatId, 
                        nomeOriginal, 
                        tamanho, 
                        dcId, 
                        'pendente'
                    );

                    // Conta apenas se o arquivo for novo no banco
                    if (resultado.changes > 0) {
                        novos++;
                    }

                    if (encontrados % 50 === 0) {
                        console.log(`[#] Analisados: ${encontrados} | Novos no Banco: ${novos}`);
                    }
                }
            }
        }

        console.log(`\n[+] Varredura Finalizada!`);
        console.log(`[#] Total de arquivos .txt encontrados: ${encontrados}`);
        console.log(`[#] Novos arquivos adicionados à fila: ${novos}`);

    } catch (err) {
        console.error("\n[!] Erro durante a varredura:", err.message);
    } finally {
        await client.disconnect();
        process.exit(0);
    }
}

main();