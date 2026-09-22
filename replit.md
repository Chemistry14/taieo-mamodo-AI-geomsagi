# 타이어 마모도 AI 검사기

사진 속 신용카드 폭을 기준으로 타이어 트레드 깊이를 추정해 주행 전 상태를 안내하는 모바일 친화형 웹 앱입니다.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/tire-wear-ai/src/App.tsx` — 이미지 선택, 브라우저 내 분석 휴리스틱, 결과 상태 UI
- `artifacts/tire-wear-ai/src/index.css` — 주행 안전 계기판 테마와 반응형 레이아웃
- `artifacts/tire-wear-ai/.replit-artifact/artifact.toml` — 웹 미리보기 서비스 설정

## Architecture decisions

- 이미지 파일은 서버로 보내지 않고 브라우저에서만 분석합니다.
- 신용카드 단변 53.98mm를 기준으로 사진 속 카드 폭을 환산합니다.
- 현재 깊이 값은 40px 숨은 깊이 휴리스틱을 사용하는 추정치이며 전문 점검을 대체하지 않습니다.

## Product

사용자는 타이어 홈에 카드를 꽂은 사진을 JPG/JPEG/PNG로 선택하거나 드래그 앤 드롭하고, 카드 폭과 추정 트레드 깊이, 양호·주의·교체 권장 상태를 확인할 수 있습니다.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- 정확한 측정 장비가 아닌 사진 기반 추정이므로 결과와 함께 안전 안내를 표시해야 합니다.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
