# Buget — Personal Finance Manager

A self-hosted personal finance app for analyzing MAIB (Moldova Agroindbank) bank statements. Upload PDF statements, auto-categorize transactions with AI, track expenses, compare periods, and generate tax declarations.

## Features

- **PDF Upload** — parse MAIB bank statements (EUR, USD, MDL accounts)
- **Auto-categorization** — rule-based + AI-powered (Claude API) transaction categorization
- **Dashboard** — income vs expenses charts, category breakdown (donut chart), top expenses
- **Comparison** — compare spending between any two periods, category-by-category
- **Exchange Rates** — BNM (National Bank of Moldova) rates calendar, charts, income conversion
- **Tax Declaration** — automatic tax calculation with deductions
- **AI Analysis** — financial insights powered by Claude
- **Telegram Bot** — upload PDFs and check tax info via Telegram
- **PWA** — installable on mobile as a native app
- **Multi-currency** — EUR, USD, MDL with automatic conversion via BNM rates
- **Dark mode** — with customizable accent colors (22 Tailwind colors)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, SQLAlchemy, SQLite |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Recharts |
| PDF Parsing | pdfplumber (text-based line parsing) |
| AI | Claude API (Haiku) via OpenAI-compatible SDK |
| Bot | python-telegram-bot |
| Deploy | Docker, GitHub Actions, ghcr.io |

## Quick Start with Docker

### 1. Create a directory and config

```bash
mkdir buget && cd buget
curl -O https://raw.githubusercontent.com/pelinoleg/maib-buget/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/pelinoleg/maib-buget/main/.env.example
cp .env.example .env
```

### 2. Edit `.env`

```bash
nano .env
```

Required settings:
- `OPENAI_API_KEY` — for AI categorization (optional, app works without it)
- `TELEGRAM_BOT_TOKEN` — for Telegram bot (optional)

### 3. Start

```bash
docker compose pull
docker compose up -d
```

The app is available at `http://your-server:8454`

### 4. Update

```bash
docker compose pull
docker compose up -d
```

## Local Development

### Prerequisites

- Python 3.12+
- Node.js 22+

### Setup

```bash
# Clone
git clone https://github.com/pelinoleg/maib-buget.git
cd maib-buget

# Environment
cp .env.example .env
# Edit .env — set VITE_API_BASE=http://localhost:8000/api

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000 --host 0.0.0.0

# Frontend (in another terminal)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`

### Local Docker Build

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | Claude/OpenAI API key for AI categorization |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token from @BotFather |
| `TAX_RATE` | `12` | Income tax rate (%) |
| `TAX_CHILD_DEDUCTION` | `9900` | Child tax deduction (MDL) |
| `TAX_PERSONAL_DEDUCTION` | `29700` | Personal tax deduction (MDL) |
| `VITE_DEFAULT_PERIOD` | `last_month` | Default dashboard period |
| `VITE_API_BASE` | `/api` | Backend API URL |
| `VITE_PAGE_SIZE` | `200` | Transactions per page |
| `VITE_BASE_CURRENCY` | `EUR` | Base currency for conversions |
| `COVERAGE_START` | `2025-01` | Start date for upload coverage check |

## Data

All data is stored in the `./data/` directory (Docker volume):
- `buget.db` — SQLite database
- `uploaded_pdfs/` — uploaded PDF files

## License

MIT
