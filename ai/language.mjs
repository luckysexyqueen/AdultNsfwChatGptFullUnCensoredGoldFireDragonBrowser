export const KOREAN_DEFAULT = '기본 응답 언어는 한국어입니다. 사용자가 다른 언어를 명시적으로 요청하지 않는 한 자연스럽고 간결한 한국어로 답변하세요. Answer in Korean by default; use another language only when the user explicitly requests it.';
export function koreanInstructions(instructions = '') {
  return instructions.includes(KOREAN_DEFAULT) ? instructions : [KOREAN_DEFAULT, instructions].filter(Boolean).join('\n\n');
}
export function koreanMessages(messages) {
  const result = messages.map(message => ({ ...message }));
  if (result.some(message => message.role === 'system' && message.content.includes(KOREAN_DEFAULT))) return result;
  if (result[0]?.role === 'system') result[0].content = koreanInstructions(result[0].content);
  else result.unshift({ role: 'system', content: KOREAN_DEFAULT });
  return result;
}
