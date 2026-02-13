import { spawnSync } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// --- CONFIGURAÇÕES DO GERENCIADOR ---
const LOG_FILE = 'stats_uso.txt';
const PAUSA_RESFRIAMENTO_MIN = 15; // Intervalo de espera caso ambas as contas limitem a velocidade
const TOTAL_CONTAS = 2;            // Configuração atual para duas contas em rodízio

function registrarLog(mensagem) {
    const timestamp = new Date().toLocaleString();
    const logMsg = `[${timestamp}] ${mensagem}\n`;
    fs.appendFileSync(LOG_FILE, logMsg);
    console.log(logMsg.trim());
}

async function iniciarRodizio() {
    let indiceAtual = 1; // Início do ciclo pela primeira conta
    registrarLog("[+] Sistema Leak Hunter: Iniciando Gerenciador de Rodízio com 2 Contas.");

    while (true) {
        // Valida a existência da sessão no ambiente
        const sessaoAtual = process.env[`TG_SESSION_${indiceAtual}`];
        
        if (!sessaoAtual) {
            registrarLog(`[!] Erro: TG_SESSION_${indiceAtual} não encontrada. Reiniciando ciclo...`);
            indiceAtual = 1;
            continue;
        }

        console.log(`\n${"=".repeat(50)}`);
        registrarLog(`[#] CONTA ATIVA: #${indiceAtual} | IP: ${process.env[`P${indiceAtual}_HOST`]}`);
        console.log(`${"=".repeat(50)}\n`);

        // Executa o downloader injetando as credenciais e o proxy da conta da vez
        const resultado = spawnSync('node', ['downloader.js'], {
            env: { 
                ...process.env, 
                TG_SESSION_1: sessaoAtual,
                PROXY_HOST: process.env[`P${indiceAtual}_HOST`],
                PROXY_PORT: process.env[`P${indiceAtual}_PORT`],
                PROXY_USER: process.env[`P${indiceAtual}_USER`],
                PROXY_PASS: process.env[`P${indiceAtual}_PASS`]
            },
            stdio: 'inherit' // Redireciona a saída do processo filho para o terminal principal
        });

        const statusSaida = resultado.status;

        // Gestão de fluxo baseada no código de saída do processo filho
        if (statusSaida === 42) {
            // Código 42 indica lentidão ou FloodWait detectado pelo downloader
            registrarLog(`[!] Conta #${indiceAtual} limitada por velocidade/flood. Alternando...`);
            
            indiceAtual++;

            // Se atingir o limite de contas, reinicia o índice e aplica o tempo de resfriamento
            if (indiceAtual > TOTAL_CONTAS) {
                registrarLog(`[#] Ciclo completo. Todas as contas entraram em repouso.`);
                registrarLog(`[#] Aguardando ${PAUSA_RESFRIAMENTO_MIN} minutos para liberação de IP e sessões...`);
                
                indiceAtual = 1;
                await new Promise(resolve => setTimeout(resolve, PAUSA_RESFRIAMENTO_MIN * 60 * 1000));
            }
        } else if (statusSaida === 0) {
            // Código 0 indica que a fila foi totalmente processada
            registrarLog("[+] Fila de downloads concluída. Sem pendências no banco de dados.");
            break; 
        } else {
            // Tratamento de falhas críticas ou encerramentos inesperados
            registrarLog(`[!] Downloader interrompido (Erro: ${statusSaida}). Próxima tentativa em 10s...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
            indiceAtual = (indiceAtual % TOTAL_CONTAS) + 1;
        }
    }

    registrarLog("[+] Processamento finalizado.");
}

iniciarRodizio();