export const KOREAN_DEFAULT = '응답 언어는 반드시 한국어입니다. 사용자가 다른 언어를 명시적으로 요청하지 않는 한 모든 설명과 최종 답변을 자연스럽고 간결한 한국어로만 작성하세요. 내부 추론이나 분석을 출력하지 말고 최종 답변만 출력하세요.';
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
