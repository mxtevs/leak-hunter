import { TelegramClient, errors } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import Database from 'better-sqlite3';
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// --- CONFIGURAÇÕES DE PERFORMANCE E MONITORAMENTO ---
const db = new Database('downloads.db');
const downloadFolder = "./downloads_concluidos";
const MIN_SPEED_KBS = 150;      // Velocidade mínima (KB/s) antes de encerrar
const SPEED_CHECK_SEC = 5;      // Intervalo de verificação da velocidade
const WORKERS = 2;              // Padrão de segurança para evitar blocks rápidos

if (!fs.existsSync(downloadFolder)) {
    fs.mkdirSync(downloadFolder, { recursive: true });
}

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const stringSession = new StringSession(process.env.TG_SESSION_1);

const buscarPendentes = db.prepare(`
    SELECT * FROM arquivos 
    WHERE status = 'pendente' 
    ORDER BY dc_id ASC, tamanho ASC
`);

const atualizarStatus = db.prepare(`
    UPDATE arquivos SET status = ? 
    WHERE id_mensagem = ? AND id_grupo = ?
`);

async function main() {
    const client = new TelegramClient(stringSession, apiId, apiHash, { 
        connectionRetries: 5 
    });

    try {
        await client.connect();
        console.log("✅ Downloader conectado.");

        const tarefas = buscarPendentes.all();
        console.log(`📂 Fila: ${tarefas.length} arquivos.`);

        for (const arquivo of tarefas) {
            const nomeSanitizado = arquivo.nome_arquivo.replace(/[\\/:*?"<>|]/g, '_');
            const pathFinal = path.join(downloadFolder, nomeSanitizado);

            let startTime = Date.now();
            let lastDownloaded = 0;

            console.log(`\n[DC ${arquivo.dc_id}] Baixando: ${nomeSanitizado}`);

            try {
                const result = await client.getMessages(arquivo.id_grupo, { 
                    ids: [parseInt(arquivo.id_mensagem)] 
                });

                if (!result[0]?.media) {
                    atualizarStatus.run('erro_midia', arquivo.id_mensagem, arquivo.id_grupo);
                    continue;
                }

                await client.downloadMedia(result[0].media, {
                    outputFile: pathFinal,
                    workers: WORKERS,
                    progressCallback: (downloaded, total) => {
                        const now = Date.now();
                        const elapsed = (now - startTime) / 1000;
                        
                        if (elapsed >= SPEED_CHECK_SEC) {
                            const bytesNovos = Number(downloaded) - lastDownloaded;
                            const velocidadeAtual = (bytesNovos / 1024 / elapsed).toFixed(2);
                            const percent = ((Number(downloaded) / Number(total)) * 100).toFixed(0);
                            
                            process.stdout.write(`\r   -> Velocidade: ${velocidadeAtual} KB/s | ${percent}% `);

                            // INTERRUPÇÃO POR LENTIDÃO:
                            // Verifica apenas após baixar pelo menos 500KB para evitar oscilações do início
                            if (velocidadeAtual < MIN_SPEED_KBS && downloaded > 1024 * 500) { 
                                console.error(`\n\n🛑 INTERRUPÇÃO: Velocidade insuficiente (${velocidadeAtual} KB/s).`);
                                console.log("Log: A conta atingiu o limite de tráfego prioritário e está lenta.");
                                process.exit(0); 
                            }

                            startTime = Date.now();
                            lastDownloaded = Number(downloaded);
                        }
                    }
                });

                process.stdout.write(`\n✅ Sucesso.\n`);
                atualizarStatus.run('concluido', arquivo.id_mensagem, arquivo.id_grupo);

            } catch (err) {
                if (err instanceof errors.FloodWaitError) {
                    console.error(`\n🛑 FLOODWAIT: Aguarde ${err.seconds} segundos.`);
                    process.exit(0);
                } else {
                    console.error(`\n❌ Erro: ${err.message}`);
                    atualizarStatus.run('erro_download', arquivo.id_mensagem, arquivo.id_grupo);
                }
            }
        }
    } catch (err) {
        console.error("❌ Erro fatal:", err.message);
    } finally {
        await client.disconnect();
    }
}

main();