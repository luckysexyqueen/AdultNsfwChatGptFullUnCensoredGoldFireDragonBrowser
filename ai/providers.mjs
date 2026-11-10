import { koreanInstructions } from './language.mjs';
export async function prepareMessages(messages, systemPrompt, instructions, { summarize } = {}) {
  if (!Array.isArray(messages) || !messages.length) throw Error('대화 메시지가 필요합니다.');
  const result = [];
  const system = koreanInstructions([systemPrompt, instructions].filter(Boolean).join('\n\n')).slice(0, 2000);
  if (system) result.push({ role: 'system', content: system });
  for (const message of messages) {
    if (!['user', 'assistant', 'system'].includes(message.role) || typeof message.content !== 'string') throw Error('텍스트 대화만 사용할 수 있습니다.');
    result.push({ role: message.role, content: message.content });
  }
  // 무료 API 한도를 넘으면 로컬 모델로 전환하거나 실패시키지 않고,
  // 시스템 지침과 가장 최근 사용자 요청을 우선하여 대화 문맥을 압축합니다.
  const budget = 9000;
  const total = result.reduce((sum, message) => sum + message.content.length, 0);
  if (total > budget && typeof summarize === 'function' && result.length > 2) {
    const systemMessage = result.find((message) => message.role === 'system');
    const older = result.slice(systemMessage ? 1 : 0, -2);
    const recent = result.slice(-2);
    const summary = await summarize(older.map((message) => `[${message.role}] ${message.content}`).join('\n\n'));
    return [
      ...(systemMessage ? [{ role: 'system', content: systemMessage.content }] : []),
      { role: 'system', content: `이전 대화와 자료의 한국어 요약:\n${summary}` },
      ...recent,
    ];
  }
  const compact = [];
  let remaining = budget;
  for (let i = result.length - 1; i >= 0; i -= 1) {
    const message = result[i];
    const reserve = message.role === 'user' && i === result.length - 1 ? 4500 : 2200;
    const take = Math.min(message.content.length, Math.max(0, Math.min(reserve, remaining)));
    if (!take) continue;
    compact.unshift({ role: message.role, content: message.content.slice(-take) });
    remaining -= take;
    if (remaining <= 0 || compact.length >= 20) break;
  }
  const systemMessage = result.find((message) => message.role === 'system');
  if (systemMessage && !compact.some((message) => message.role === 'system')) {
    compact.unshift({ role: 'system', content: systemMessage.content.slice(0, 1800) });
  }
  return compact;
}
export async function freeChat(endpoint, messages, { signal, fetcher = fetch, translate = true, translationDepth = 0 } = {}) {
  const url = new URL(endpoint, globalThis.location?.origin);
  const sameOrigin = url.origin === globalThis.location?.origin;
  if ((url.protocol !== 'https:' && !sameOrigin) || url.username || url.password) throw Error('유효한 HTTPS AI 서버 주소가 필요합니다.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 60000);
  try {
    const response = await fetcher(url.href, { method: 'POST', credentials: 'omit', redirect: 'follow', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        model: 'auto',
        messages,
        max_tokens: 256,
        temperature: 0.7,
        reasoning: { enabled: false },
        include_reasoning: false,
      }) });
    if (!response.ok) {
      if (response.status === 429) throw Error('무료 API 사용량 한도에 도달했습니다. 잠시 후 다시 시도하거나 로컬 모델을 사용하세요.');
      throw Error(`무료 AI 서버 오류 (${response.status}). 로컬 모델을 선택할 수 있습니다.`);
    }
    if (!/application\/json/i.test(response.headers.get('content-type') || '')) throw Error('AI 서버 응답 형식이 올바르지 않습니다.');
    const reader = response.body.getReader();
    const chunks = []; let length = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length;
      if (length > 65536) { await reader.cancel(); throw Error('AI 서버 응답이 너무 큽니다.'); } chunks.push(value); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    const message = data.choices?.[0]?.message || {};
    // reasoning은 내부 추론이므로 절대 답변이나 번역 원문으로 사용하지 않습니다.
    const text = typeof message.content === 'string' ? message.content.trim() : '';
    if (typeof text !== 'string' || !text.trim()) throw Error('무료 모델이 최종 답변을 반환하지 않았습니다. 잠시 후 다시 시도하세요.');
    const answer = text.trim();
    const koreanCount = (answer.match(/[가-힣]/g) || []).length;
    const englishCount = (answer.match(/[A-Za-z]/g) || []).length;
    if (translate && koreanCount < 10 && englishCount > 20 && translationDepth < 2) {
      try {
        const googleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=${encodeURIComponent(answer.slice(0, 5000))}`;
        const googleResponse = await fetcher(googleUrl, { signal, credentials: 'omit' });
        if (googleResponse.ok) {
          const googleData = await googleResponse.json();
          const googleText = Array.isArray(googleData?.[0])
            ? googleData[0].map((part) => Array.isArray(part) ? part[0] : '').join('').trim()
            : '';
          if (googleText && /[가-힣]/.test(googleText)) return googleText;
        }
        const translated = await freeChat(endpoint, [
          { role: 'system', content: '영어 또는 외국어 원문을 자연스럽고 정확한 한국어로만 번역하세요. 설명, 분석, 원문 반복 없이 번역문만 출력하세요.' },
          { role: 'user', content: answer.slice(0, 7000) },
        ], { signal, fetcher, translate: false, translationDepth: translationDepth + 1 });
        const translatedKorean = (translated.match(/[가-힣]/g) || []).length;
        const translatedEnglish = (translated.match(/[A-Za-z]/g) || []).length;
        return translatedKorean < 10 && translatedEnglish > 20
          ? '요청을 확인했습니다. 한국어 번역 결과를 받지 못했습니다. 다시 시도해 주세요.'
          : translated;
      } catch (translationError) {
        console.warn('한국어 자동 번역 실패:', translationError);
        return '요청을 확인했습니다. 한국어 응답을 준비하지 못해 다시 시도합니다.';
      }
    }
    if (translate && koreanCount < 10 && englishCount > 20) {
      return '요청을 확인했습니다. 한국어로 답변을 생성하지 못했습니다. 다시 시도해 주세요.';
    }
    return answer;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
