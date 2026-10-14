const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors({ origin: '*' })); // Garante que o painel web consiga acessar o servidor
app.use(express.json());

// 1. CADASTRO OFICIAL DAS SUAS 11 MÁQUINAS
// Substitua os tokens pelos códigos reais de cada caixa no Blynk
let jukeboxes = [
    { id: "box_01", nome: "Radiola Sidney 01", blynkToken: "TOKEN_BOX_01", faturamento: 0 },
    { id: "box_02", nome: "Radiola Sidney 02", blynkToken: "TOKEN_BOX_02", faturamento: 0 },
    { id: "box_03", nome: "Radiola Sidney 03", blynkToken: "TOKEN_BOX_03", faturamento: 0 },
    { id: "box_04", nome: "Radiola Sidney 04", blynkToken: "TOKEN_BOX_04", faturamento: 0 },
    { id: "box_05", nome: "Radiola Sidney 05", blynkToken: "TOKEN_BOX_05", faturamento: 0 }, // Ex: Sua máquina de testes
    { id: "box_06", nome: "Radiola Sidney 06", blynkToken: "TOKEN_BOX_06", faturamento: 0 },
    { id: "box_07", nome: "Radiola Sidney 07", blynkToken: "TOKEN_BOX_07", faturamento: 0 },
    { id: "box_08", nome: "Radiola Sidney 08", blynkToken: "TOKEN_BOX_08", faturamento: 0 },
    { id: "box_09", nome: "Radiola Sidney 09", blynkToken: "TOKEN_BOX_09", faturamento: 0 },
    { id: "box_10", nome: "Radiola Sidney 10", blynkToken: "TOKEN_BOX_10", faturamento: 0 },
    { id: "box_11", nome: "Radiola Sidney 11", blynkToken: "TOKEN_BOX_11", faturamento: 0 }
];

// 2. ROTA QUE O SEU PAINEL WEB VAI CONSULTAR
// Ela varre todas as máquinas, checa o status no Blynk e calcula as comissões na hora
app.get('/api/painel-geral', async (req, res) => {
    let relatorioModificado = [];

    for (let box of jukeboxes) {
        let statusOnline = false;
        
        try {
            // Pergunta para o Blynk se o ESP32 específico daquela máquina está conectado
            const urlBlynk = `https://blynk.cloud{box.blynkToken}`;
            const response = await axios.get(urlBlynk, { timeout: 3000 });
            statusOnline = response.data; // Retorna true ou false
        } catch (error) {
            statusOnline = false; // Se o Blynk falhar ou der timeout, assume offline
        }

        // Realiza o cálculo exato da comissão (metade para cada) para o acerto de 15/30 dias
        let comissaoCliente = box.faturamento * 0.50;
        let parteSidney = box.faturamento * 0.50;

        relatorioModificado.push({
            id: box.id,
            nome: box.nome,
            status: statusOnline ? "ONLINE" : "OFFLINE",
            faturamentoTotal: box.faturamento,
            comissaoCliente: comissaoCliente,
            parteSidney: parteSidney
        });
    }

    res.json(relatorioModificado);
});

// 3. ROTA PARA DAR PULSO MANUAL DIRETO DO PAINEL DE CONTROLE
app.post('/api/pulsar-manual', async (req, res) => {
    const { idMaquina, quantidadePulsos } = req.body;
    const box = jukeboxes.find(b => b.id === idMaquina);

    if (!box) {
        return res.status(404).json({ error: "Máquina não encontrada" });
    }

    try {
        // Envia os pulsos diretamente para o pino V1 do Blynk da máquina selecionada
        const urlPulsar = `https://blynk.cloud{box.blynkToken}&v1=${quantidadePulsos}`;
        await axios.get(urlPulsar);
        res.json({ success: true, message: `Injetados ${quantidadePulsos} pulsos na máquina ${box.nome}` });
    } catch (error) {
        res.status(500).json({ error: "Falha ao enviar comando para o Blynk" });
    }
});

// Inicialização do servidor na porta padrão do Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor central das Jukeboxes rodando na porta ${PORT}`);
});
