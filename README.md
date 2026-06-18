# ⚡ InvoiceIQ

> AI-powered serverless invoice intelligence platform — detect fraud, anomalies, and math errors in seconds.

![Analysis Complete](https://img.shields.io/badge/Status-Live-brightgreen)
![AWS](https://img.shields.io/badge/AWS-Serverless-orange)
![Gemini](https://img.shields.io/badge/Gemini-2.5%20Flash-blue)
![Textract](https://img.shields.io/badge/Amazon-Textract-yellow)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## 🧾 What is InvoiceIQ?

InvoiceIQ is a fully serverless invoice intelligence platform that automatically analyzes PDF invoices for fraud signals, mathematical inconsistencies, and anomalies — and generates a professional finance team email in seconds.

Upload any invoice PDF → InvoiceIQ extracts all structured data using **Amazon Textract**, analyzes it with **Google Gemini 2.5 Flash**, and returns:

- 🔴 **Fraud Risk Score** (0–100) with rationale
- 🔍 **Anomaly Detection** — inflated amounts, math errors, missing fields, duplicates
- 📝 **Plain English Summary** of the invoice
- 📧 **Auto-drafted Finance Email** ready to send

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│              (Upload → Processing → Results Dashboard)          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ POST /invoice/upload
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Gateway (REST)                          │
│         POST /invoice/upload │ GET /invoice/{invoiceId}         │
└──────────┬───────────────────────────────────────┬──────────────┘
           │                                       │
           ▼                                       ▼
┌──────────────────────┐               ┌───────────────────────┐
│  Lambda 1            │               │  Lambda 4             │
│  UploadHandler       │               │  ResultsFetcher       │
│                      │               │                       │
│  • Receives PDF      │               │  • Polls DynamoDB     │
│  • Uploads to S3     │               │  • Returns status     │
│  • Creates DynamoDB  │               │    + full analysis    │
│    record            │               └───────────────────────┘
│  • Async triggers    │
│    Lambda 2          │
└──────────┬───────────┘
           │ Async Invoke
           ▼
┌──────────────────────┐
│  Lambda 2            │
│  TextractProcessor   │
│                      │
│  • Calls Amazon      │
│    Textract          │
│    AnalyzeDocument   │
│  • Extracts TABLES   │
│    + FORMS           │
│  • Parses blocks     │
│    into clean JSON   │
│  • Async triggers    │
│    Lambda 3          │
└──────────┬───────────┘
           │ Async Invoke
           ▼
┌──────────────────────┐         ┌─────────────────────────┐
│  Lambda 3            │────────▶│  Google Gemini 2.5 Flash│
│  GeminiAnalyzer      │◀────────│                         │
│                      │         │  • Anomaly detection    │
│  • Builds audit      │         │  • Risk scoring         │
│    prompt            │         │  • Email generation     │
│  • Calls Gemini API  │         └─────────────────────────┘
│  • Parses JSON       │
│  • Updates DynamoDB  │
└──────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│                        AWS Services                          │
│                                                              │
│   S3 (PDF storage, 24hr TTL)  │  DynamoDB (invoiceiq-records)│
│   IAM (invoiceiq-lambda-role) │  CloudWatch (Lambda logs)   │
└──────────────────────────────────────────────────────────────┘
```

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Axios, CSS3 |
| API Layer | AWS API Gateway (REST) |
| Compute | AWS Lambda (Node.js 22.x) × 4 |
| Document AI | Amazon Textract (AnalyzeDocument) |
| GenAI | Google Gemini 2.5 Flash |
| Database | AWS DynamoDB (TTL enabled) |
| Storage | AWS S3 (24hr lifecycle auto-delete) |
| IAM | AWS IAM (least-privilege Lambda role) |
| Monitoring | AWS CloudWatch |

---

## ✨ Features

### 🔍 Intelligent Extraction
- Amazon Textract extracts **tables**, **forms**, and **key-value pairs** from any invoice PDF
- Zero manual parsing — handles multi-format invoices automatically
- Structured JSON output from raw PDF in seconds

### 🤖 AI-Powered Analysis
Gemini 2.5 Flash analyzes extracted data for:
- Mathematical inconsistencies (line items not matching totals)
- Inflated or unusual amounts
- Missing mandatory fields (vendor name, invoice number, date, total)
- Duplicate line items
- Suspicious patterns across the invoice

### 📊 Risk Scoring
- **0–30**: Low risk (green)
- **31–60**: Medium risk (yellow)
- **61–100**: High risk (red)
- Animated circular gauge with rationale explanation

### 📧 Auto Email Generation
- Complete professional email drafted for finance team
- Lists specific anomalies with recommended actions
- One-click copy to clipboard

### 🔒 Privacy First
- Invoice PDFs auto-deleted from S3 after 24 hours (lifecycle rule)
- DynamoDB records auto-deleted after 24 hours (TTL)
- Zero long-term document persistence

---

## 📁 Project Structure

```
invoiceiq/
├── frontend/                     # React application
│   └── src/
│       └── App.js                # Main app — all screens + components
│
├── backend/
│   └── lambdas/
│       ├── uploadHandler/
│       │   └── index.js          # Lambda 1 — S3 upload + DynamoDB + async trigger
│       ├── textractProcessor/
│       │   └── index.js          # Lambda 2 — Textract extraction + parsing
│       ├── bedrockAnalyzer/
│       │   └── index.js          # Lambda 3 — Gemini analysis + DynamoDB update
│       └── resultsFetcher/
│           └── index.js          # Lambda 4 — DynamoDB polling endpoint
│
├── sample-invoices/              # Test PDF invoices
└── README.md
```

---

## ⚙️ AWS Infrastructure

| Resource | Name | Config |
|---|---|---|
| S3 Bucket | `invoiceiq-uploads-rohit` | Private, 24hr lifecycle TTL |
| S3 Bucket | `invoiceiq-frontend-rohit` | Public, static website hosting |
| DynamoDB Table | `invoiceiq-records` | TTL on `ttl` field |
| IAM Role | `invoiceiq-lambda-role` | S3 + Textract + DynamoDB + Lambda invoke |
| API Gateway | `invoiceiq-api` | REST, Regional, prod stage |
| Lambda | `invoiceiq-upload-handler` | Node.js 22.x, 30s timeout |
| Lambda | `invoiceiq-textract-processor` | Node.js 22.x, 60s timeout |
| Lambda | `invoiceiq-bedrock-analyzer` | Node.js 22.x, 60s timeout |
| Lambda | `invoiceiq-results-fetcher` | Node.js 22.x, 10s timeout |

---

## 🔄 Data Flow

```
1. User uploads PDF via React UI
2. React converts PDF → base64 → POST /invoice/upload
3. Lambda 1:
   - Stores PDF in S3 (invoices/{uuid}/filename.pdf)
   - Creates DynamoDB record { status: "PROCESSING" }
   - Async invokes Lambda 2
   - Returns { invoiceId, status: "PROCESSING" }
4. React starts polling GET /invoice/{invoiceId} every 3s
5. Lambda 2:
   - Calls Textract AnalyzeDocument (TABLES + FORMS)
   - Parses blocks → { lines, keyValuePairs, tables }
   - Updates DynamoDB { status: "ANALYZING", textractData: {...} }
   - Async invokes Lambda 3
6. Lambda 3:
   - Builds audit prompt with Textract JSON
   - Calls Gemini 2.5 Flash API
   - Parses JSON response → anomalies, riskScore, summary, emailDraft
   - Updates DynamoDB { status: "DONE", ...fullAnalysis }
7. React poll detects "DONE" → renders Results Dashboard
```

---

## 🗃️ DynamoDB Schema

```json
{
  "invoiceId": "uuid-v4",
  "status": "PROCESSING | ANALYZING | DONE | ERROR",
  "fileName": "invoice.pdf",
  "s3Key": "invoices/{uuid}/invoice.pdf",
  "textractData": {
    "lines": [],
    "keyValuePairs": {},
    "tables": []
  },
  "anomalies": [
    {
      "field": "Line Item Total",
      "issue": "Math inconsistency description",
      "severity": "HIGH | MEDIUM | LOW"
    }
  ],
  "riskScore": 95,
  "riskRationale": "Explanation of risk score",
  "summary": "Plain English invoice summary",
  "emailDraft": "Complete finance team email",
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp",
  "ttl": 1234567890
}
```

---

## 🧪 Testing

### Test with sample invoice
1. Use any PDF invoice or generate one
2. Convert to base64:
```bash
node -e "const fs=require('fs'); console.log(fs.readFileSync('invoice.pdf').toString('base64'))"
```
3. POST to API:
```bash
curl -X POST https://your-api-url/prod/invoice/upload \
  -H "Content-Type: application/json" \
  -d '{"file": "<base64>", "fileName": "invoice.pdf"}'
```
4. Poll results:
```bash
curl https://your-api-url/prod/invoice/{invoiceId}
```

### Anomaly Test Invoice
The `sample-invoices/` folder contains a test invoice with intentional anomalies:
- Line item math errors
- Subtotal inconsistency
- GST miscalculation
- Final total mismatch

Expected: Risk Score **95+**, 7 anomalies detected

---

## 🔑 Environment Variables

| Lambda | Variable | Value |
|---|---|---|
| uploadHandler | `BUCKET_NAME` | S3 bucket name |
| uploadHandler | `TABLE_NAME` | DynamoDB table name |
| uploadHandler | `TEXTRACT_LAMBDA` | `invoiceiq-textract-processor` |
| textractProcessor | `BUCKET_NAME` | S3 bucket name |
| textractProcessor | `TABLE_NAME` | DynamoDB table name |
| textractProcessor | `BEDROCK_LAMBDA` | `invoiceiq-bedrock-analyzer` |
| bedrockAnalyzer | `TABLE_NAME` | DynamoDB table name |
| bedrockAnalyzer | `GEMINI_API_KEY` | Google Gemini API key |
| resultsFetcher | `TABLE_NAME` | DynamoDB table name |

---

## 🛣️ Roadmap

- [ ] Cross-invoice anomaly detection using RAG + vector embeddings
- [ ] Support for image invoices (JPEG/PNG) via Textract
- [ ] Batch processing — analyze multiple invoices at once
- [ ] Vendor trust scoring based on historical invoice patterns
- [ ] Slack/email notification integration via SNS
- [ ] Export analysis report as PDF

---

## 👨‍💻 Author

**Rohit Rathod**
- GitHub: [@Rohit-Rathod95](https://github.com/Rohit-Rathod95)
- B.Tech ECE — RCOEM Nagpur (Batch 2027)

---
