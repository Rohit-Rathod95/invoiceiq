import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE_URL = 'https://6fd2bnahsg.execute-api.us-east-1.amazonaws.com/prod/invoice';
const POLL_INTERVAL_MS = 3000;

const INITIAL_STATE = {
  screen: 'upload',
  file: null,
  fileName: '',
  invoiceId: '',
  status: '',
  result: null,
  error: '',
  isSubmitting: false,
  isPolling: false,
};

function App() {
  const [appState, setAppState] = useState(INITIAL_STATE);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef(null);
  const pollTimerRef = useRef(null);
  const copiedTimerRef = useRef(null);

  const score = appState.result?.riskScore ?? 0;
  const scoreColor = useMemo(() => {
    if (score <= 30) return 'green';
    if (score <= 60) return 'amber';
    return 'red';
  }, [score]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
      }
      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (appState.screen !== 'processing' || !appState.invoiceId) {
      return undefined;
    }

    let cancelled = false;

    const pollInvoice = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/${appState.invoiceId}`);
        if (cancelled) {
          return;
        }

        const payload = response.data || {};
        const normalizedStatus = String(payload.status || '').toUpperCase();

        if (normalizedStatus === 'ERROR') {
          setAppState((current) => ({
            ...current,
            screen: 'error',
            status: normalizedStatus,
            error: payload.message || 'We could not finish processing this invoice. Please try again.',
            isPolling: false,
            isSubmitting: false,
          }));
          return;
        }

        if (normalizedStatus === 'DONE' || normalizedStatus === 'COMPLETED' || normalizedStatus === 'SUCCESS') {
          setAppState((current) => ({
            ...current,
            screen: 'results',
            status: normalizedStatus,
            result: payload,
            isPolling: false,
            isSubmitting: false,
            error: '',
          }));
          return;
        }

        setAppState((current) => ({
          ...current,
          status: normalizedStatus,
          result: payload,
        }));

        pollTimerRef.current = window.setTimeout(pollInvoice, POLL_INTERVAL_MS);
      } catch (error) {
        if (cancelled) {
          return;
        }

        pollTimerRef.current = window.setTimeout(pollInvoice, POLL_INTERVAL_MS);
      }
    };

    pollTimerRef.current = window.setTimeout(pollInvoice, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
      }
    };
  }, [appState.invoiceId, appState.screen]);

  const resetWorkflow = () => {
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
    }
    setCopied(false);
    setAppState(INITIAL_STATE);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const readFileAsBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Unable to read the selected file.'));
      reader.readAsDataURL(file);
    });
  };

  const setSelectedFile = (file) => {
    if (!file) {
      return;
    }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setAppState((current) => ({
        ...current,
        error: 'Please upload a PDF invoice.',
        screen: 'error',
      }));
      return;
    }

    setAppState((current) => ({
      ...current,
      file,
      fileName: file.name,
      error: '',
      screen: 'upload',
    }));
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    setSelectedFile(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    setSelectedFile(file);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const analyzeInvoice = async () => {
    if (!appState.file) {
      return;
    }

    try {
      setAppState((current) => ({
        ...current,
        isSubmitting: true,
        screen: 'processing',
        error: '',
        result: null,
      }));

      const base64 = await readFileAsBase64(appState.file);
      const response = await axios.post(`${API_BASE_URL}/upload`, {
        file: base64,
        fileName: appState.file.name,
      });

      const payload = response.data || {};
      const normalizedStatus = String(payload.status || 'PROCESSING').toUpperCase();

      if (normalizedStatus === 'ERROR') {
        setAppState((current) => ({
          ...current,
          screen: 'error',
          isSubmitting: false,
          isPolling: false,
          error: 'We could not upload the invoice. Please try again.',
        }));
        return;
      }

      setAppState((current) => ({
        ...current,
        invoiceId: payload.invoiceId,
        status: normalizedStatus,
        isSubmitting: false,
        isPolling: true,
      }));

      if (normalizedStatus === 'DONE' || normalizedStatus === 'COMPLETED' || normalizedStatus === 'SUCCESS') {
        setAppState((current) => ({
          ...current,
          screen: 'results',
          result: payload,
          isPolling: false,
        }));
      }
    } catch (error) {
      setAppState((current) => ({
        ...current,
        screen: 'error',
        isSubmitting: false,
        isPolling: false,
        error: 'The invoice upload failed. Check your connection and try again.',
      }));
    }
  };

  const copyEmailDraft = async () => {
    if (!appState.result?.emailDraft) {
      return;
    }

    try {
      await navigator.clipboard.writeText(appState.result.emailDraft);
      setCopied(true);
      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      setCopied(false);
    }
  };

  const renderScreen = () => {
    if (appState.screen === 'processing') {
      return (
        <ProcessingScreen
          fileName={appState.fileName}
          status={appState.status || 'PROCESSING'}
          isSubmitting={appState.isSubmitting}
        />
      );
    }

    if (appState.screen === 'results' && appState.result) {
      return (
        <ResultsScreen
          fileName={appState.fileName}
          result={appState.result}
          scoreColor={scoreColor}
          copied={copied}
          onCopyEmail={copyEmailDraft}
          onAnalyzeAnother={resetWorkflow}
        />
      );
    }

    if (appState.screen === 'error') {
      return <ErrorScreen error={appState.error} onTryAgain={resetWorkflow} />;
    }

    return (
      <UploadScreen
        fileName={appState.fileName}
        fileInputRef={fileInputRef}
        onBrowseClick={handleBrowseClick}
        onFileChange={handleFileChange}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onAnalyze={analyzeInvoice}
        hasFile={Boolean(appState.file)}
        isSubmitting={appState.isSubmitting}
      />
    );
  };

  return (
    <div className="app-shell">
      <BackgroundLayers screen={appState.screen} />
      <main className={`app-frame screen-${appState.screen}`}>
        {renderScreen()}
      </main>
    </div>
  );
}

function BackgroundLayers({ screen }) {
  return (
    <>
      <div className="background-grid" />
      <div className="background-orb background-orb-left" />
      <div className="background-orb background-orb-right" />
      {screen === 'processing' ? <ParticleField /> : null}
    </>
  );
}

function ParticleField() {
  return (
    <div className="particle-field" aria-hidden="true">
      {Array.from({ length: 18 }).map((_, index) => (
        <span
          key={index}
          className="particle"
          style={{
            '--particle-delay': `${index * 0.18}s`,
            '--particle-x': `${(index * 37) % 100}%`,
            '--particle-y': `${(index * 19) % 100}%`,
          }}
        />
      ))}
    </div>
  );
}

function UploadScreen({
  fileName,
  fileInputRef,
  onBrowseClick,
  onFileChange,
  onDrop,
  onDragOver,
  onAnalyze,
  hasFile,
  isSubmitting,
}) {
  return (
    <section className="hero-panel">
      <div className="brand-mark">
        <LogoIcon pulse={false} />
        <div>
          <h1>InvoiceIQ</h1>
          <p>AI-powered invoice fraud detection</p>
        </div>
      </div>

      <div className="hero-copy">
        <h2>Upload a PDF and get an instant fraud intelligence report.</h2>
        <p>
          Detect anomalies, quantify risk, and draft follow-up emails in one premium workflow.
        </p>
      </div>

      <div
        className={`upload-zone ${hasFile ? 'selected' : ''}`}
        onClick={onBrowseClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        role="button"
        tabIndex={0}
      >
        <input ref={fileInputRef} type="file" accept="application/pdf" onChange={onFileChange} />
        <UploadIcon />
        <strong>Drop your invoice PDF here or click to browse</strong>
        <span>Securely analyze invoices with a serverless AI workflow.</span>
        {hasFile ? (
          <div className="file-pill">
            <CheckIcon />
            <span>{fileName}</span>
          </div>
        ) : null}
      </div>

      <button className="primary-button" type="button" disabled={!hasFile || isSubmitting} onClick={onAnalyze}>
        {isSubmitting ? 'Analyzing...' : 'Analyze Invoice'}
      </button>
    </section>
  );
}

function ProcessingScreen({ fileName, status, isSubmitting }) {
  const stepIndex = getStepIndex(status);
  const stepLabels = ['Extracting Data', 'Analyzing with AI', 'Generating Report'];

  return (
    <section className="processing-panel">
      <div className="processing-header">
        <div className="brand-mark brand-mark-centered">
          <LogoIcon pulse={true} />
          <div>
            <h1>InvoiceIQ</h1>
            <p>{fileName || 'Analyzing invoice'}</p>
          </div>
        </div>
      </div>

      <div className="processing-copy">
        <h2>{isSubmitting ? 'Preparing secure analysis…' : 'Processing invoice intelligence…'}</h2>
        <p>
          We are extracting invoice data, evaluating risks, and preparing your report.
        </p>
      </div>

      <div className="step-track" aria-label="invoice processing progress">
        {stepLabels.map((label, index) => (
          <div key={label} className={`step-item ${index <= stepIndex ? 'active' : ''}`}>
            <div className="step-badge">{index + 1}</div>
            <div>
              <strong>{label}</strong>
              <span>{describeStep(index, stepIndex)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ResultsScreen({ fileName, result, scoreColor, copied, onCopyEmail, onAnalyzeAnother }) {
  const anomalies = Array.isArray(result.anomalies) ? result.anomalies : [];

  return (
    <section className="results-layout fade-in-up">
      <header className="results-header">
        <div>
          <div className="analysis-badge">Analysis Complete</div>
          <h2>{fileName || 'Invoice'} Review</h2>
        </div>
        <p>InvoiceIQ detected the following risk signals and drafted a response workflow.</p>
      </header>

      <div className="results-grid">
        <RiskScoreCard score={result.riskScore ?? 0} color={scoreColor} rationale={result.riskRationale} />
        <SummaryCard summary={result.summary} />
      </div>

      <div className="results-grid results-grid-wide">
        <AnomaliesCard anomalies={anomalies} />
        <EmailDraftCard draft={result.emailDraft} copied={copied} onCopyEmail={onCopyEmail} />
      </div>

      <div className="results-footer">
        <button className="secondary-button" type="button" onClick={onAnalyzeAnother}>
          Analyze Another Invoice
        </button>
      </div>
    </section>
  );
}

function RiskScoreCard({ score, color, rationale }) {
  const normalizedScore = Math.max(0, Math.min(100, Number(score) || 0));

  return (
    <article className="card risk-card">
      <div className="card-heading">
        <span className="section-label">Risk Score</span>
        <h3>Fraud likelihood at a glance</h3>
      </div>

      <div className={`gauge gauge-${color}`}>
        <svg viewBox="0 0 220 220" className="gauge-svg" aria-hidden="true">
          <circle className="gauge-track" cx="110" cy="110" r="84" />
          <circle
            className="gauge-fill"
            cx="110"
            cy="110"
            r="84"
            style={{ strokeDashoffset: 527 - (527 * normalizedScore) / 100 }}
          />
        </svg>
        <div className="gauge-value">
          <strong>{normalizedScore}</strong>
          <span>/ 100</span>
        </div>
      </div>

      <p className="rationale-text">{rationale || 'No rationale provided by the analysis API.'}</p>
    </article>
  );
}

function SummaryCard({ summary }) {
  return (
    <article className="card">
      <div className="card-heading">
        <span className="section-label">Summary</span>
        <h3>Plain English overview</h3>
      </div>
      <p className="summary-text">{summary || 'No summary was returned for this invoice.'}</p>
    </article>
  );
}

function AnomaliesCard({ anomalies }) {
  return (
    <article className="card">
      <div className="card-heading">
        <span className="section-label">Anomalies</span>
        <h3>Detected issues</h3>
      </div>

      {anomalies.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Issue</th>
                <th>Severity</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.map((item, index) => (
                <tr key={`${item.field || 'field'}-${index}`} style={{ '--row-delay': `${index * 0.08}s` }}>
                  <td>{item.field || 'Unknown'}</td>
                  <td>{item.issue || item.description || 'No issue description provided.'}</td>
                  <td>
                    <SeverityBadge severity={item.severity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-state">No anomalies were returned for this invoice.</p>
      )}
    </article>
  );
}

function EmailDraftCard({ draft, copied, onCopyEmail }) {
  return (
    <article className="card">
      <div className="card-heading card-heading-inline">
        <div>
          <span className="section-label">Email Draft</span>
          <h3>Ready to send</h3>
        </div>
        <button className="ghost-button" type="button" onClick={onCopyEmail} disabled={!draft}>
          {copied ? 'Copied!' : 'Copy Email'}
        </button>
      </div>

      <pre className="email-draft">{draft || 'No email draft was returned for this invoice.'}</pre>
    </article>
  );
}

function ErrorScreen({ error, onTryAgain }) {
  return (
    <section className="hero-panel error-panel fade-in-up">
      <div className="brand-mark">
        <LogoIcon pulse={false} />
        <div>
          <h1>InvoiceIQ</h1>
          <p>Analysis unavailable</p>
        </div>
      </div>

      <div className="error-card">
        <div className="error-icon">!</div>
        <h2>Something went wrong</h2>
        <p>{error || 'We could not complete the invoice analysis.'}</p>
      </div>

      <button className="primary-button" type="button" onClick={onTryAgain}>
        Try Another Invoice
      </button>
    </section>
  );
}

function LogoIcon({ pulse }) {
  return (
    <div className={`logo-mark ${pulse ? 'pulsing' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" role="presentation">
        <defs>
          <linearGradient id="boltGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8ab4ff" />
            <stop offset="100%" stopColor="#4f8ef7" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="30" className="logo-ring" />
        <path
          d="M36.5 6 16 36h13l-1.5 22L48 26H35.5L36.5 6Z"
          fill="url(#boltGradient)"
        />
      </svg>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg className="upload-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 7 8h3v6h4V8h3l-5-5Zm-7 14v2h14v-2H5Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="check-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9.2 16.2-3.4-3.4L4 14.6l5.2 5.2L20 9l-1.8-1.8z" />
    </svg>
  );
}

function SeverityBadge({ severity }) {
  const normalized = String(severity || 'LOW').toUpperCase();
  const className = normalized === 'HIGH' ? 'danger' : normalized === 'MEDIUM' ? 'warning' : 'success';

  return <span className={`severity-badge ${className}`}>{normalized}</span>;
}

function getStepIndex(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'DONE' || normalized === 'COMPLETED' || normalized === 'SUCCESS') return 2;
  if (normalized === 'ANALYZING') return 1;
  return 0;
}

function describeStep(index, activeIndex) {
  if (index < activeIndex) {
    return 'Completed';
  }

  if (index === activeIndex) {
    return 'In progress';
  }

  return 'Waiting';
}

export default App;
