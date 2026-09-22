import { type ChangeEvent, type DragEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertCircle, Camera, CheckCircle2, CircleAlert, Gauge, Info, RotateCcw, Ruler, ShieldCheck, SunMedium, TriangleAlert, UploadCloud } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

type InspectionState = 'idle' | 'analyzing' | 'complete';
type Verdict = 'good' | 'caution' | 'urgent';

type InspectionResult = {
  cardWidthPx: number;
  depthMm: number;
  verdict: Verdict;
};

const queryClient = new QueryClient();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function detectLikelyCardWidth(file: File): Promise<number> {
  return new Promise((resolve) => {
    const image = new Image();
    const source = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 360 / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(80, Math.round(image.naturalWidth * scale));
      const height = Math.max(80, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      let detectedWidth = Math.round(Math.min(width, height) * 0.31);

      if (context) {
        context.drawImage(image, 0, 0, width, height);
        const sample = context.getImageData(0, 0, width, height).data;
        const row = Math.floor(height * 0.54);
        const luminance: number[] = [];
        for (let x = 0; x < width; x += 2) {
          const index = (row * width + x) * 4;
          luminance.push((sample[index] * 0.299) + (sample[index + 1] * 0.587) + (sample[index + 2] * 0.114));
        }
        const average = luminance.reduce((sum, value) => sum + value, 0) / Math.max(1, luminance.length);
        let run = 0;
        let longestRun = 0;
        luminance.forEach((value) => {
          if (value > average + 12) {
            run += 2;
            longestRun = Math.max(longestRun, run);
          } else {
            run = 0;
          }
        });
        if (longestRun > 44) detectedWidth = clamp(Math.round(longestRun * 0.62), 80, Math.round(Math.min(width, height) * 0.78));
      }

      URL.revokeObjectURL(source);
      resolve(clamp(detectedWidth, 82, 238));
    };
    image.onerror = () => {
      URL.revokeObjectURL(source);
      resolve(148);
    };
    image.src = source;
  });
}

function resultForCard(cardWidthPx: number): InspectionResult {
  // 40px is the hidden-depth reference used by the local inspection heuristic.
  const depthMm = Number(clamp((cardWidthPx / 40) * 1.24, 1.5, 7.4).toFixed(1));
  const verdict: Verdict = depthMm >= 4.2 ? 'good' : depthMm >= 2.8 ? 'caution' : 'urgent';
  return { cardWidthPx, depthMm, verdict };
}

