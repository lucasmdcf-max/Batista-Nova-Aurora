/**
 * Script de Envio Automático da Agenda Diária via WhatsApp (CallMeBot)
 * Congregação Batista Nova Aurora
 *
 * Executado diariamente às 07:00 (10:00 UTC) pelo GitHub Actions
 * Destinatário: 5581994990084
 */

const TARGET_PHONE = process.env.PHONE_NUMBER || '5581994990084';
const PROJECT_ID = 'batista-nova-aurora';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Extrai valor de um campo do Firestore REST API
function extractValue(field) {
  if (!field) return '';
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.integerValue !== undefined) return field.integerValue;
  if (field.timestampValue !== undefined) return field.timestampValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  return '';
}

// Converte campos do documento Firestore REST para objeto JS simples
function parseFirestoreDoc(doc) {
  const result = { id: doc.name ? doc.name.split('/').pop() : '' };
  if (doc.fields) {
    for (const [key, val] of Object.entries(doc.fields)) {
      result[key] = extractValue(val);
    }
  }
  return result;
}

// Obtém as datas de hoje no fuso horário do Brasil (America/Sao_Paulo)
function getTodayDates() {
  const now = new Date();
  const formatterBR = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const todayBR = formatterBR.format(now); // "16/10/2026"

  const [d, m, y] = todayBR.split('/');
  const todayISO = `${y}-${m}-${d}`; // "2026-10-16"

  const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long'
  });
  const rawWeekday = weekdayFormatter.format(now);
  const weekday = rawWeekday.charAt(0).toUpperCase() + rawWeekday.slice(1);

  return { todayBR, todayISO, weekday };
}

// Normaliza strings de data para ISO
function normalizeToISO(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return '';
}

// Busca documentos de uma coleção via REST API
async function fetchCollection(collectionName) {
  try {
    const res = await fetch(`${FIRESTORE_BASE}/${collectionName}`);
    if (!res.ok) {
      console.warn(`[Firestore] Status ${res.status} ao consultar ${collectionName}`);
      return [];
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.documents)) return [];
    return data.documents.map(parseFirestoreDoc);
  } catch (err) {
    console.error(`[Firestore] Erro ao buscar ${collectionName}:`, err.message);
    return [];
  }
}

// Busca API Key do CallMeBot (Environment Variable ou Firestore)
async function getApiKey() {
  if (process.env.CALLMEBOT_APIKEY && process.env.CALLMEBOT_APIKEY.trim() !== '') {
    return process.env.CALLMEBOT_APIKEY.trim();
  }

  // Tenta buscar no Firestore caso tenha sido salva nas configurações
  try {
    const res = await fetch(`${FIRESTORE_BASE}/configuracoes/whatsapp`);
    if (res.ok) {
      const data = await res.json();
      const doc = parseFirestoreDoc(data);
      if (doc.apikey && String(doc.apikey).trim() !== '') {
        return String(doc.apikey).trim();
      }
    }
  } catch (_) {}

  return null;
}

// Monta a mensagem formatada para WhatsApp
function buildMessage({ todayBR, weekday, programacoes, visitas }) {
  const lines = [];

  lines.push(`☀️ *AGENDA DO DIA — NOVA AURORA*`);
  lines.push(`📅 *${weekday}, ${todayBR}*\n`);

  // 1. Programações
  lines.push(`📋 *PROGRAMAÇÕES DA IGREJA:*`);
  if (programacoes.length === 0) {
    lines.push(`_Nenhuma programação especial registrada para hoje._\n`);
  } else {
    programacoes.forEach((prog) => {
      const hora = prog.horario ? `${prog.horario} - ` : '';
      const titulo = prog.titulo || prog.nome || 'Programação';
      lines.push(`• *${hora}${titulo}*`);
      if (prog.local) {
        lines.push(`  📍 Local: ${prog.local}`);
      }
    });
    lines.push('');
  }

  // 2. Visitas Agendadas
  lines.push(`🤝 *VISITAS AGENDADAS:*`);
  if (visitas.length === 0) {
    lines.push(`_Nenhuma visita agendada para hoje._\n`);
  } else {
    visitas.forEach((v) => {
      const hora = v.horario ? `${v.horario} - ` : '';
      lines.push(`• *${hora}${v.nome}*`);
      if (v.telefone) {
        lines.push(`  📱 WhatsApp: ${v.telefone}`);
      }
      if (v.endereco) {
        lines.push(`  📍 Endereço: ${v.endereco}`);
      }
    });
    lines.push('');
  }

  lines.push(`_Que Deus abençoe ricamente todas as atividades e vidas alcançadas no dia de hoje!_ 🙏✨`);

  return lines.join('\n');
}

