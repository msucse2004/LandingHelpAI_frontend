# Landing Help AI Frontend

Framework 없는 HTML/CSS/모듈 JS 기반 고객/운영자 웹앱입니다.

## Architecture

- `src/pages`: 고객/관리자 페이지 진입점
- `src/assets/js/core`: API client, auth/session, guard, 유틸
- `src/assets/js/pages`: 페이지별 init 로직
- `src/assets/js/components`: 재사용 렌더링 컴포넌트
- `src/assets/css`: design tokens + 공통 컴포넌트 + 페이지별 스타일
- `src/partials`: role 기반 사이드바/헤더 partial

핵심 원칙:
- React/TS 없이 디자이너 친화적 구조
- 백엔드 API 우선, 실패 시 mock fallback
- 역할별 접근 제어 + 제한형 AI UX

## How To Run

```bash
cd LandingHelpAI_frontend
python -m http.server 3000 --directory .
```

브라우저에서 `http://localhost:3000` 접속 후 사용합니다.  
백엔드는 기본 `http://localhost:8000`을 참조합니다.

## 계정

백엔드는 고정 데모 계정을 만들지 않습니다. 회원가입·초대로 만든 아이디/이메일과 비밀번호로 로그인하세요.

주요 페이지:
- 서비스 목록: `src/pages/services.html`
- 고객: quote/invoice/documents/messages/schedule/ai-assistant
- 관리자: quotes/invoices/documents/schedules/risk-board/customer-detail

## Mock Payment Notes

- 결제는 mock mode로 데모 가능
- 성공/실패/취소 시 대시보드 요약/메시지/문서요청 스텁이 갱신됨
- 실제 카드 결제/웹훅 연동은 차기 단계

## Demo Walkthrough

1. 서비스 목록 조회 (`services.html`)
2. 회원가입/로그인 (`signup.html` -> `login.html`)
3. 견적 요청 제출 (`quote-detail` 요청 플로우)
4. 관리자 견적 제안 (`admin-quotes.html`)
5. 고객 견적 승인 (`quote-detail.html`)
6. 관리자 인보이스 발송 (`admin-invoices.html`)
7. 고객 mock 결제 (`invoice-detail.html`)
8. 대시보드/체크리스트/메시지/문서 상태 확인
9. 제한형 AI 응답 확인 (`ai-assistant.html`)
10. 관리자 리스크 보드 확인 (`admin-risk-board.html`)

## Known Limitations

- 정적 서버 기반이라 SSR/번들 최적화 없음
- 일부 관리자 작업은 데모 스텁(실운영 승인 플로우 단순화)
- 파일 업로드는 metadata 중심(mock)
- 에러 처리 UI/접근성/국제화는 MVP 수준

## Future Roadmap

1. 페이지 부트스트랩 공통화/partial 로더 표준화
2. 실시간 이벤트(알림/배지) 도입
3. 접근성(ARIA/키보드 네비게이션) 강화
4. E2E 테스트 시나리오 자동화
5. 모바일 shell(Android/iOS) deep-link 통합
