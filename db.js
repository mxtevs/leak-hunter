import Database from 'better-sqlite3';

function criarBanco() {
    // Abre ou cria o arquivo do banco de dados
    const db = new Database('downloads.db', { verbose: console.log });

    try {
        // Cria a tabela se ela ainda não existir
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

        console.log("\n[+] Banco de dados e tabela preparados com sucesso!");
    } catch (err) {
        console.error("[!] Erro ao configurar o banco:", err.message);
    } finally {
        // Fecha a conexão para evitar travamentos
        db.close();
    }
}

criarBanco();