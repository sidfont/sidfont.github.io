const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mercadopago = require('mercadopago');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configurar Mercado Pago
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN || 'SEU_TOKEN_AQUI'
});

// ===== ARMAZENAR DADOS =====
let maquinas = [];
let historicoPagamentos = [];

// ===== SERVIR ARQUIVOS DA PASTA PUBLIC =====
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ===== WEB SOCKET — A BOX SE CONECTA =====
wss.on('connection', (ws) => {
  let idMaquina = null;
  let nomeMaquina = '';

  ws.on('message', (mensagem) => {
    try {
      const dados = JSON.parse(mensagem);
      
      // A ESP32 se apresenta
      if ( dados.tipo === 'identificacao' ) {
        idMaquina = dados.id || 'maquina-' + Date.now();
        nomeMaquina = dados.nome || 'Máquina ' + idMaquina;
        
        // Registra ou atualiza a máquina
        const indice = maquinas.findIndex(m => m.id === idMaquina);
        if ( indice === -1 ) {
          maquinas.push({
            id: idMaquina,
            nome: nomeMaquina,
            online: true,
            ultimoPagamento: '---',
            valorDia: 0,
            ws: ws
          });
        } else {
          maquinas[indice].online = true;
          maquinas[indice].ws = ws;
        }
        
        console.log(`📦✅ ${nomeMaquina} conectou!`);
        ws.send(JSON.stringify({ mensagem: 'Servidor conectado!' }));
      }
    } catch (erro) {
      // Mensagem simples, não é JSON
    }
  });

  ws.on('close', () => {
    if ( idMaquina ) {
      const maq = maquinas.find(m => m.id === idMaquina);
      if ( maq ) {
        maq.online = false;
        console.log(`📦❌ ${maq.nome} desconectou`);
      }
    }
  });
});

// ===== FUNÇÃO: ENVIAR PULSOS PARA A BOX =====
function enviarParaBox(idMaquina, pulsos) {
  const maq = maquinas.find(m => m.id === idMaquina && m.online);
  if ( maq && maq.ws && maq.ws.readyState === WebSocket.OPEN ) {
    maq.ws.send(JSON.stringify({ pulsos: pulsos }));
    console.log(`📤 ${pulsos} pulsos → ${maq.nome}`);
    return true;
  }
  console.log(`❌ Máquina ${idMaquina} não está disponível`);
  return false;
}

// ===== CALCULAR PULSOS PELO VALOR =====
function calcularPulsos(valor) {
  if ( valor >= 50 ) return 50;
  if ( valor >= 20 ) return 20;
  if ( valor >= 10 ) return 10;
  if ( valor >= 5 ) return 5;
  if ( valor >= 2 ) return 2;
  return Math.round(valor);
}

// ===== REGISTRAR PAGAMENTO =====
function registrarPagamento(idMaquina, valor, pulsos) {
  const agora = new Date().toLocaleString('pt-BR');
  
  historicoPagamentos.unshift({
    data: agora,
    valor: valor,
    pulsos: pulsos,
    maquina: idMaquina
  });

  // Atualiza valor do dia
  const maq = maquinas.find(m => m.id === idMaquina);
  if ( maq ) {
    maq.valorDia += valor;
    maq.ultimoPagamento = agora.split(', ')[1];
  }
}

// ===== WEBHOOK DO MERCADO PAGO =====
app.post('/webhook/mercadopago', async (req, res) => {
  console.log('📩 Webhook recebido:', req.body);

  try {
    const { type, status, data } = req.body;

    if ( type === 'payment' && status === 'approved' ) {
      const pagamento = await mercadopago.payment.findById(data.id);
      const valor = pagamento.body.transaction_amount;
      const pulsos = calcularPulsos(valor);
      
      console.log(`💰 Pagamento aprovado! R$ ${valor} → ${pulsos} pulsos`);
      
      // Envia para TODAS as máquinas online (você pode mudar isso depois)
      maquinas.filter(m => m.online).forEach(m => {
        enviarParaBox(m.id, pulsos);
        registrarPagamento(m.id, valor, pulsos);
      });
    }
    
    res.sendStatus(200);
  } catch (erro) {
    console.error('❌ Erro no webhook:', erro);
    res.sendStatus(500);
  }
});

// ===== API DO PAINEL =====
app.get('/api/dados', (req, res) => {
  const totalDia = maquinas.reduce((soma, m) => soma + m.valorDia, 0);
  res.json({
    maquinas: maquinas.map(m => ({
      id: m.id,
      nome: m.nome,
      online: m.online,
      valorDia: m.valorDia,
      ultimoPagamento: m.ultimoPagamento
    })),
    totalDia: totalDia
  });
});

app.post('/api/pulso', (req, res) => {
  const { id, pulsos } = req.body;
  const sucesso = enviarParaBox(id, pulsos);
  res.json({ sucesso: sucesso });
});

// ===== INICIAR SERVIDOR =====
const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => {
  console.log(`🚀 Servidor rodando na porta ${PORTA}`);
  console.log(`🌐 Painel: ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORTA}/login.html`);
});
