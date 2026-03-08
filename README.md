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

### 1. Create a directory with config files

```bash
mkdir buget && cd buget
```

Create `docker-compose.yml`:

```yaml
services:
  backend:
    image: ghcr.io/pelinoleg/maib-buget-backend:latest
    restart: unless-stopped
    env_file: .env
    environment:
      - DATABASE_URL=sqlite:////data/buget.db
      - UPLOAD_DIR=/data/uploaded_pdfs
    volumes:
      - ./data:/data
    ports:
      - "8453:8000"
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"]
      interval: 30s
      timeout: 5s
      retries: 3

  frontend:
    image: ghcr.io/pelinoleg/maib-buget-frontend:latest
    restart: unless-stopped
    ports:
      - "8454:80"
    depends_on:
      backend:
        condition: service_healthy
```

Create `.env`:

```bash
# AI Categorization (optional — app works without it)
OPENAI_API_KEY=

# Telegram Bot (optional)
TELEGRAM_BOT_TOKEN=

# Tax Declaration
TAX_RATE=12
TAX_CHILD_DEDUCTION=9900
TAX_PERSONAL_DEDUCTION=29700

# Frontend
VITE_DEFAULT_PERIOD=last_month
VITE_PAGE_SIZE=200
VITE_BASE_CURRENCY=EUR
COVERAGE_START=2025-01
```

### 2. Start

```bash
docker compose pull
docker compose up -d
```

The app is available at `http://your-server:8454`

### 3. Update

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
