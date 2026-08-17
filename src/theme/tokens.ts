/**
 * 디자인 토큰 — 의료/돌봄 서비스용 라이트 테마.
 *
 * 색상, 글자 크기, 여백은 전부 이 파일에서만 정의한다.
 * 화면이나 컴포넌트에서 색상 코드(#RRGGBB)나 픽셀 값을 직접 쓰지 않는다.
 *
 * 고령자와 보호자가 함께 쓰는 앱이므로 본문 기준 글자를 18px로 두고,
 * 터치 영역은 최소 56px을 확보한다.
 */

import '@/global.css';

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const Colors = {
  brand: {
    /** 주 액션 버튼, 활성 상태 */
    primary: '#1B6FE0',
    primaryDark: '#1557B0',
    /** 선택된 카드 배경, 강조 배경 */
    primarySoft: '#E8F1FD',
    /** 돌봄/완료를 나타내는 보조색 */
    accent: '#0E9F6E',
    accentSoft: '#E6F6EF',
  },
  text: {
    primary: '#1A1D23',
    secondary: '#4B5563',
    tertiary: '#8A919E',
    inverse: '#FFFFFF',
    disabled: '#B4BAC4',
  },
  surface: {
    /** 화면 배경 — 카드가 떠 보이도록 살짝 회색 */
    background: '#F5F7FA',
    card: '#FFFFFF',
    /** 입력창, 비활성 영역 */
    subtle: '#EDF1F6',
    border: '#DCE3EC',
    divider: '#EAEEF4',
  },
  feedback: {
    success: '#0B6E4F',
    warning: '#8A5A00',
    error: '#C02626',
    info: '#1557B0',
  },
} as const;

/**
 * 간병 요청/매칭 상태 표시용 색상.
 * 색상만으로 구분하지 않고 항상 텍스트 라벨과 함께 쓴다.
 */
export const StatusColors = {
  pending: { fg: '#8A5A00', bg: '#FFF4E0' },
  matched: { fg: '#1557B0', bg: '#E8F1FD' },
  inProgress: { fg: '#0B6E7A', bg: '#E0F3F7' },
  completed: { fg: '#0B6E4F', bg: '#E6F6EF' },
  cancelled: { fg: '#5B6472', bg: '#EDF1F6' },
  noShow: { fg: '#A11B1B', bg: '#FDECEC' },
} as const satisfies Record<string, { fg: string; bg: string }>;

export type StatusTone = keyof typeof StatusColors;

/**
 * 웹에서만 커스텀 폰트 변수를 적용한다.
 * 네이티브에서는 undefined로 두어 OS 기본 폰트를 그대로 쓴다.
 */
export const FontFamily = Platform.select<string | undefined>({
  web: 'var(--font-display)',
  default: undefined,
});

export const Typography = {
  /** 스플래시/온보딩 대제목 */
  display: { fontSize: 34, lineHeight: 44, fontWeight: '700' },
  /** 화면 제목 */
  title: { fontSize: 28, lineHeight: 38, fontWeight: '700' },
  /** 섹션 제목 */
  heading: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  /** 카드 제목 */
  subheading: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  /** 본문 기준 */
  body: { fontSize: 18, lineHeight: 27, fontWeight: '400' },
  bodyStrong: { fontSize: 18, lineHeight: 27, fontWeight: '600' },
  /** 라벨, 항목명 */
  label: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  /** 보조 설명 — 고령자 가독성을 위해 15px 미만은 쓰지 않는다 */
  caption: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  button: { fontSize: 19, lineHeight: 24, fontWeight: '700' },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof Typography;

/** 4px 배수 스케일 */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const Layout = {
  /** 버튼 등 주요 터치 대상의 최소 높이 */
  minTouchHeight: 56,
  /** 화면 좌우 기본 여백 */
  screenPadding: 20,
  /** 태블릿/웹에서 본문이 과도하게 넓어지지 않도록 제한 */
  maxContentWidth: 560,
  borderWidth: 1,
} as const;

export const Shadows = {
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#0B1526',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    android: { elevation: 2 },
    default: { boxShadow: '0 2px 8px rgba(11, 21, 38, 0.06)' },
  }),
} as const;
