/**
 * 한국어 문장 다듬기.
 *
 * 화면 문구에 낱말을 끼워 넣을 때 조사를 "을(를)"처럼 둘 다 적지 않는다.
 * 어르신이 읽는 화면에서 괄호 조사는 오류 메시지를 기계가 만든 것처럼 보이게 한다.
 */

const HangulStart = 0xac00;
const HangulEnd = 0xd7a3;
/** 한글 음절 하나에 들어 있는 받침의 경우 수 (받침 없음 포함) */
const FinalConsonantCount = 28;

/**
 * 낱말 끝 글자에 받침이 있으면 첫째 조사를, 없으면 둘째 조사를 돌려준다.
 *
 * 끝 글자가 한글이 아니면(숫자, 영문) 받침을 알 수 없으므로 둘을 함께 적는다.
 *
 *   particle('이름', '을', '를')  → '을'
 *   particle('주소', '을', '를')  → '를'
 */
export function particle(word: string, withFinal: string, withoutFinal: string): string {
  const code = word.trim().slice(-1).charCodeAt(0);

  if (Number.isNaN(code) || code < HangulStart || code > HangulEnd) {
    return `${withFinal}(${withoutFinal})`;
  }

  return (code - HangulStart) % FinalConsonantCount === 0 ? withoutFinal : withFinal;
}
