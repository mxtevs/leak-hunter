import { TelegramClient, errors } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import Database from 'better-sqlite3';
import fs from "fs";
import path from "path";

// --- CONFIGURAÇÕES ---
const db = new Database('downloads.db');
const downloadFolder = "./downloads_concluidos";
const MIN_SPEED_KBS = 300;
const SPEED_CHECK_SEC = 5;
const WORKERS = 2;

// Garante a existência do diretório de destino
if (!fs.existsSync(downloadFolder)) {
    fs.mkdirSync(downloadFolder, { recursive: true });
}

// Configuração de proxy (requer campo 'ip' para GramJS)
const proxyOptions = process.env.PROXY_HOST ? {
    ip: process.env.PROXY_HOST,
    port: parseInt(process.env.PROXY_PORT),
    socksType: 5,
    username: process.env.PROXY_USER,
    password: process.env.PROXY_PASS,
} : null;

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const stringSession = new StringSession(process.env.TG_SESSION_1);

async function main() {
    const client = new TelegramClient(stringSession, apiId, apiHash, { 
        connectionRetries: 5,
        proxy: proxyOptions 
    });

    try {
        await client.connect();
        const me = await client.getMe();
        console.log(`\n[+] CONECTADO: ${me.firstName} | IP: ${process.env.PROXY_HOST || 'Direto'}`);

        // Recupera apenas registros pendentes ordenados por DC e tamanho
        const tarefas = db.prepare("SELECT * FROM arquivos WHERE status = 'pendente' ORDER BY dc_id ASC, tamanho ASC").all();
        if (tarefas.length === 0) process.exit(0);

        for (const arquivo of tarefas) {
            // Normaliza o nome do arquivo para evitar erros no sistema de arquivos
            const nomeSanitizado = arquivo.nome_arquivo.replace(/[\\/:*?"<>|]/g, '_');
            const pathFinal = path.join(downloadFolder, nomeSanitizado);
            let startTime = Date.now(), lastDownloaded = 0;

            console.log(`\n[DC ${arquivo.dc_id}] Baixando: ${nomeSanitizado}`);

            try {
                const result = await client.getMessages(arquivo.id_grupo, { ids: [parseInt(arquivo.id_mensagem)] });
                if (!result[0]?.media) continue;

                await client.downloadMedia(result[0].media, {
                    outputFile: pathFinal,
                    workers: WORKERS,
                    progressCallback: (downloaded, total) => {
                        const now = Date.now();
                        const elapsed = (now - startTime) / 1000;
                        
                        if (elapsed >= SPEED_CHECK_SEC) {
                            const bytesNovos = Number(downloaded) - lastDownloaded;
                            const velocidadeAtual = (bytesNovos / 1024 / elapsed).toFixed(2);
                            process.stdout.write(`\r   -> Velocidade: ${velocidadeAtual} KB/s | ${((Number(downloaded)/Number(total))*100).toFixed(0)}% `);

                            // Monitoramento de performance: aborta se a velocidade estiver abaixo do limite
                            if (parseFloat(velocidadeAtual) <= MIN_SPEED_KBS && downloaded > 1024 * 500) { 
                                console.error(`\n\n[!] LENTIDÃO: ${velocidadeAtual} KB/s. Trocando conta...`);
                                process.exit(42); 
                            }
                            startTime = Date.now();
                            lastDownloaded = Number(downloaded);
                        }
                    }
                });

                // Atualiza banco de dados após conclusão bem-sucedida
                db.prepare("UPDATE arquivos SET status = 'concluido' WHERE id_mensagem = ? AND id_grupo = ?").run(arquivo.id_mensagem, arquivo.id_grupo);
            } catch (err) {
                // Em caso de FloodWait, encerra para rotação de conta
                if (err instanceof errors.FloodWaitError) process.exit(42);
                console.error(`\n[!] Erro: ${err.message}`);
            }
        }
    } catch (err) {
        console.error("\n[!] Erro fatal:", err.message);
        process.exit(1);
    } finally {
        await client.disconnect();
    }
}

main();