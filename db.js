import Database from 'better-sqlite3';

function criarBanco() {
    // Abre ou cria o banco de dados de forma síncrona
    const db = new Database('downloads.db', { verbose: console.log });

    try {
        // Criamos a tabela com a estrutura final
        // Adicione a coluna dc_id na criação da tabela
        db.exec(`
            CREATE TABLE IF NOT EXISTS arquivos (
            id_mensagem INTEGER,
            id_grupo TEXT,
            nome_arquivo TEXT,
            tamanho INTEGER,
            dc_id INTEGER, -- Nova coluna!
            status TEXT DEFAULT 'pendente',
            PRIMARY KEY (id_mensagem, id_grupo)
        )
    `);

        console.log("\n✅ Banco de dados e tabela preparados com sucesso!");
    } catch (err) {
        console.error("❌ Erro ao configurar o banco:", err.message);
    } finally {
        db.close();
    }
}

criarBanco();