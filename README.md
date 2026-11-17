# 돈이 어디로 몰리는지 (PWA)

한국 증시 업종·종목별 돈의 흐름(외국인·기관 순매수, 거래대금 등)을 10점 만점 점수로 보여 주는 홈화면 설치형 웹앱입니다. 참고용이며 투자 권유가 아닙니다.

- `scripts/fetch.py`: 네이버 금융 공개 엔드포인트(+Yahoo, CoinGecko)에서 데이터를 받아 `data.json` 생성
- `.github/workflows/update.yml`: 평일 장중 약 10분마다 실행 (GitHub 스케줄 특성상 몇 분 늦을 수 있음)
- 화면: `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`