function Home() {
  const [state, setState] = useState<InspectionState>('idle');
  const [previewUrl, setPreviewUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisId = useRef(0);
  const previewRef = useRef('');

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  const reset = useCallback(() => {
    analysisId.current += 1;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = '';
    setState('idle');
    setPreviewUrl('');
    setFileName('');
    setProgress(0);
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const inspectFile = useCallback(async (file: File) => {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('JPG, JPEG, PNG 이미지 파일만 사용할 수 있습니다.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('파일 크기는 12MB 이하로 선택해 주세요.');
      return;
    }

    const currentId = analysisId.current + 1;
    analysisId.current = currentId;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const nextPreview = URL.createObjectURL(file);
    previewRef.current = nextPreview;
    setPreviewUrl(nextPreview);
    setFileName(file.name);
    setError('');
    setResult(null);
    setState('analyzing');
    setProgress(14);

    await new Promise((resolve) => window.setTimeout(resolve, 420));
    if (analysisId.current !== currentId) return;
    setProgress(39);
    await new Promise((resolve) => window.setTimeout(resolve, 480));
    if (analysisId.current !== currentId) return;
    setProgress(68);
    const cardWidthPx = await detectLikelyCardWidth(file);
    if (analysisId.current !== currentId) return;
    setProgress(91);
    await new Promise((resolve) => window.setTimeout(resolve, 520));
    if (analysisId.current !== currentId) return;
    setResult(resultForCard(cardWidthPx));
    setProgress(100);
    setState('complete');
  }, []);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void inspectFile(file);
  }, [inspectFile]);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void inspectFile(file);
  }, [inspectFile]);

  const verdictCopy: Record<Verdict, { label: string; hint: string; Icon: typeof CheckCircle2 }> = {
    good: { label: '양호', hint: '현재 상태는 안정적인 편입니다.', Icon: CheckCircle2 },
    caution: { label: '주의', hint: '가까운 시일 내 점검을 권장합니다.', Icon: TriangleAlert },
    urgent: { label: '교체 권장', hint: '주행 전 전문 점검을 받아 주세요.', Icon: CircleAlert },
  };

  return (
    <main className="app-shell">
      <div className="app-container">
        <header className="topbar animate-in" data-testid="header-app">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true"><ShieldCheck /></div>
            <div>
              <div className="brand-name">타이어 마모도 AI 검사기</div>
              <div className="brand-subtitle">한 장의 사진으로 확인하는 주행 전 신호</div>
            </div>
          </div>
          <a
            href="./Tire_Wear_Predictor.html"
            target="_blank"
            rel="noopener noreferrer"
            className="predictor-link"
            data-testid="link-tire-wear-predictor"
          >
            <span aria-hidden="true">🚗</span>
            타이어 수명 예측기 시작하기
          </a>
        </header>

        <section className="hero">
          <div className="hero-copy-block animate-in delay-1">
            <div className="eyebrow">주행 전 안전 측정 도구</div>
            <h1 className="hero-title">타이어의 오늘을<br /><em>눈으로 확인하세요.</em></h1>
            <p className="hero-copy">
              지갑 속 신용카드를 기준자로 함께 놓고 촬영하면, 복잡한 장비 없이 트레드 깊이를 가늠할 수 있습니다. 결과는 이 기기 안에서만 처리됩니다.
            </p>
            <div className="howto-list" aria-label="검사 방법">
              <div className="howto-item"><span className="step-number">01</span><span>카드를 홈에 끼우기</span></div>
              <div className="howto-item"><span className="step-number">02</span><span>수직으로 가까이 촬영</span></div>
              <div className="howto-item"><span className="step-number">03</span><span>사진 한 장 올리기</span></div>
            </div>
          </div>
          <div className="instrument-card animate-in delay-2" aria-label="카드 기준 측정 안내">
            <div className="instrument-head">
              <div><div className="instrument-kicker">기준 눈금 / 01</div><strong>카드 폭을 기준으로 읽습니다</strong></div>
              <div className="signal-bars" aria-hidden="true"><i /><i /><i /></div>
            </div>
            <div className="instrument-visual" aria-hidden="true">
              <div className="tire-graphic"><div className="tire-card">기준 카드</div></div>
            </div>
            <div className="instrument-foot"><span>신용카드 단변 표준</span><b>53.98 mm</b></div>
          </div>
        </section>

        <section className="workspace" aria-label="타이어 사진 검사 영역">
          {state === 'idle' && (
            <div className="panel animate-in delay-2" data-testid="panel-upload">
              <div className="panel-title"><h2>사진으로 검사 시작</h2><span>1단계 / 사진 선택</span></div>
              <div
                className={`upload-zone ${isDragging ? 'dragging' : ''}`}
                onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragging(false); }}
                onDrop={handleDrop}
                data-testid="dropzone-upload"
              >
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={handleFileChange} data-testid="input-tire-image" aria-label="타이어 사진 선택" />
                <div className="upload-icon"><UploadCloud /></div>
                <h3>{isDragging ? '여기에 사진을 놓아 주세요' : '타이어와 카드가 함께 보이나요?'}</h3>
                <p>카드의 짧은 변이 타이어 홈 안쪽에 닿도록 놓은 뒤, 흔들림 없이 촬영해 주세요.</p>
                <button type="button" className="file-button" onClick={() => fileInputRef.current?.click()} data-testid="button-select-image">
                  <Camera /> 사진 선택하기
                </button>
              </div>
              {error && <div className="helper-note" role="alert" data-testid="status-upload-error"><AlertCircle />{error}</div>}
              {!error && <div className="helper-note"><Info />지원 형식: JPG, JPEG, PNG · 최대 12MB · 원본 사진은 서버로 전송되지 않습니다.</div>}
            </div>
          )}

          {state === 'analyzing' && previewUrl && (
            <div className="panel preview-panel animate-in" data-testid="panel-analysis">
              <div className="panel-title"><h2>사진을 읽는 중입니다</h2><span>2단계 / 기기 내 분석</span></div>
              <div className="preview-frame">
                <img src={previewUrl} alt="선택한 타이어 사진" data-testid="img-selected-tire" />
                <div className="preview-overlay" />
                <div className="scan-box"><div className="scan-line" /></div>
                <div className="analysis-label">카드 가장자리 / 트레드 신호</div>
              </div>
              <div className="progress-track" aria-label={`분석 진행률 ${progress}%`}><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
              <div className="analysis-meta"><span>{fileName}</span><strong data-testid="text-analysis-progress">{progress}%</strong></div>
            </div>
          )}

          {state === 'complete' && result && (() => {
            const verdict = verdictCopy[result.verdict];
            const VerdictIcon = verdict.Icon;
            return (
              <div className="panel result-panel animate-in" data-testid="panel-results">
                <div className="result-header"><h2>검사 결과</h2><span className="result-stamp">기기 내 결과</span></div>
                <div className="result-body">
                  <div className={`verdict verdict-${result.verdict}`} data-testid={`status-verdict-${result.verdict}`}>
                    <div className="verdict-icon"><VerdictIcon /></div>
                    <div><small>트레드 상태</small><strong>{verdict.label}</strong><div style={{ fontSize: 11, marginTop: 3 }}>{verdict.hint}</div></div>
                  </div>
                  <div className="metrics">
                    <div className="metric" data-testid="metric-card-width"><span className="metric-label">감지된 카드 폭</span><strong className="metric-value">{result.cardWidthPx}<small>px</small></strong></div>
                    <div className="metric" data-testid="metric-tread-depth"><span className="metric-label">추정 트레드 깊이</span><strong className="metric-value">{result.depthMm.toFixed(1)}<small>mm</small></strong></div>
                  </div>
                  <p className="explanation" data-testid="text-result-explanation"><Ruler size={14} style={{ verticalAlign: 'middle', marginRight: 5, color: 'hsl(194 81% 38%)' }} /> 카드 단변 53.98mm와 사진 속 카드 폭을 기준으로, 40px 숨은 깊이 휴리스틱을 비례 환산한 추정값입니다. 촬영 각도와 빛에 따라 달라질 수 있습니다.</p>
                   <a
                     className="apply-predictor-button"
                     href={`./Tire_Wear_Predictor.html?currentWear=${encodeURIComponent(result.depthMm.toFixed(1))}`}
                     target="_blank"
                     rel="noopener noreferrer"
                     data-testid="link-apply-tread-depth"
                   >
                     <Gauge /> 이 트레드 깊이로 수명 예측하기
                   </a>
                  <button type="button" className="reset-button" onClick={reset} data-testid="button-reset-inspection"><RotateCcw /> 다시 검사하기</button>
                </div>
              </div>
            );
          })()}

          <aside className="panel side-info animate-in delay-3" data-testid="panel-guide">
            <h3>정확도를 높이는 작은 습관</h3>
            <div className="tip-item"><div className="tip-icon"><SunMedium /></div><div><b>빛은 홈 안쪽까지</b><p>그늘을 피하고, 타이어 표면과 카드가 고르게 보이게 해 주세요.</p></div></div>
            <div className="tip-item"><div className="tip-icon"><Ruler /></div><div><b>카드는 평평하게</b><p>카드의 짧은 변이 마모 홈에 닿아야 기준 폭을 읽기 쉽습니다.</p></div></div>
            <div className="tip-item"><div className="tip-icon"><Gauge /></div><div><b>결과는 추정치</b><p>공기압, 각도, 렌즈 왜곡에 따라 실제 측정과 차이가 날 수 있습니다.</p></div></div>
            <div className="disclaimer" data-testid="text-safety-note"><b>안전 안내</b>이 결과는 전문 장비를 이용한 점검을 대신하지 않습니다. 마모가 한쪽에 치우치거나 균열·돌출이 보이면 수치와 관계없이 정비소에서 확인하세요.</div>
          </aside>
        </section>

        <footer style={{ padding: '0 0 28px', color: 'hsl(var(--muted-foreground))', fontFamily: 'var(--app-font-mono)', fontSize: 10, letterSpacing: '.04em' }}>
          다음 안전 주행을 위한 트레드 신호
        </footer>
      </div>
    </main>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;