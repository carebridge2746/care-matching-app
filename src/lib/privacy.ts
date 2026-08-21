/**
 * 개인정보 가리기.
 *
 * 간병인은 요청을 수락할지 판단하는 데 필요한 만큼만 볼 수 있어야 한다.
 * 매칭이 확정되기 전에는 환자의 이름을 알 필요가 없으므로 성만 남기고 가린다.
 *
 * Supabase 모드에서는 같은 규칙을 데이터베이스의 `public.mask_person_name()` 이 수행한다.
 * 가리는 일을 화면이 아니라 데이터가 나오는 지점에서 하기 위해서다 —
 * 화면에서 가리면 가려지지 않은 값이 이미 기기까지 내려온 뒤다.
 */

/** '김영희' → '김OO'. 한 글자 이름은 그대로 둔다. */
export function maskPersonName(name: string): string {
  const trimmed = name.trim();

  if (trimmed.length <= 1) {
    return trimmed;
  }

  return `${trimmed.slice(0, 1)}${'O'.repeat(trimmed.length - 1)}`;
}