// Envio para a API do CallMeBot
async function sendWhatsApp(phone, message, apiKey) {
  const encodedText = encodeURIComponent(message);
  const cleanPhone = String(phone).replace(/\D/g, '');
  const url = `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodedText}&apikey=${apiKey}`;

  console.log(`[WhatsApp] Disparando para +${cleanPhone}...`);

  const response = await fetch(url);
  const responseText = await response.text();

  if (response.ok && !responseText.toLowerCase().includes('error')) {
    console.log('[WhatsApp] Mensagem enviada com sucesso! Resposta:', responseText);
    return true;
  } else {
    console.error('[WhatsApp] Falha no envio pelo CallMeBot. Detalhes:', responseText);
    return false;
  }
}

async function main() {
  console.log('=== Iniciando Verificação Diária da Agenda Nova Aurora ===');
  const { todayBR, todayISO, weekday } = getTodayDates();
  console.log(`Data de Hoje: ${weekday}, ${todayBR} (ISO: ${todayISO})`);

  // 1. Busca dados do Firestore
  const [allProgramacoes, allVisitas] = await Promise.all([
    fetchCollection('programacoes'),
    fetchCollection('solicitacoes_visita')
  ]);

  console.log(`Total encontrado no banco: ${allProgramacoes.length} programações, ${allVisitas.length} visitas.`);

  // 2. Filtra atividades marcadas para hoje
  const programacoesHoje = allProgramacoes.filter((p) => {
    const iso = normalizeToISO(p.dataISO || p.data);
    return iso === todayISO || p.data === todayBR;
  });

  const visitasHoje = allVisitas.filter((v) => {
    const iso = normalizeToISO(v.dataISO || v.data);
    return iso === todayISO || v.data === todayBR;
  });

  console.log(`Atividades de Hoje: ${programacoesHoje.length} programações, ${visitasHoje.length} visitas.`);

  // 3. Monta a mensagem
  const mensagem = buildMessage({
    todayBR,
    weekday,
    programacoes: programacoesHoje,
    visitas: visitasHoje
  });

  console.log('\n--- PRÉVIA DA MENSAGEM ---');
  console.log(mensagem);
  console.log('---------------------------\n');

  // 4. Obtém API Key e envia
  const apiKey = await getApiKey();
  if (!apiKey) {
    console.warn('[AVISO] Chave do CallMeBot (CALLMEBOT_APIKEY) não configurada!');
    console.log(`Para ativar o envio para o número +${TARGET_PHONE}:`);
    console.log(`1. Adicione o contato do CallMeBot no WhatsApp (+34 941 87 23 88)`);
    console.log(`2. Envie a mensagem: I allow callmebot to send me messages`);
    console.log(`3. O robô responderá com seu código de API (ex: 123456)`);
    console.log(`4. Adicione essa chave nos Secrets do GitHub como CALLMEBOT_APIKEY`);
    return;
  }

  await sendWhatsApp(TARGET_PHONE, mensagem, apiKey);
}

main().catch((err) => {
  console.error('[ERRO FATAL]', err);
  process.exit(1);
});
